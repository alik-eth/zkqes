/**
 * V5.2 proof pipeline — sibling of `uaProofPipelineV5.ts`. Mirrors the
 * V5.1 four-stage flow (parse → witness → prove → encode) but consumes
 * the V5.2 SDK surface where the public-signal layout changed:
 *
 *   - V5.1 → V5.2 deltas (cf. `2026-05-01-keccak-on-chain-amendment.md`):
 *       · `msgSender` is dropped (slot 0 in V5.1 → removed in V5.2).
 *       · Four `bindingPk*` 16-byte BE limbs are appended at slots 18-21
 *         (so the contract can recompute keccak(bindingPk) for the
 *         walletDerivationGate, instead of the circuit doing it).
 *       · Net public-signal count: 19 → 22.
 *
 * Browser-side, this means:
 *   - `runV5_2Pipeline()` calls `buildWitnessV5_2` (which delegates to
 *     `buildWitnessV5` for the shared work, then drops msgSender + adds
 *     the four pk limbs).
 *   - `publicSignalsV5_2FromArray` validates the 22-signal shape and
 *     returns a typed `PublicSignalsV5_2`.
 *   - `RegisterArgsV5_2` swaps in the new sig tuple; the calling
 *     component encodes via `zkqesRegistryV5_2Abi` directly.
 *
 * walletSecret derivation (HKDF for EOA, Argon2id for SCW) is UNCHANGED
 * across V5.1 → V5.2 — the rotation auth stays Poseidon₂(walletSecret,
 * ctxHash) on the circuit side. Only the public-signal layout shifted.
 *
 * The V5.1 pipeline (`./uaProofPipelineV5.ts`) is left intact for
 * sibling-not-replace posture: any consumer still on V5.1 (e.g. legacy
 * tests, or reverted-upgrade-path investigations) keeps working.
 */
import { Buffer } from 'buffer';
import { fromBER } from 'asn1js';
import { Certificate } from 'pkijs';
import { buildInclusionPath, zeroHashes } from './merkleLookup';
import {
  MockProver,
  type IProver,
  publicSignalsV5_2FromArray,
  proveV5,
  type CircuitArtifactUrls,
  type PublicSignalsV5_2,
  type RegisterArgsV5_2,
  type Groth16ProofV5_2,
  buildWitnessV5_2,
  parseP7s,
  type CmsExtraction,
  decodeEcdsaSigSequence,
  bytes32ToHex,
  CliProveError,
  type WitnessV5_2,
} from '@zkqes/sdk';
import { SnarkjsWorkerProver } from '@zkqes/sdk/prover/snarkjsWorker';
import { V5_PROVER_ARTIFACTS } from './circuitArtifacts';
import { runCliFirstProver } from './cliFallbackProver';

export type V5_2PipelineStage =
  | 'parse-cades'
  | 'build-witness'
  | 'prove'
  | 'encode-calldata'
  | 'submit'
  | 'mined';

export interface V5_2PipelineProgress {
  stage: V5_2PipelineStage;
  pct: number;
  elapsedMs?: number;
  message?: string;
}

export interface V5_2PipelineOptions {
  /** Set true to bypass real witness build + prove with a canned mock.
   *  Used by Playwright e2e (`VITE_USE_MOCK_PROVER=1`) and for UI
   *  development without the ceremony zkey. Defaults to false. */
  readonly useMockProver?: boolean;
  /** JCS-canonicalized binding bytes (the QKB/2.0 form the user signed
   *  via Diia in Step 2). Required for the real path; ignored by mock.
   *  Step 2 of /ua/registerV5 is responsible for producing these and
   *  threading them through to Step 4 alongside the .p7s. */
  readonly bindingBytes?: Uint8Array;
  /**
   * 32-byte wallet secret (reduced mod BN254 scalar field).
   *
   * For EOA: HKDF-SHA256 over personal_sign("qkb-wallet-secret-v1", wallet).
   * For SCW: Argon2id(passphrase, wallet+chainId salt) — ScwPassphraseModal.
   *
   * Required for the real path; mock path uses Buffer.alloc(32) when absent.
   * Step 4 of /ua/registerV5 derives this via deriveWalletSecretEoa() before
   * calling runV5_2Pipeline().
   */
  readonly walletSecret?: Uint8Array;
  /** Pre-extracted SPKIs. If omitted, the real path falls back to deriving
   *  them from the certs inside the .p7s; pass them explicitly when the
   *  caller has already computed them (e.g. integration tests). */
  readonly leafSpki?: Uint8Array;
  readonly intSpki?: Uint8Array;
  /**
   * Trusted-CA fallback for `.p7s` files that ship a leaf cert only
   * (no embedded intermediate). When `cms.intCertDer` is missing AND
   * `opts.intSpki` is also missing, the pipeline walks `trustedCas.cas`
   * and matches the leaf cert's `issuer` DN against each CA's `subject`
   * DN. The matching CA's DER becomes the intermediate, its SPKI is
   * extracted and used for both the witness and the calldata.
   *
   * Pass the parsed `trusted-cas.json` from
   * `packages/web/public/trusted-cas/trusted-cas.json` (the same file
   * `qesVerify.ts` consumes off-circuit). When omitted and the .p7s
   * lacks the intermediate, the pipeline throws verbatim — no silent
   * fallback to a synthetic SPKI.
   */
  readonly trustedCas?: { cas: ReadonlyArray<{ merkleIndex: number; certDerB64: string }> };
  /**
   * Bundled `/trusted-cas/layers.json` — the per-level Poseidon Merkle
   * tree the registry's `trustedRootHash` was computed over. Pair this
   * with `trustedCas` so the pipeline can build a real
   * `trustMerklePath`/`trustMerklePathBits` for the intermediate CA's
   * leaf and clear the contract's `BadTrustList()` gate. Without
   * layers, the pipeline falls back to all-zero paths (which only
   * verify pre-root-pump or in tests).
   */
  readonly trustedCasLayers?: { depth: number; layers: ReadonlyArray<ReadonlyArray<string>> };
  readonly onProgress?: (p: V5_2PipelineProgress) => void;
  readonly signal?: AbortSignal;
  /**
   * Caller-side gate for the CLI prove path. Pipeline reads this once
   * per `runV5_2Pipeline` call (no internal `detectCli` polling — that's
   * the React `useCliPresence` hook's job). When `true`, the pipeline
   * tries `proveViaCli` first and falls back to in-browser snarkjs on
   * 5xx / 429 / network / malformed responses (per
   * `CliProveError.shouldFallback`). `false` (default) skips the CLI
   * path entirely.
   */
  readonly cliPresent?: boolean;
  /**
   * Callback fired when the CLI was attempted but failed in a way that
   * triggered a browser-prover fallback. The component renders a toast
   * with version-specific copy (`CLI busy`, `CLI server error`, `CLI
   * server stopped`) — see `proveViaCli.ts` header for the canonical
   * mapping. NOT fired on 4xx (those re-throw from the pipeline so the
   * UI surfaces the error verbatim instead of silently retrying).
   */
  readonly onCliFallback?: (err: CliProveError) => void;
}

export interface V5_2PipelineResult {
  readonly publicSignals: PublicSignalsV5_2;
  readonly proof: Groth16ProofV5_2;
  /** Assembled RegisterArgsV5_2 ready for `register()` calldata.
   *  Note: the witness-builder side (signedAttrs raw, leafSpki, intSpki,
   *  leafSig, intSig, merkle paths + bits) is filled with mock zeros
   *  when `useMockProver: true` — the Step 4 component skips submit in
   *  that case. */
  readonly registerArgs: RegisterArgsV5_2;
  /**
   * Discriminator: which prover actually generated the proof.
   *   'cli'     — `proveViaCli` returned a 2xx (CLI was present + healthy)
   *   'browser' — fell back to in-browser snarkjs (CLI absent OR
   *               present-but-failed-with-shouldFallback). Step 4
   *               renders a "proved on CLI" / "proved in browser"
   *               receipt off this field.
   *   'mock'    — mock-prover path (CI / dev without a ceremony zkey).
   */
  readonly source: 'cli' | 'browser' | 'mock';
}

const ZERO_BYTES32 = `0x${'00'.repeat(32)}` as const;
const ZERO_91_BYTES = `0x${'00'.repeat(91)}` as const;

/**
 * Drive the V5.2 pipeline end-to-end, emitting progress at each stage.
 *
 * Mock-prover path (used until V5.2 ceremony + post-§9.4 deploy):
 *   - Skips parsing — caller passes any bytes; we don't introspect.
 *   - Skips witness build — feeds a canned 22-signal publicSignals into
 *     proveV5 via MockProver.
 *   - Returns RegisterArgsV5_2 with mock-zero raw bytes / merkle paths.
 *     The caller MUST NOT submit this to a live registry — Step 4 gates
 *     on `useMockProver` to skip the on-chain submit path.
 *
 * Real path (post-V5.2 ceremony pump):
 *   - parseCades(p7s) to extract leafCert, intermediateCert, signedAttrs, sig
 *   - buildWitnessV5_2({ ..., walletSecret }) to build the V5.2 witness
 *     (delegates to V5.1 builder, then drops msgSender + adds pk limbs)
 *   - proveV5(witness, { prover: SnarkjsProver-via-Worker, artifacts: V5_PROVER_ARTIFACTS })
 *   - publicSignalsV5_2FromArray(result.publicSignals) → typed PublicSignalsV5_2
 *   - assemble RegisterArgsV5_2 with raw signedAttrs, leafSpki, intSpki,
 *     leafSig (r,s), intSig (r,s), merklePath + merklePathBits.
 */
export async function runV5_2Pipeline(
  p7s: Uint8Array,
  opts: V5_2PipelineOptions = {},
): Promise<V5_2PipelineResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const start = Date.now();
  const tick = (stage: V5_2PipelineStage, pct: number, message?: string): void => {
    onProgress({
      stage,
      pct,
      elapsedMs: Date.now() - start,
      ...(message ? { message } : {}),
    });
  };

  if (opts.useMockProver) {
    return runMockPath(p7s, tick);
  }
  return runRealPath(p7s, opts, tick);
}

// Real path — buildWitnessV5_2 (delegates to V5.1 builder + reshapes) →
// snarkjs prove → encode RegisterArgsV5_2. Currently still gated at the
// call site by `isV5ArtifactsConfigured()` (V5.2 zkey/wasm URLs are
// zero-addressed pre-ceremony). Once those land, the only remaining gate
// is the chain deployment (registryV5 != 0x0) and Step 4 will submit on
// success.
async function runRealPath(
  p7s: Uint8Array,
  opts: V5_2PipelineOptions,
  tick: (stage: V5_2PipelineStage, pct: number, message?: string) => void,
): Promise<V5_2PipelineResult> {
  if (!opts.bindingBytes) {
    throw new Error(
      'V5.2 real-prover pipeline requires opts.bindingBytes (the JCS-canonical ' +
        'QKB/2.0 binding the user signed in Step 2). Mock path bypasses this.',
    );
  }
  tick('parse-cades', 5, 'parsing CAdES-BES bundle');
  const cms: CmsExtraction = parseP7s(Buffer.from(p7s));

  // SPKIs: prefer caller-supplied (pre-extracted) over deriving from cert
  // DER. Real-Diia .p7s carries leaf + intermediate certs; we extract via
  // pkijs in `extractSpkiFromCertDer` below.
  const leafSpki = opts.leafSpki
    ? Buffer.from(opts.leafSpki)
    : extractSpkiFromCertDer(cms.leafCertDer);
  const intSpki = opts.intSpki
    ? Buffer.from(opts.intSpki)
    : cms.intCertDer
      ? extractSpkiFromCertDer(cms.intCertDer)
      : opts.trustedCas
        ? resolveIntSpkiFromTrustedCas(cms.leafCertDer, opts.trustedCas)
        : (() => {
            throw new Error(
              'V5.2 real-prover pipeline: no intermediate cert in .p7s, no ' +
                'opts.intSpki override, and no opts.trustedCas to fall back ' +
                'on — cannot compute intSpkiCommit',
            );
          })();

  if (!opts.walletSecret) {
    throw new Error(
      'V5.2 real-prover pipeline requires opts.walletSecret (32-byte wallet secret ' +
        'derived via HKDF for EOA or Argon2id for SCW). Derive with ' +
        'deriveWalletSecretEoa() / deriveWalletSecretScw() before calling runV5_2Pipeline().',
    );
  }
  tick('build-witness', 25, 'building V5.2 witness from binding + CMS');
  const witness = await buildWitnessV5_2({
    bindingBytes: Buffer.from(opts.bindingBytes),
    leafCertDer: cms.leafCertDer,
    leafSpki,
    intSpki,
    signedAttrsDer: cms.signedAttrsDer,
    signedAttrsMdOffset: cms.signedAttrsMdOffset,
    walletSecret: Buffer.from(opts.walletSecret),
  }, {
    // Local-dev escape hatch: when running against the V5.2 stub
    // artifacts (`qkb-v5_2-stub.zkey` + its companion wasm), the
    // V5.3 OID-anchor input signal doesn't exist in the wasm —
    // emitting it triggers snarkjs's "Too many values" error. Set
    // `VITE_V5_OMIT_V5_3_OID_ANCHOR=1` in `packages/web/.env.local`
    // to opt out. Default keeps V5.3-shape so post-ceremony builds
    // are correct.
    omitV53OidAnchor:
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_V5_OMIT_V5_3_OID_ANCHOR === '1',
  });

  // Run the prover. CLI path is preferred when `cliPresent: true` is
  // set by the caller (T2 `useCliPresence` hook); falls back to
  // in-browser snarkjs on 5xx / 429 / network / malformed per
  // `CliProveError.shouldFallback` (orchestration §1.6 fallback
  // discipline). 4xx (witness invalid / origin pin) re-throws so
  // Step 4 can surface verbatim — no silent retry on a witness that's
  // mathematically certain to fail in the browser too.
  const { proofRaw, publicSignalsRaw, source } = await runCliFirstProver(
    witness,
    {
      cliPresent: opts.cliPresent ?? false,
      ...(opts.onCliFallback ? { onCliFallback: opts.onCliFallback } : {}),
      onProgress: (msg) => tick('prove', 35, msg),
      runBrowser: () => runBrowserProver(witness, tick),
    },
  );

  // V5.2's `publicSignalsV5_2FromArray` asserts the 22-element shape
  // here — keeps the cross-package contract tight against any future
  // drift between the SDK's V5.2 layout and what either prover emits.
  const publicSignals = publicSignalsV5_2FromArray(publicSignalsRaw);

  tick('encode-calldata', 90, 'assembling RegisterArgsV5_2');
  const proof: Groth16ProofV5_2 = {
    a: [BigInt(proofRaw.pi_a[0] ?? '0'), BigInt(proofRaw.pi_a[1] ?? '0')] as const,
    // G2 Fp2 limb swap. snarkjs's `pi_b` JSON serializes each Fp2 as
    // [c0, c1] (real first); Solidity Groth16 verifiers (and snarkjs's
    // own `exportSolidityCallData`) expect [c1, c0] (imaginary first).
    // Without the swap, locally-valid proofs revert with `BadProof()`
    // on-chain. See snarkjs#groth16/utils.js → `exportSolidityCallData`.
    b: [
      [BigInt(proofRaw.pi_b[0]?.[1] ?? '0'), BigInt(proofRaw.pi_b[0]?.[0] ?? '0')] as const,
      [BigInt(proofRaw.pi_b[1]?.[1] ?? '0'), BigInt(proofRaw.pi_b[1]?.[0] ?? '0')] as const,
    ] as const,
    c: [BigInt(proofRaw.pi_c[0] ?? '0'), BigInt(proofRaw.pi_c[1] ?? '0')] as const,
  };

  // Trust merkle inclusion path. The contract's `trustedRootHash`
  // gate (BadTrustList revert) verifies that the leaf's intermediate
  // CA is in the registered Merkle tree. Build the path from the
  // bundled `layers.json` keyed by the matched CA's `merkleIndex`.
  // Falls back to all-zero path if `trustedCasLayers` wasn't passed
  // — only useful pre-deploy; live chain rejects.
  let trustPath: RegisterArgsV5_2['trustMerklePath'];
  let trustPathBits = 0n;
  if (opts.trustedCas && opts.trustedCasLayers && cms.intCertDer === undefined) {
    // The intermediate cert was resolved off-chain via trustedCas
    // fallback; reuse that match to get its merkleIndex without a
    // second walk.
    const resolved = resolveIntCertFromTrustedCas(cms.leafCertDer, opts.trustedCas);
    const inclusion = await buildInclusionPathFromLayers(resolved.merkleIndex, opts.trustedCasLayers);
    trustPath = inclusion.path16;
    trustPathBits = inclusion.bits;
  } else if (opts.trustedCas && opts.trustedCasLayers && cms.intCertDer !== undefined) {
    // .p7s embedded the intermediate — locate it in trustedCas by DER
    // equality to recover merkleIndex.
    const wantHex = cms.intCertDer.toString('hex');
    const match = opts.trustedCas.cas.find((ca) =>
      Buffer.from(ca.certDerB64, 'base64').toString('hex') === wantHex,
    );
    if (match) {
      const inclusion = await buildInclusionPathFromLayers(match.merkleIndex, opts.trustedCasLayers);
      trustPath = inclusion.path16;
      trustPathBits = inclusion.bits;
    } else {
      trustPath = Array.from({ length: 16 }, (): `0x${string}` => ZERO_BYTES32) as unknown as RegisterArgsV5_2['trustMerklePath'];
    }
  } else {
    trustPath = Array.from({ length: 16 }, (): `0x${string}` => ZERO_BYTES32) as unknown as RegisterArgsV5_2['trustMerklePath'];
  }
  // Policy merkle path. Until a real policy registry ships, the admin
  // sets `policyRoot` to a depth-16 tree that contains the user's
  // `policyLeafHash` at index 0 with all other leaves = 0. The path
  // siblings for index 0 are exactly the canonical zero-subtree hashes
  // (`zeros[0..15]`) — Poseidon₂(0,0), Poseidon₂(zeros[0], zeros[0]),
  // etc. Bits = 0 (leaf is left-child at every level).
  const policyZeroes = await zeroHashes(16);
  const policyPath16 = (Array.from({ length: 16 }, (_, i) => {
    const z = policyZeroes[i] ?? 0n;
    return `0x${z.toString(16).padStart(64, '0')}` as `0x${string}`;
  })) as unknown as RegisterArgsV5_2['policyMerklePath'];

  // RegisterArgsV5_2 raw-bytes encoding: pkijs gives us Buffer-typed certs
  // and signedAttrs; viem's writeContract accepts `0x${string}` hex.
  const leafSpkiHex = `0x${leafSpki.toString('hex')}` as `0x${string}`;
  const intSpkiHex = `0x${intSpki.toString('hex')}` as `0x${string}`;
  const signedAttrsHex = `0x${cms.signedAttrsDer.toString('hex')}` as `0x${string}`;

  // ECDSA-Sig-Value SEQUENCE decoding for register() calldata — same
  // approach as the V5.1 pipeline (cms.leafSigR for the leaf SignerInfo
  // signature; pkijs unwraps the leaf cert's signatureValue for intSig).
  const leafSigSeq = cms.leafSigR ?? Buffer.alloc(0);
  if (leafSigSeq.length === 0) {
    throw new Error(
      'V5.2 real-prover pipeline: parseP7s returned empty leaf SignerInfo signature',
    );
  }
  const { r: leafR, s: leafS } = decodeEcdsaSigSequence(leafSigSeq);

  const intSigSeq = extractCertSignatureSeq(cms.leafCertDer);
  const { r: intR, s: intS } = decodeEcdsaSigSequence(intSigSeq);

  const registerArgs: RegisterArgsV5_2 = {
    proof,
    sig: publicSignals,
    leafSpki: leafSpkiHex,
    intSpki: intSpkiHex,
    signedAttrs: signedAttrsHex,
    leafSig: [bytes32ToHex(leafR), bytes32ToHex(leafS)] as const,
    intSig: [bytes32ToHex(intR), bytes32ToHex(intS)] as const,
    trustMerklePath: trustPath,
    trustMerklePathBits: trustPathBits,
    policyMerklePath: policyPath16,
    policyMerklePathBits: 0n,
  };

  return { publicSignals, proof, registerArgs, source };
}

/**
 * In-browser snarkjs prover for the given V5.2 witness. Spawns a fresh
 * Web Worker per call and terminates it after the prove (V5_PROVER_ARTIFACTS
 * defines the wasm + zkey URLs). Used as the `runBrowser` callback for
 * `runCliFirstProver` — keeps the snarkjs Worker plumbing out of the
 * fallback dispatch logic so the latter is testable in isolation.
 */
async function runBrowserProver(
  witness: WitnessV5_2,
  tick: (stage: V5_2PipelineStage, pct: number, message?: string) => void,
): Promise<{ proofRaw: import('@zkqes/sdk').Groth16Proof; publicSignalsRaw: string[] }> {
  tick('prove', 50, 'running snarkjs Groth16 prover');
  const artifacts: CircuitArtifactUrls = {
    wasmUrl: V5_PROVER_ARTIFACTS.wasmUrl,
    zkeyUrl: V5_PROVER_ARTIFACTS.zkeyUrl,
    zkeySha256: V5_PROVER_ARTIFACTS.zkeySha256,
  };
  const proverWorker = new Worker(
    new URL('../workers/v5-prover.worker.ts', import.meta.url),
    { type: 'module' },
  );
  const prover: IProver = new SnarkjsWorkerProver({
    worker: proverWorker,
    terminateAfterProve: true,
  });
  const proveResult = await proveV5(witness as Record<string, unknown>, {
    prover,
    artifacts,
  });
  tick('prove', 80);
  return {
    proofRaw: proveResult.proof,
    publicSignalsRaw: proveResult.publicSignals,
  };
}

/**
 * Extract the leaf cert's signatureValue (the CA's ECDSA-Sig-Value
 * SEQUENCE { INTEGER r, INTEGER s } over the leaf TBSCertificate) as
 * raw DER bytes. Same posture as the V5.1 pipeline's helper.
 */
function extractCertSignatureSeq(certDer: Buffer): Buffer {
  const ab = new ArrayBuffer(certDer.length);
  new Uint8Array(ab).set(certDer);
  const asn = fromBER(ab);
  if (asn.offset === -1) {
    throw new Error('extractCertSignatureSeq: invalid BER');
  }
  const cert = new Certificate({ schema: asn.result });
  return Buffer.from(new Uint8Array(cert.signatureValue.valueBlock.valueHexView));
}

/**
 * Extract the 91-byte canonical P-256 SubjectPublicKeyInfo bytes from a
 * cert DER. The witness builder rejects anything other than the exact
 * canonical 91-byte named-curve form; non-conforming CAs would fail
 * `register()`'s SpkiCommit gate anyway.
 */
/**
 * Fallback path: walk the bundled `trusted-cas.json` and find the CA
 * whose `subject` DN matches the leaf's `issuer` DN. Returns the SPKI
 * of that CA cert. Throws if no match — that's a real failure (the CA
 * isn't on our trust list, so the resulting proof would never verify
 * on-chain anyway).
 *
 * Used only when the .p7s ships leaf-only (no embedded intermediate)
 * AND the caller did not pass an explicit `opts.intSpki` override.
 */
function resolveIntSpkiFromTrustedCas(
  leafCertDer: Buffer,
  trustedCas: { cas: ReadonlyArray<{ certDerB64: string }> },
): Buffer {
  return resolveIntCertFromTrustedCas(leafCertDer, trustedCas).spki;
}

/**
 * Same lookup as `resolveIntSpkiFromTrustedCas` but returns the full
 * matched CA's DER, merkleIndex, and SPKI together. Needed for the
 * trust-merkle-path branch where the registry's `trustedRootHash`
 * gate requires a non-zero path.
 */
function resolveIntCertFromTrustedCas(
  leafCertDer: Buffer,
  trustedCas: { cas: ReadonlyArray<{ merkleIndex?: number; certDerB64: string }> },
): { der: Buffer; spki: Buffer; merkleIndex: number } {
  const leafIssuerDer = extractIssuerDerFromCert(leafCertDer);
  const wantHex = bufferToHex(leafIssuerDer);

  // Many QTSPs (Diia notably) ship MULTIPLE intermediate CA certs that
  // share the same subject DN but use different keys (rotation). Subject-
  // DN-only matching can pick the wrong key generation, producing an
  // intSpki whose `spkiCommit` isn't in the trust-list tree → on-chain
  // BadTrustList revert. The CA cert's `subjectKeyIdentifier` (SKI) is
  // the disambiguator: the leaf's `authorityKeyIdentifier` (AKI) keyId
  // points at the exact intermediate that signed it.
  const leafAki = extractAuthorityKeyIdFromCert(leafCertDer);

  // First pass: collect ALL subject-DN matches; if leaf has an AKI,
  // pick the candidate whose SKI matches; otherwise return the first
  // subject-DN match (back-compat behaviour for leaves without AKI).
  const candidates: Array<{ der: Buffer; merkleIndex: number; ski: Buffer | null }> = [];
  for (const ca of trustedCas.cas) {
    let caDer: Buffer;
    try {
      caDer = Buffer.from(ca.certDerB64, 'base64');
    } catch {
      continue;
    }
    let subjDer: Buffer;
    try {
      subjDer = extractSubjectDerFromCert(caDer);
    } catch {
      continue;
    }
    if (bufferToHex(subjDer) !== wantHex) continue;
    const merkleIndex = typeof ca.merkleIndex === 'number' ? ca.merkleIndex : -1;
    const ski = extractSubjectKeyIdFromCert(caDer);
    candidates.push({ der: caDer, merkleIndex, ski });
  }

  if (candidates.length === 0) {
    throw new Error(
      'V5.2 real-prover pipeline: leaf-only .p7s, and the leaf cert\'s issuer ' +
        'DN does not match any CA in trusted-cas.json. The signing CA may not ' +
        'be on our trust list, or the LOTL snapshot is out of date.',
    );
  }

  if (leafAki !== null && candidates.length > 1) {
    const akiHex = bufferToHex(leafAki);
    const exact = candidates.find((c) => c.ski !== null && bufferToHex(c.ski) === akiHex);
    if (exact) {
      return { der: exact.der, spki: extractSpkiFromCertDer(exact.der), merkleIndex: exact.merkleIndex };
    }
    throw new Error(
      `V5.2 real-prover pipeline: ${candidates.length} CA candidates share the leaf's ` +
        `issuer DN (key rotation) but none has a subjectKeyIdentifier matching the leaf's ` +
        `authorityKeyIdentifier (${akiHex}). The signing intermediate may not be in the ` +
        'current LOTL snapshot.',
    );
  }

  const pick = candidates[0]!;
  return { der: pick.der, spki: extractSpkiFromCertDer(pick.der), merkleIndex: pick.merkleIndex };
}

/**
 * Pull the `keyIdentifier` octet string from a certificate's
 * authorityKeyIdentifier extension (OID 2.5.29.35). Returns `null`
 * when the extension is absent or doesn't include a keyIdentifier
 * (the spec also allows authorityCertIssuer + authorityCertSerialNumber
 * variants — none of the QTSPs we ship ship those, but pkijs handles
 * them gracefully).
 */
function extractAuthorityKeyIdFromCert(certDer: Buffer): Buffer | null {
  const ab = new ArrayBuffer(certDer.length);
  new Uint8Array(ab).set(certDer);
  const asn = fromBER(ab);
  if (asn.offset === -1) return null;
  let cert: Certificate;
  try { cert = new Certificate({ schema: asn.result }); } catch { return null; }
  const ext = cert.extensions?.find((e) => e.extnID === '2.5.29.35');
  if (!ext) return null;
  // pkijs parses the AKI extnValue into `parsedValue` (an
  // AuthorityKeyIdentifier object) when its parser recognizes the OID.
  const parsed = (ext as unknown as { parsedValue?: { keyIdentifier?: { valueBlock: { valueHexView: Uint8Array } } } }).parsedValue;
  const keyIdHex = parsed?.keyIdentifier?.valueBlock?.valueHexView;
  if (!keyIdHex) return null;
  return Buffer.from(new Uint8Array(keyIdHex));
}

/**
 * Pull the keyIdentifier from a CA cert's subjectKeyIdentifier
 * extension (OID 2.5.29.14). Returns `null` when absent. Used to
 * disambiguate same-subject-DN CA candidates (key rotation).
 */
function extractSubjectKeyIdFromCert(certDer: Buffer): Buffer | null {
  const ab = new ArrayBuffer(certDer.length);
  new Uint8Array(ab).set(certDer);
  const asn = fromBER(ab);
  if (asn.offset === -1) return null;
  let cert: Certificate;
  try { cert = new Certificate({ schema: asn.result }); } catch { return null; }
  const ext = cert.extensions?.find((e) => e.extnID === '2.5.29.14');
  if (!ext) return null;
  const parsed = (ext as unknown as { parsedValue?: { valueBlock: { valueHexView: Uint8Array } } }).parsedValue;
  const ski = parsed?.valueBlock?.valueHexView;
  if (!ski) return null;
  return Buffer.from(new Uint8Array(ski));
}

/**
 * Pack `merkleLookup.buildInclusionPath` output into the calldata
 * shape `RegisterArgsV5_2` expects: 16 × bytes32 sibling hashes, plus
 * a single uint256 bitmask where bit `i` is 1 iff the leaf was the
 * RIGHT child at level `i` (i.e. the sibling on the LEFT). Matches the
 * V5.2 contract's `_verifyMerklePath` walker direction.
 */
async function buildInclusionPathFromLayers(
  index: number,
  layers: { depth: number; layers: ReadonlyArray<ReadonlyArray<string>> },
): Promise<{
  path16: RegisterArgsV5_2['trustMerklePath'];
  bits: bigint;
}> {
  // `merkleLookup.buildInclusionPath` consumes a mutable LayersFile;
  // shallow-clone the readonly nested arrays into mutable equivalents.
  const layersMut = {
    depth: layers.depth,
    layers: layers.layers.map((l) => l.slice()),
  };
  const proof = await buildInclusionPath(index, layersMut);
  // Pad/truncate path to exactly 16 entries (V5.2 fixed-depth tree).
  const padded: `0x${string}`[] = [];
  for (let i = 0; i < 16; i++) {
    const v = proof.pathHex[i];
    padded.push(v ? (v as `0x${string}`) : ZERO_BYTES32);
  }
  let bits = 0n;
  for (let i = 0; i < 16; i++) {
    if ((proof.indices[i] ?? 0) === 1) bits |= 1n << BigInt(i);
  }
  return {
    path16: padded as unknown as RegisterArgsV5_2['trustMerklePath'],
    bits,
  };
}

function extractIssuerDerFromCert(certDer: Buffer): Buffer {
  const ab = new ArrayBuffer(certDer.length);
  new Uint8Array(ab).set(certDer);
  const asn = fromBER(ab);
  if (asn.offset === -1) throw new Error('extractIssuerDerFromCert: invalid BER');
  const cert = new Certificate({ schema: asn.result });
  return Buffer.from(new Uint8Array(cert.issuer.toSchema().toBER(false)));
}

function extractSubjectDerFromCert(certDer: Buffer): Buffer {
  const ab = new ArrayBuffer(certDer.length);
  new Uint8Array(ab).set(certDer);
  const asn = fromBER(ab);
  if (asn.offset === -1) throw new Error('extractSubjectDerFromCert: invalid BER');
  const cert = new Certificate({ schema: asn.result });
  return Buffer.from(new Uint8Array(cert.subject.toSchema().toBER(false)));
}

function bufferToHex(b: Buffer): string {
  return b.toString('hex');
}

function extractSpkiFromCertDer(certDer: Buffer): Buffer {
  const ab = new ArrayBuffer(certDer.length);
  new Uint8Array(ab).set(certDer);
  const asn = fromBER(ab);
  if (asn.offset === -1) {
    throw new Error('extractSpkiFromCertDer: invalid BER');
  }
  const cert = new Certificate({ schema: asn.result });
  return Buffer.from(new Uint8Array(cert.subjectPublicKeyInfo.toSchema().toBER(false)));
}

async function runMockPath(
  _p7s: Uint8Array,
  tick: (stage: V5_2PipelineStage, pct: number, message?: string) => void,
): Promise<V5_2PipelineResult> {
  tick('parse-cades', 10, 'mock-prover skips real CAdES parsing');
  await delay(20);
  tick('build-witness', 30, 'mock-prover skips real witness build');
  await delay(20);
  tick('prove', 40);

  // Canned 22-signal output — values are deterministic but synthetic.
  // Position-correct per spec §"Public-signal layout V5.1 → V5.2"
  // (FROZEN). msgSender (V5.1 slot 0) is removed; bindingPk* limbs
  // (V5.2 slots 18-21) are appended.
  //
  // Slot map:
  //   0  timestamp
  //   1  nullifier
  //   2-3   ctxHashHi/Lo
  //   4-5   bindingHashHi/Lo
  //   6-7   signedAttrsHashHi/Lo
  //   8-9   leafTbsHashHi/Lo
  //   10 policyLeafHash
  //   11 leafSpkiCommit
  //   12 intSpkiCommit
  //   13 identityFingerprint
  //   14 identityCommitment
  //   15 rotationMode  (= 0, register)
  //   16 rotationOldCommitment (= identityCommitment, register-mode default)
  //   17 rotationNewWallet (synthetic placeholder — register mode doesn't
  //                         enforce a specific wallet here)
  //   18-21 bindingPkXHi/Lo, bindingPkYHi/Lo (V5.2 limbs — synthetic)
  const cannedSignals: PublicSignalsV5_2 = {
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    nullifier: 3n,
    ctxHashHi: 4n, ctxHashLo: 5n,
    bindingHashHi: 6n, bindingHashLo: 7n,
    signedAttrsHashHi: 8n, signedAttrsHashLo: 9n,
    leafTbsHashHi: 10n, leafTbsHashLo: 11n,
    policyLeafHash: 12n,
    leafSpkiCommit: 13n,
    intSpkiCommit: 14n,
    identityFingerprint: 15n,
    identityCommitment: 16n,
    rotationMode: 0n,            // register mode
    rotationOldCommitment: 16n,  // == identityCommitment (register-mode default)
    rotationNewWallet: 1n,
    // V5.2 bindingPk* limbs — synthetic non-zero values, all <2^128.
    bindingPkXHi: 100n,
    bindingPkXLo: 101n,
    bindingPkYHi: 102n,
    bindingPkYLo: 103n,
  };
  const prover: IProver = new MockProver({
    delayMs: 30,
    result: {
      proof: {
        pi_a: ['0x1', '0x2', '0x1'],
        pi_b: [['0x3', '0x4'], ['0x5', '0x6'], ['0x1', '0x0']],
        pi_c: ['0x7', '0x8', '0x1'],
        protocol: 'groth16',
        curve: 'bn128',
      },
      publicSignals: [
        String(cannedSignals.timestamp), '3', '4', '5', '6', '7', '8',
        '9', '10', '11', '12', '13', '14',
        '15', '16', '0', '16', '1',
        '100', '101', '102', '103',
      ],
    },
  });
  const artifacts: CircuitArtifactUrls = {
    wasmUrl: V5_PROVER_ARTIFACTS.wasmUrl,
    zkeyUrl: V5_PROVER_ARTIFACTS.zkeyUrl,
    zkeySha256: V5_PROVER_ARTIFACTS.zkeySha256,
  };
  const proverInput = { publicSignals: cannedSignals } as Record<string, unknown>;
  const proveResult = await proveV5(proverInput, { prover, artifacts });
  tick('prove', 80);

  const publicSignals = publicSignalsV5_2FromArray(proveResult.publicSignals);

  tick('encode-calldata', 95);
  const proof: Groth16ProofV5_2 = {
    a: [BigInt(proveResult.proof.pi_a[0] ?? '0'), BigInt(proveResult.proof.pi_a[1] ?? '0')] as const,
    // G2 Fp2 limb swap — same reason as the real-path pack above.
    b: [
      [BigInt(proveResult.proof.pi_b[0]?.[1] ?? '0'), BigInt(proveResult.proof.pi_b[0]?.[0] ?? '0')] as const,
      [BigInt(proveResult.proof.pi_b[1]?.[1] ?? '0'), BigInt(proveResult.proof.pi_b[1]?.[0] ?? '0')] as const,
    ] as const,
    c: [BigInt(proveResult.proof.pi_c[0] ?? '0'), BigInt(proveResult.proof.pi_c[1] ?? '0')] as const,
  };

  const path16 = Array.from(
    { length: 16 },
    (): `0x${string}` => ZERO_BYTES32,
  ) as unknown as RegisterArgsV5_2['trustMerklePath'];
  const registerArgs: RegisterArgsV5_2 = {
    proof,
    sig: publicSignals,
    leafSpki: ZERO_91_BYTES,
    intSpki: ZERO_91_BYTES,
    signedAttrs: '0x',
    leafSig: [ZERO_BYTES32, ZERO_BYTES32] as const,
    intSig: [ZERO_BYTES32, ZERO_BYTES32] as const,
    trustMerklePath: path16,
    trustMerklePathBits: 0n,
    policyMerklePath: path16,
    policyMerklePathBits: 0n,
  };

  return { publicSignals, proof, registerArgs, source: 'mock' };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
