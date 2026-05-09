import { useEffect, useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWalletClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import {
  zkqesRegistryUaAbi,
  zkqesRegistryUaForChainId,
  zkqesCertificateUaAbi,
  parseP7s,
  findSubjectSerial,
  CliProveError,
  type RegisterArgsV7,
  buildAgeWitness,
  packAgeProof,
} from '@zkqes/sdk';
import { SnarkjsWorkerProver } from '@zkqes/sdk/prover/snarkjsWorker';
import { keccak256, encodeAbiParameters, encodePacked, toBytes } from 'viem';
import { V5_4_AGE_ARTIFACTS } from '../../../lib/v5_4AgeArtifacts';
import {
  isV5ArtifactsConfigured,
} from '../../../lib/circuitArtifacts';
import {
  runV5_2Pipeline,
  type V5_2PipelineProgress,
} from '../../../lib/uaProofPipelineV5_2';
import {
  deriveWalletSecretEoa,
  deriveWalletSecretScw,
  isSmartContractWallet,
  type GetCodeClient,
} from '../../../lib/walletSecret';
import { useCliPresence } from '../../../hooks/useCliPresence';
import { useCeremonyPhase } from '../../../hooks/useCeremonyPhase';
import { CliBanner } from './CliBanner';
import { ScwPassphraseModal } from './ScwPassphraseModal';
// Multi-QTSP facade T13: surface `cert.berInput` ZkqesErrors via the
// scope-aware i18n templates from T6. Falls back to the generic
// template when no QTSP scope is in effect (UA-default flow). The
// `t as Interpolator` cast at the call sites is safe — the helper
// only invokes `t(key, optionsObject)`, which both i18next's
// `TFunction` and the test mock support.
import {
  formatCertBerInput,
  useQtspScope,
  type Interpolator,
} from '../../../lib/qtspScope';

export interface Step4Props {
  p7s: Uint8Array;
  /** JCS-canonicalized QKB/2.0 binding bytes from Step 2. Required for the
   *  real prover path; mock prover ignores it. */
  bindingBytes: Uint8Array;
  onBack: () => void;
  /** Default age-opt-in + cutoff lifted from HomeDocument (so refresh
   *  retains state). Step 4 owns the editable UI; these are the
   *  initial values + the changes flow back via callbacks. */
  ageOptIn: boolean;
  onAgeOptInChange: (v: boolean) => void;
  ageCutoffYmd: number;
  onAgeCutoffYmdChange: (v: number) => void;
}


/**
 * Step 4 — produce the V5.2 proof and submit register() to QKBRegistryV5_2.
 *
 * V5.2 (keccak-on-chain amendment): public-signal layout drops msgSender
 * and adds four bindingPk* limbs (22 signals total). The on-chain
 * walletDerivationGate keccaks the limbs to derive the wallet bound to
 * this proof, replacing V5.1's circuit-side keccak. From this component's
 * standpoint nothing about the wallet-secret derivation flow changes —
 * walletSecret is still HKDF (EOA) or Argon2id (SCW); the circuit still
 * consumes it inside Poseidon₂ for the wallet-bound nullifier.
 *
 * Three runtime modes (resolved per session, not toggled mid-flow):
 *
 *   Mock prover + V5.2 deployed (rare; CI):
 *     pipeline runs mock → register() submits with zeroed raw bytes →
 *     contract reverts (Gate 2/3 fail) — useful only for ABI-shape
 *     verification. Not used by Playwright e2e (it stubs writeContract).
 *
 *   Mock prover + V5.2 NOT deployed (default in dev / CI):
 *     pipeline runs mock → registerArgs surfaced to UI → submit is
 *     skipped → user sees "registration simulated" copy.
 *
 *   Real prover + V5.2 deployed (post-§9.4 + V5.2 ceremony):
 *     pipeline runs through the worker → register() submits → wait for
 *     receipt → navigate to /ua/mintNft on success.
 *
 * The UI gates the "Generate proof + register" button on the
 * mode-resolution outcome: configured (real) OR explicit mock toggle.
 */
function explorerTxUrl(chainId: number, txHash: string): string {
  const base =
    chainId === 8453 ? 'https://basescan.org' :
    chainId === 84532 ? 'https://sepolia.basescan.org' :
    chainId === 11155111 ? 'https://sepolia.etherscan.io' :
    'https://etherscan.io';
  return `${base}/tx/${txHash}`;
}

export function Step4ProveAndRegister({
  p7s,
  bindingBytes,
  onBack,
  ageOptIn,
  onAgeOptInChange,
  ageCutoffYmd,
  onAgeCutoffYmdChange,
}: Step4Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const useMockProver =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_USE_MOCK_PROVER === '1';
  const realProverConfigured = isV5ArtifactsConfigured();
  // V5.4 ZKQESRegistryUA — country-bound (UA), supports DOB extraction
  // + proveAge alongside register. The legacy V5.2 registry path stays
  // wired for `dep.registryV5` only as a fallback during migration; new
  // submits target V5.4. Phase B: drop the V5.2 `dep.registryV5` field
  // entirely from `deployments.ts` once landing pages stop linking to it.
  const uaDep = chainId !== undefined ? zkqesRegistryUaForChainId(chainId) : undefined;
  const v5Deployed = !!uaDep;

  // The button is enabled when either (a) the real path is fully
  // ready OR (b) the mock toggle is explicit. This separation keeps
  // the ceremony-pending copy honest while letting the e2e test drive
  // the flow against a non-deployed registry.
  const canProve = useMockProver || realProverConfigured;

  // V5.4 CLI-server presence detection. The hook polls /status at
  // mount + on visibilitychange; status === 'present' switches the
  // pipeline to the CLI prove path with browser fallback on 5xx /
  // 429 / network. CliBanner uses the same hook to decide whether to
  // render the install nudge.
  const cliPresence = useCliPresence();
  const cliPresent = cliPresence.status === 'present';
  // T13: active QTSP scope (or null for UA-default). Drives the
  // `cert.berInput` error template selection inside the catch
  // blocks below — `formatCertBerInput` picks the scoped vs.
  // generic i18n key based on this.
  const qtspScope = useQtspScope();

  const [stage, setStage] = useState<V5_2PipelineProgress | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  /** Source of the proof actually generated. 'cli' = native fast path,
   *  'browser' = in-browser snarkjs, 'mock' = e2e/dev. Set after a
   *  successful pipeline run; surfaced as a small receipt under the CTA. */
  const [proofSource, setProofSource] = useState<'cli' | 'browser' | 'mock' | 'uploaded' | null>(null);
  /** Toast copy emitted by the pipeline when CLI prove failed and
   *  fallback to browser fired. Cleared at start of each new attempt. */
  const [cliFallbackToast, setCliFallbackToast] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending: txPending, error: writeError } =
    useWriteContract();
  const { isSuccess: txMined, data: txReceipt } =
    useWaitForTransactionReceipt({ hash: txHash });

  // V5.6: BindingRebound event signature topic. Present in tx receipt
  // logs when register/registerWithAge rebound an existing binding's
  // pk to a new wallet; absent on first-claim.
  const BINDING_REBOUND_TOPIC = keccak256(
    toBytes('BindingRebound(bytes32,address,address)'),
  );
  const wasRebind = !!(
    txMined &&
    txReceipt?.logs?.some((l) => l.topics?.[0] === BINDING_REBOUND_TOPIC)
  );

  // Independent wagmi write for the V5.4 `proveAge` follow-up tx so the
  // register-tx state (`txHash`, `txMined`, `writeError`) keeps its
  // current UI semantics. The age-tx state lives in a parallel triplet.
  const {
    writeContract: writeAgeContract,
    data: ageTxHash,
    isPending: ageTxPending,
    error: ageWriteError,
  } = useWriteContract();
  const { isSuccess: ageTxMined } = useWaitForTransactionReceipt({ hash: ageTxHash });

  // Third writeContract for the V5.4 cert NFT mint. Independent of
  // register + age txs — it's a manual user action surfaced after the
  // register tx mines.
  const {
    writeContract: writeMintContract,
    data: mintTxHash,
    isPending: mintTxPending,
    error: mintWriteError,
  } = useWriteContract();
  const { isSuccess: mintTxMined } = useWaitForTransactionReceipt({ hash: mintTxHash });

  // V5.4 §1.4 — `nullifierCtx` domain separator. FROZEN ProtocolBytes
  // string; mirrored on-chain in `proveAge` and inside the age circuit
  // (private witness + passthrough public signal). Drift here breaks
  // the contract's nullifierCtx equality gate silently.
  const NULLIFIER_CTX_DOMAIN = 'zkqes-age-ctx-v1';

  // ageOptIn + ageCutoffYmd come from Step 3 via props.
  const [ageStage, setAgeStage] = useState<'idle' | 'proving' | 'submitting' | 'mined' | 'error' | 'skipped'>('idle');
  const [ageError, setAgeError] = useState<string | null>(null);

  // Memoize the age prover (Web Worker) so React StrictMode's double-
  // render in dev doesn't spawn two workers per mount.
  const ageProver = useMemo(() => {
    if (typeof Worker === 'undefined') return null;
    const worker = new Worker(
      new URL('../../../workers/v5-prover.worker.ts', import.meta.url),
      { type: 'module' },
    );
    return new SnarkjsWorkerProver({
      worker,
      terminateAfterProve: true,
    });
  }, []);

  /**
   * Build + prove the V5.4 AgeDiiaUA witness. Returns the packed
   * calldata so callers can either submit a standalone `proveAge()`
   * (replay path) or fold it into a V5.6 atomic `registerWithAge()`.
   */
  const proveAgeOnly = async (
    bindingId: `0x${string}`,
    cutoffYmd: number,
  ): Promise<ReturnType<typeof packAgeProof> | null> => {
    if (!ageProver || !uaDep) return null;
    const nullifierCtxKeccak = keccak256(
      encodePacked(
        ['string', 'bytes32', 'uint256'],
        [NULLIFIER_CTX_DOMAIN, bindingId, BigInt(cutoffYmd)],
      ),
    );
    const witnessOut = await buildAgeWitness({
      signedCades: p7s as unknown as Buffer,
      bindingId,
      ageCutoffDate: cutoffYmd,
      nullifierCtxKeccak,
    });
    const proveResult = await ageProver.prove(witnessOut.witness, {
      side: 'v5',
      wasmUrl: V5_4_AGE_ARTIFACTS.wasmUrl,
      zkeyUrl: V5_4_AGE_ARTIFACTS.zkeyUrl,
    });
    if (witnessOut.publicSignals.ageQualified !== 1) {
      throw new Error(
        `age cutoff ${cutoffYmd} is after the cert's DOB — not eligible (ageQualified=0)`,
      );
    }
    return packAgeProof(proveResult.proof, proveResult.publicSignals);
  };

  // Track `ageTxMined` → 'mined' state transition.
  useEffect(() => {
    if (ageTxMined && ageStage === 'submitting') setAgeStage('mined');
  }, [ageTxMined, ageStage]);

  // V5.6 atomic registerWithAge folds proveAge into the same tx as
  // register, so when the receipt for that single tx lands the age
  // sub-call has already succeeded. Lift the age stage to 'mined'
  // alongside the register tx.
  useEffect(() => {
    if (txMined && ageStage === 'submitting') setAgeStage('mined');
  }, [txMined, ageStage]);

  const [pipelineDone, setPipelineDone] = useState(false);
  // Captured `RegisterArgsV7` from the most recent successful prove
  // run. Lifts the closure-local value out of `runPipelineAndSubmit`
  // so the post-success UI can render a "Download proof.json" button
  // — useful for replay, debugging revert reasons against an Anvil
  // fork, or sharing a witness with circuits-eng without re-proving.
  const [provedArgs, setProvedArgs] = useState<RegisterArgsV7 | null>(null);

  // V5.6 pre-flight: bindingId derived off the proven identityFingerprint;
  // used to read existing binding state and detect a rebind case BEFORE
  // the wallet popup so the button copy + banner can warn the user.
  const provedBindingId = useMemo<`0x${string}` | null>(() => {
    if (!provedArgs) return null;
    return keccak256(
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'uint256' }],
        ['UA', provedArgs.sig.identityFingerprint],
      ),
    );
  }, [provedArgs]);
  const { data: existingBinding } = useReadContract({
    address: uaDep?.address,
    abi: zkqesRegistryUaAbi,
    functionName: 'getBinding',
    args: provedBindingId ? [provedBindingId] : undefined,
    query: { enabled: !!(uaDep && provedBindingId) },
  });
  const existingPk = (existingBinding as { pk?: `0x${string}` } | undefined)?.pk;
  const isRebindCandidate = !!(
    existingPk &&
    existingPk !== '0x0000000000000000000000000000000000000000' &&
    address &&
    existingPk.toLowerCase() !== address.toLowerCase()
  );
  /** Captured V5.4 age-proof output. Populated after `runAgeProveAndSubmit`
   *  succeeds at the prove step (BEFORE the on-chain proveAge submit
   *  fires). Lifted here so the proof.json download includes it and the
   *  upload-replay path can re-submit `proveAge()` without re-proving. */
  const [ageProvedArgs, setAgeProvedArgs] = useState<{
    bindingId: `0x${string}`;
    cutoffYmd: number;
    calldata: ReturnType<typeof packAgeProof>;
  } | null>(null);
  /** Mirror of `pipelineError` for the upload-replay path. Surfaces
   *  shape-validation failures (wrong schema, missing field, malformed
   *  hex) verbatim so the user can fix the file rather than re-prove. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitSkippedReason, setSubmitSkippedReason] = useState<string | null>(
    null,
  );

  // SCW path state. When SCW is detected, we open the passphrase modal
  // and stash the subjectSerial bytes so the modal's onSubmit can derive
  // the wallet-secret without re-parsing the .p7s.
  const [txCopied, setTxCopied] = useState(false);
  const [scwModalOpen, setScwModalOpen] = useState(false);
  const [pendingSubjectSerial, setPendingSubjectSerial] = useState<Uint8Array | null>(null);
  const [scwDeriving, setScwDeriving] = useState(false);

  /**
   * Run the pipeline + write tx given an already-derived walletSecret.
   * Shared between EOA and SCW paths so the post-derivation logic stays
   * in one place.
   */
  /** Map a CliProveError → user-facing toast copy. Three distinct
   *  failure modes per the SDK's status sentinel taxonomy:
   *    - status 0  (network failure / abort) → "CLI server stopped"
   *    - status -1 (server returned malformed 2xx body — server bug,
   *                 not a network outage) → "CLI server error"
   *    - status 429 (transient busy)        → "CLI busy"
   *    - status 5xx (rapidsnark crash, OOM) → "CLI server error"
   *  Mirrors the canonical string set in `proveViaCli.ts` (header
   *  comment) so the discipline is stated once.
   */
  const cliFallbackCopy = (err: CliProveError): string => {
    if (err.status === 0) {
      return t(
        'registerV5.step4.cliFallbackNetwork',
        'CLI server stopped; using browser prover.',
      );
    }
    if (err.status === 429) {
      return t(
        'registerV5.step4.cliFallbackBusy',
        'CLI busy; using browser prover for this proof.',
      );
    }
    // 5xx + status:-1 (malformed body) → both indicate a server-side
    // problem (vs status:0 which is a network/transport problem).
    return t(
      'registerV5.step4.cliFallback5xx',
      'CLI server error; using browser prover.',
    );
  };

  const runPipelineAndSubmit = async (
    walletSecret: Uint8Array | undefined,
    /** Caller-resolved CLI presence. Distinct from the hook's reactive
     *  `cliPresent` because the EOA path resolves it at click time
     *  (after waiting for the 'detecting' probe to settle) and the
     *  SCW path re-reads at modal-completion time — neither matches
     *  the live state on every re-render. */
    cliPresentResolved: boolean,
  ) => {
    setCliFallbackToast(null);
    setProofSource(null);
    // Trusted-CA fallback for leaf-only .p7s files. The pipeline only
    // consults this when `cms.intCertDer` is missing AND no explicit
    // `opts.intSpki` was passed; cheap to fetch eagerly since the file
    // is bundled in /trusted-cas/ and HTTP-cached aggressively.
    const trustedCas = useMockProver
      ? undefined
      : await fetch('/trusted-cas/trusted-cas.json')
          .then((r) => r.json() as Promise<{ cas: ReadonlyArray<{ merkleIndex: number; certDerB64: string }> }>)
          .catch(() => undefined);
    // Fetch the per-level Merkle layers in parallel — needed for the
    // trustMerklePath/trustMerklePathBits inclusion proof against the
    // contract's `trustedRootHash`. Without this the registry reverts
    // with `BadTrustList()`.
    const trustedCasLayers = useMockProver
      ? undefined
      : await fetch('/trusted-cas/layers.json')
          .then((r) => r.json() as Promise<{ depth: number; layers: ReadonlyArray<ReadonlyArray<string>> }>)
          .catch(() => undefined);
    const { registerArgs, source } = await runV5_2Pipeline(p7s, {
      useMockProver,
      bindingBytes,
      cliPresent: cliPresentResolved,
      onCliFallback: (err) => {
        setCliFallbackToast(cliFallbackCopy(err));
      },
      ...(walletSecret !== undefined ? { walletSecret } : {}),
      ...(trustedCas !== undefined ? { trustedCas } : {}),
      ...(trustedCasLayers !== undefined ? { trustedCasLayers } : {}),
      onProgress: setStage,
    });
    setProofSource(source);
    setPipelineDone(true);
    setProvedArgs(registerArgs);
    if (!v5Deployed) {
      setSubmitSkippedReason(t('mintV5.awaitingDeploy'));
      return;
    }
    if (useMockProver) {
      setSubmitSkippedReason(
        'Mock prover used — submit skipped to avoid contract revert.',
      );
      return;
    }

    // V5.6: when the user opted into age-proof, prove age inline + submit
    // an atomic `registerWithAge()` (one tx, one wallet prompt). Falls
    // back to standalone `register()` if age prove fails — the user can
    // retry age via the upload-replay path or the post-mine button.
    let ageCalldata: Awaited<ReturnType<typeof proveAgeOnly>> = null;
    if (ageOptIn && ageProver) {
      const bindingId = keccak256(
        encodeAbiParameters(
          [{ type: 'string' }, { type: 'uint256' }],
          ['UA', registerArgs.sig.identityFingerprint],
        ),
      );
      try {
        setAgeStage('proving');
        ageCalldata = await proveAgeOnly(bindingId, ageCutoffYmd);
        if (ageCalldata) {
          setAgeProvedArgs({ bindingId, cutoffYmd: ageCutoffYmd, calldata: ageCalldata });
          setAgeStage('submitting');
        } else {
          setAgeStage('skipped');
        }
      } catch (err) {
        // Age prove failed — surface error but don't block the register
        // submission. User can retry age standalone post-mine.
        setAgeError(err instanceof Error ? err.message : String(err));
        setAgeStage('error');
        ageCalldata = null;
      }
    } else if (!ageOptIn) {
      setAgeStage('skipped');
    }

    void submitRegister(registerArgs, ageCalldata);
  };

  /** Fire V7 `ZKQESRegistryUA.register(RegisterCall args)` with a
   *  known-good `RegisterArgsV7`. V7 collapses the prior 11 flat
   *  positional args into a single `RegisterCall` struct (per
   *  `2026-05-09-v7-merged-amendment.md` §3.2):
   *    - `chainProof` = { rTL, leafKeyCommit }  (algorithmTag DROPPED)
   *    - `leafProof`  = { a, b, c, ...21-publics }  (V5.5 wire,
   *                     leafKeyCommit @ slot 11, intSpkiCommit dropped)
   *    - `leafSpki`/`intSpki`/`signedAttrs` as `bytes`
   *    - `leafSig`/`intSig` as variable-length `bytes` (was bytes32[2])
   *    - trust + policy merkle paths.
   *  Trusted root must match `chainProof.rTL` — admin rotates via
   *  setTrustedRoot. */
  const submitRegister = async (
    registerArgs: RegisterArgsV7,
    ageCalldata: Awaited<ReturnType<typeof proveAgeOnly>> = null,
  ): Promise<void> => {
    if (!uaDep || !publicClient) return;
    // Read the on-chain `trustedRoot` and use it verbatim for
    // chainProof.rTL — V7 register's Gate 0b reverts NotOnTrustedList
    // if these don't byte-match. Reading at submit time tolerates
    // admin rotations between page loads.
    const rTL = await publicClient.readContract({
      address: uaDep.address,
      abi: zkqesRegistryUaAbi,
      functionName: 'trustedRoot',
    });
    const chainProof = {
      rTL: BigInt(rTL),
      leafKeyCommit: registerArgs.sig.leafKeyCommit,
    };
    const leafProof = {
      a: registerArgs.proof.a,
      b: registerArgs.proof.b,
      c: registerArgs.proof.c,
      ...registerArgs.sig,
    };
    const callStruct = {
      chainProof,
      leafProof,
      leafSpki: registerArgs.leafSpki,
      intSpki: registerArgs.intSpki,
      signedAttrs: registerArgs.signedAttrs,
      leafSig: registerArgs.leafSig,
      intSig: registerArgs.intSig,
      trustMerklePath: registerArgs.trustMerklePath,
      trustMerklePathBits: registerArgs.trustMerklePathBits,
      policyMerklePath: registerArgs.policyMerklePath,
      policyMerklePathBits: registerArgs.policyMerklePathBits,
    };

    if (ageCalldata) {
      // V5.6 atomic path — one tx covers register + proveAge.
      writeContract({
        address: uaDep.address,
        abi: zkqesRegistryUaAbi,
        functionName: 'registerWithAge',
        args: [callStruct, BigInt(ageCutoffYmd), ageCalldata],
        // register (~2.5M ceiling) + proveAge (~1.5M) + bridging
        // overhead — leave headroom for calldata-heavy QTSP certs.
        gas: 4_000_000n,
      });
      return;
    }

    writeContract({
      address: uaDep.address,
      abi: zkqesRegistryUaAbi,
      functionName: 'register',
      args: [callStruct],
      gas: 2_500_000n,
    });
  };

  /**
   * Replay path: upload a `proof.json` previously emitted by the
   * Download button (or by another zkqes client targeting the same
   * V5.2 schema) and skip straight to the on-chain `register()` call.
   * No re-prove, no .p7s/.binding/walletSecret needed.
   *
   * The schema sentinel is `zkqes/register-args/v5_2`. bigint fields
   * are decimal strings on disk; rehydrate via `BigInt(...)`. The
   * shape validator (`assertRegisterArgsV7Shape` from the SDK)
   * catches malformed hex / wrong slot counts before the wallet popup.
   */
  const onUploadProof = (file: File): void => {
    setUploadError(null);
    void (async () => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('proof file is not a JSON object');
        }
        const obj = parsed as Record<string, unknown>;
        // Accept v5_2 (legacy, register-only) AND v5_4 (current,
        // register + optional age). v5_2 files predate the age tx
        // capture so their `age` field is always absent.
        if (
          obj.schema !== 'zkqes/register-args/v5_2' &&
          obj.schema !== 'zkqes/register-args/v5_4'
        ) {
          throw new Error(
            `unrecognized schema: ${String(obj.schema)} (expected "zkqes/register-args/v5_4" or v5_2)`,
          );
        }
        const rawArgs = obj.args;
        if (typeof rawArgs !== 'object' || rawArgs === null) {
          throw new Error('proof.args missing or not an object');
        }
        const a = rawArgs as Record<string, unknown>;
        // Rehydrate the two bigint slots — Merkle path bitmasks. All
        // other numeric fields stay as strings here; viem auto-coerces
        // through the ABI encoder.
        const trustBits = typeof a.trustMerklePathBits === 'string' || typeof a.trustMerklePathBits === 'number'
          ? BigInt(a.trustMerklePathBits)
          : (() => { throw new Error('trustMerklePathBits missing'); })();
        const policyBits = typeof a.policyMerklePathBits === 'string' || typeof a.policyMerklePathBits === 'number'
          ? BigInt(a.policyMerklePathBits)
          : (() => { throw new Error('policyMerklePathBits missing'); })();
        const rehydrated = {
          ...a,
          trustMerklePathBits: trustBits,
          policyMerklePathBits: policyBits,
        } as unknown as RegisterArgsV7;
        setProvedArgs(rehydrated);
        setProofSource('uploaded');
        setPipelineDone(true);
        // Optional age payload — present when the file came from a v5_4
        // run with the age opt-in toggle on. The pack helper's bigint
        // outputs were stringified at download; rehydrate them so the
        // proveAge writeContract sees the correct types.
        const rawAge = obj.age;
        if (typeof rawAge === 'object' && rawAge !== null) {
          const ageObj = rawAge as Record<string, unknown>;
          const cd = ageObj.calldata as Record<string, unknown> | undefined;
          if (cd && typeof ageObj.bindingId === 'string' && typeof ageObj.cutoffYmd === 'number') {
            // packAgeProof's tuple has nested numeric arrays; viem
            // auto-coerces decimal strings inside arrays via the ABI
            // encoder for uint256, so a deep BigInt walk isn't strictly
            // required. The structural shape comes through verbatim.
            setAgeProvedArgs({
              bindingId: ageObj.bindingId as `0x${string}`,
              cutoffYmd: ageObj.cutoffYmd,
              calldata: cd as unknown as ReturnType<typeof packAgeProof>,
            });
          }
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const onProveAndRegister = async () => {
    // Clear ALL prior-attempt state at the top so a retry after a
    // partial success doesn't show stale "proved via" / fallback toast
    // lines. Pre-flight failures (walletNotConnected, parseP7s,
    // SCW cancel) take exit branches BEFORE runPipelineAndSubmit
    // reaches its own clears, so we mirror them here.
    setPipelineError(null);
    setPipelineDone(false);
    setSubmitSkippedReason(null);
    setProofSource(null);
    setCliFallbackToast(null);
    setStage(null);

    // CLI-presence race-fix: the user can click Generate Proof before
    // useCliPresence's mount probe resolves (status === 'detecting').
    // Without this, an immediate click would skip the CLI path even
    // when a local CLI is available. Wait for the probe to settle —
    // bounded by detectCli's 500 ms timeout, so worst case is half a
    // second of perceived delay before either CLI or browser prove
    // starts. Re-checks via cliPresence.recheck() so we don't depend
    // on the hook's render cycle.
    let cliReady = cliPresent;
    if (cliPresence.status === 'detecting' && !useMockProver) {
      const observed = await cliPresence.recheck();
      cliReady = observed === 'present';
    }

    try {
      // ---- wallet-secret derivation (unchanged across V5.1 → V5.2) ----
      // Derive before entering the pipeline so the walletClient prompt
      // appears before the multi-minute prove step (better UX).
      let walletSecret: Uint8Array | undefined;
      if (!useMockProver) {
        if (!walletClient) {
          throw new Error(t('registerV5.step4.walletNotConnected'));
        }
        if (!address) {
          throw new Error(t('registerV5.step4.walletNotConnected'));
        }
        // Quick parse to extract subjectSerial for HKDF signing.
        // The full parse happens again inside runV5_2Pipeline; this
        // pre-parse is fast (~1 ms) and keeps the derivation call
        // before the prover warm-up.
        const cms = parseP7s(Buffer.from(p7s));
        const serial = findSubjectSerial(cms.leafCertDer);
        const subjectSerialBytes = cms.leafCertDer.subarray(
          serial.offset,
          serial.offset + serial.length,
        );

        // SCW detection. If SCW, open passphrase modal and pause here —
        // the modal's onSubmit handler resumes the flow with the
        // Argon2id-derived secret. EOA path continues inline.
        if (publicClient) {
          const scw = await isSmartContractWallet(
            publicClient as unknown as GetCodeClient,
            address,
          );
          if (scw) {
            setPendingSubjectSerial(subjectSerialBytes);
            setScwModalOpen(true);
            return;
          }
        }
        walletSecret = await deriveWalletSecretEoa(walletClient, subjectSerialBytes);
      }

      // Single submit path for EOA + mock — SCW path returned early above
      // and resumes through onScwPassphraseSubmit.
      await runPipelineAndSubmit(walletSecret, cliReady);
    } catch (err) {
      setPipelineError(formatCertBerInput(err, qtspScope, t as Interpolator));
    }
  };

  /** Tear down all SCW-related state. Called from every exit branch
   *  (success, cancel, guard-fail, derive-error) so we never leave the
   *  modal mounted or `pendingSubjectSerial` orphaned across a retry. */
  const resetScwState = () => {
    setScwModalOpen(false);
    setPendingSubjectSerial(null);
    setScwDeriving(false);
  };

  /**
   * Modal callback: user has entered a passphrase that meets the strength
   * threshold. Run Argon2id to derive the SCW wallet-secret, close modal,
   * resume the pipeline. Errors are surfaced as inline pipeline-error.
   */
  const onScwPassphraseSubmit = async (passphrase: string) => {
    if (!address || !pendingSubjectSerial) {
      setPipelineError(t('registerV5.step4.walletNotConnected'));
      resetScwState();
      return;
    }
    setScwDeriving(true);
    try {
      const secret = await deriveWalletSecretScw(passphrase, address);
      resetScwState();
      // Re-read CLI presence at SCW-completion time. The user spent
      // a few seconds in the passphrase modal — the hook may have
      // resolved 'detecting' → 'present'/'absent' in the interim.
      // Re-checking here gives us a fresh observation without
      // depending on the React render cycle.
      const observed = await cliPresence.recheck();
      await runPipelineAndSubmit(secret, observed === 'present');
    } catch (err) {
      resetScwState();
      setPipelineError(formatCertBerInput(err, qtspScope, t as Interpolator));
    }
  };

  /** Modal cancel — user opted to switch to an EOA instead. */
  const onScwPassphraseCancel = () => {
    resetScwState();
    setPipelineError(t('scwPassphrase.optedOut'));
  };

  // On successful registration tx, navigate to mint flow.
  if (txMined) {
    void navigate({ to: '/ua/mintNft' });
  }

  // Civic-terminal v2 tokens — heading uses VT323 display, body/status
  // uses IBM Plex Mono with --ct-mute for muted lines, --err for alerts.
  const headingStyle: React.CSSProperties = {
    fontFamily: 'var(--display)',
    fontSize: '36px',
    lineHeight: 1,
    margin: 0,
    color: 'var(--ct-ink)',
  };
  const bodyStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: '14px',
    lineHeight: 1.5,
    maxWidth: '60ch',
    color: 'var(--ct-ink)',
  };
  const statusStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: '13px',
    color: 'var(--ct-mute)',
  };
  const errStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: '13px',
    color: 'var(--err)',
  };
  const monoXsStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: '12px',
    color: 'var(--ct-mute)',
  };

  return (
    <section
      aria-labelledby="step4-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <h2 id="step4-heading" style={headingStyle}>
        {t('registerV5.step4.title')}
      </h2>
      <p style={bodyStyle}>
        {p7s.byteLength.toLocaleString()} bytes
        {address ? ` — ${address.slice(0, 6)}…${address.slice(-4)}` : ''}
      </p>
      {/* Age-proof opt-in card. Renders ABOVE the prove button so
          the user picks the cutoff before kicking off the proof.
          Disabled once the prove or age pipelines are in flight to
          stop a mid-run cutoff change desyncing the witness from the
          tx args. */}
      {uaDep && (
        <div style={{
          border: '2px solid var(--cv-ink)', background: '#fff',
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
          fontFamily: 'var(--cv-mono)', fontSize: 13,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
            <input
              type="checkbox"
              checked={ageOptIn}
              disabled={pipelineDone || stage !== null}
              onChange={(e) => onAgeOptInChange(e.target.checked)}
              data-testid="v5-age-optin"
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontWeight: 700 }}>also prove age ≥</span>
            <input
              type="number"
              min={1}
              max={120}
              value={(() => {
                const today = new Date();
                const cutoff = new Date(
                  Math.floor(ageCutoffYmd / 10000),
                  Math.floor((ageCutoffYmd % 10000) / 100) - 1,
                  ageCutoffYmd % 100,
                );
                let years = today.getFullYear() - cutoff.getFullYear();
                if (
                  today.getMonth() < cutoff.getMonth() ||
                  (today.getMonth() === cutoff.getMonth() && today.getDate() < cutoff.getDate())
                ) years -= 1;
                return years;
              })()}
              onChange={(e) => {
                const years = Math.max(1, Math.min(120, Number(e.target.value) || 18));
                const d = new Date();
                d.setFullYear(d.getFullYear() - years);
                const ymd = Number(
                  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
                );
                onAgeCutoffYmdChange(ymd);
              }}
              disabled={pipelineDone || stage !== null}
              style={{
                width: 50, padding: '2px 6px', fontFamily: 'var(--cv-mono)', fontSize: 13,
                border: '1.5px solid var(--cv-ink)',
              }}
            />
            <span>years (cutoff {ageCutoffYmd})</span>
          </label>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--cv-mute)', lineHeight: 1.4 }}>
            Optional. Same .p7s, ~14s extra prove + a 2nd tx after register
            mines. Sets <code>ageProvenCutoffs[binding][cutoff] = true</code> on
            chain — verifiers query that flag without ever seeing your DOB.
          </p>
        </div>
      )}
      {/* CLI nudge banner. Self-suppresses when CLI is detected,
          dismissed, or still detecting — see CliBanner.tsx. */}
      <CliBanner />
      {!canProve && <CeremonyPendingPanel />}
      {(stage || pipelineDone) && (
        <PipelineStageList stage={stage} done={pipelineDone} />
      )}
      {pipelineError && (
        <p role="alert" style={errStyle}>
          {pipelineError}
        </p>
      )}
      {cliFallbackToast && (
        <p role="status" data-testid="v5-cli-fallback-toast" style={statusStyle}>
          {cliFallbackToast}
        </p>
      )}
      {proofSource && (
        <p role="status" data-testid="v5-proof-source" style={monoXsStyle}>
          proved via: {proofSource}
        </p>
      )}
      {isRebindCandidate && existingPk && (
        <div
          role="status"
          data-testid="v5-rebind-notice"
          style={{
            border: '2px solid var(--cv-ink)',
            background: '#fff8d6',
            padding: '10px 12px',
            fontFamily: 'var(--cv-mono)',
            fontSize: 12.5,
            color: 'var(--cv-ink)',
          }}
        >
          {t(
            'registerV5.step4.rebindNotice',
            'An existing binding for this identity is bound to {{oldPk}}. Submitting will rebind it to your connected wallet ({{newPk}}).',
            { oldPk: `${existingPk.slice(0, 6)}…${existingPk.slice(-4)}`, newPk: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '?' },
          )}
        </div>
      )}
      {wasRebind && (
        <p
          role="status"
          data-testid="v5-rebind-success"
          style={{ ...statusStyle, color: '#2e7d32' }}
        >
          {t(
            'registerV5.step4.rebindSuccess',
            '✓ Rebound to this wallet. Existing nullifier + age cutoffs preserved.',
          )}
        </p>
      )}
      {provedArgs && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => downloadProofJson(provedArgs, ageProvedArgs)}
            className="cv-btn is-ghost is-sm"
            data-testid="v5-download-proof"
          >
            ⤓ Download proof.json
          </button>
          {proofSource === 'uploaded' && v5Deployed && (
            <button
              type="button"
              onClick={() =>
                void submitRegister(
                  provedArgs,
                  ageProvedArgs?.calldata ?? null,
                )
              }
              disabled={txPending}
              className="cv-btn"
              data-testid="v5-submit-uploaded-proof"
            >
              {isRebindCandidate
                ? t('registerV5.step4.replayRebind', '▶ Submit rebind() with this proof')
                : ageProvedArgs
                  ? t('registerV5.step4.replayWithAge', '▶ Submit register + age (1 tx)')
                  : t('registerV5.step4.replay', '▶ Submit register() with this proof')}
            </button>
          )}
          {proofSource === 'uploaded' && v5Deployed && ageProvedArgs && uaDep && (
            <button
              type="button"
              onClick={() => {
                if (!ageProvedArgs) return;
                writeAgeContract({
                  address: uaDep.address,
                  abi: zkqesRegistryUaAbi,
                  functionName: 'proveAge',
                  args: [
                    ageProvedArgs.bindingId,
                    BigInt(ageProvedArgs.cutoffYmd),
                    ageProvedArgs.calldata,
                  ],
                  gas: 1_500_000n,
                });
              }}
              disabled={ageTxPending}
              className="cv-btn"
              data-testid="v5-submit-uploaded-age-proof"
            >
              ▶ Submit proveAge() with this proof
            </button>
          )}
        </div>
      )}
      {uploadError && (
        <p role="alert" style={errStyle}>
          {uploadError}
        </p>
      )}
      {ageOptIn && uaDep && ageStage !== 'idle' && ageStage !== 'skipped' && (
        <div style={{
          border: '2px solid var(--cv-ink)', background: '#fff',
          padding: '10px 12px', fontFamily: 'var(--cv-mono)', fontSize: 12.5,
          color: ageStage === 'error' ? 'var(--err)' : ageStage === 'mined' ? '#2e7d32' : 'var(--cv-ink)',
        }}>
          age proof (cutoff {ageCutoffYmd}): <b>{ageStage}</b>
          {ageTxHash && <> · tx: {ageTxHash.slice(0, 12)}…</>}
          {ageError && <> · {ageError}</>}
          {ageWriteError && <> · {ageWriteError.message.slice(0, 80)}</>}
        </div>
      )}
      {/* V5.4 cert NFT mint card. Renders only after the register tx
          mines (so the bindingId exists in registry storage); still
          opt-in (user clicks the button explicitly). The nullifier
          uniqueness gate is on-chain, so re-clicks revert. */}
      {txMined && uaDep?.certificate && provedArgs && (
        <div style={{
          border: '2px solid var(--cv-ink)', background: '#fff',
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
          fontFamily: 'var(--cv-mono)', fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>↗ Mint certificate NFT</span>
            <span style={{ color: 'var(--cv-mute)', fontSize: 11.5 }}>
              ERC-721 · 1 per binding · transferable
            </span>
          </div>
          <button
            type="button"
            disabled={mintTxPending || mintTxMined}
            onClick={() => {
              if (!uaDep?.certificate || !provedArgs) return;
              const bindingId = keccak256(
                encodeAbiParameters(
                  [{ type: 'string' }, { type: 'uint256' }],
                  ['UA', provedArgs.sig.identityFingerprint],
                ),
              );
              writeMintContract({
                address: uaDep.certificate,
                abi: zkqesCertificateUaAbi,
                functionName: 'mint',
                args: [bindingId],
                gas: 500_000n,
              });
            }}
            className="cv-btn"
            style={{ alignSelf: 'flex-start' }}
            data-testid="v5-mint-cert-cta"
          >
            {mintTxMined ? '✓ Minted' : mintTxPending ? '⌛ Minting…' : '▶ Mint certificate'}
          </button>
          {mintTxHash && (
            <p style={{
              margin: 0, fontSize: 12, color: mintTxMined ? '#2e7d32' : 'var(--cv-ink)',
            }}>
              tx: {mintTxHash.slice(0, 12)}… {mintTxMined ? '· mined' : '· pending'}
            </p>
          )}
          {mintWriteError && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--err)' }}>
              {mintWriteError.message.slice(0, 200)}
            </p>
          )}
        </div>
      )}
      {!pipelineDone && (
        <label
          className="cv-btn is-ghost is-sm"
          style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
          data-testid="v5-upload-proof-cta"
        >
          ⤒ Upload existing proof.json (skip prove)
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadProof(f);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>
      )}
      {pipelineDone && submitSkippedReason && (
        <p role="status" data-testid="v5-submit-skipped" style={statusStyle}>
          {submitSkippedReason}
        </p>
      )}
      {txHash && (
        <div data-testid="v5-tx-hash" style={{ ...monoXsStyle, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span>tx: {txHash.slice(0, 12)}…</span>
          <button
            type="button"
            className="ct-btn ct-btn--sm ct-btn--ghost"
            onClick={() => {
              navigator.clipboard?.writeText(txHash).catch(() => {});
              setTxCopied(true);
              window.setTimeout(() => setTxCopied(false), 1500);
            }}
            data-testid="v5-tx-copy"
          >
            {txCopied ? '✓ copied' : '⧉ copy'}
          </button>
          <a
            href={explorerTxUrl(chainId, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="ct-btn ct-btn--sm ct-btn--ghost"
            data-testid="v5-tx-explorer"
          >
            ↗ explorer
          </a>
        </div>
      )}
      {writeError && (
        <p role="alert" style={errStyle}>
          {writeError.message}
        </p>
      )}
      <button
        type="button"
        onClick={onProveAndRegister}
        disabled={!canProve || txPending}
        data-testid="v5-prove-register-cta"
        className="cv-btn"
        style={{
          opacity: !canProve || txPending ? 0.5 : 1,
          cursor: !canProve || txPending ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {isRebindCandidate
          ? t('registerV5.step4.ctaRebind', '▶ Prove + rebind to this wallet')
          : ageOptIn
            ? t('registerV5.step4.ctaWithAge', '▶ Prove + register + prove age (1 tx)')
            : t('registerV5.step4.cta')}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="cv-btn is-ghost"
        style={{ alignSelf: 'flex-start' }}
      >
        {t('registerV5.step4.back')}
      </button>
      {/* SCW passphrase modal — only mounted when we've detected an SCW
          and need a passphrase to derive the wallet-secret via Argon2id.
          Hidden when `open=false` (no DOM cost on the EOA path). */}
      {address && (
        <ScwPassphraseModal
          open={scwModalOpen}
          walletAddress={address}
          onSubmit={onScwPassphraseSubmit}
          onCancel={onScwPassphraseCancel}
          isDeriving={scwDeriving}
        />
      )}
    </section>
  );
}

/**
 * Single big PROVE progress card. Parse-CAdES / build-witness / encode-
 * calldata each take <1s and nobody cares about them — only the proof
 * matters (~14s CLI / ~5min browser, V5.3 ~3.9M constraints). Submit +
 * mined are post-prove blockchain UX surfaced separately via the txHash
 * line above.
 *
 * States:
 *   - prep    (parse-cades / build-witness / encode-calldata): "Preparing inputs…"
 *   - proving (prove): big % + elapsed seconds
 *   - posting (submit / mined): "✓ Proof generated. Waiting on wallet…"
 *   - done    (`done` flag): "✓ Proof generated in Xs"
 */
/**
 * Serialize a `RegisterArgsV7` to JSON and trigger a browser
 * download. `bigint` values (Merkle path bits, public-signal slots) get
 * stringified to decimal — the receiver can rehydrate via `BigInt(...)`
 * keyed off the well-known schema. Includes a small header so out-of-
 * band readers can tell which contract version + chain the args target.
 */
function downloadProofJson(
  args: RegisterArgsV7,
  age: {
    bindingId: `0x${string}`;
    cutoffYmd: number;
    calldata: ReturnType<typeof packAgeProof>;
  } | null,
): void {
  const replacer = (_key: string, value: unknown): unknown =>
    typeof value === 'bigint' ? value.toString() : value;
  const payload = {
    schema: 'zkqes/register-args/v5_4',
    generatedAt: new Date().toISOString(),
    args,
    ...(age ? { age } : {}),
  };
  const json = JSON.stringify(payload, replacer, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zkqes-proof-${Date.now()}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Brutalist proving panel — 4-row active-flow header + hatched
 * separator + huge % readout + diagonal-striped progress bar (UA
 * yellow/blue). Mirrors the locked mockup. Submit/mined detail
 * surfaces below via the existing txHash + writeError lines.
 */
function PipelineStageList({
  stage,
  done,
}: {
  stage: V5_2PipelineProgress | null;
  done: boolean;
}) {
  type Phase = 'prep' | 'proving' | 'posting' | 'done';
  let phase: Phase = 'prep';
  if (done) phase = 'done';
  else if (stage?.stage === 'prove') phase = 'proving';
  else if (stage && (stage.stage === 'submit' || stage.stage === 'mined')) phase = 'posting';

  const elapsedSec = stage?.elapsedMs ? stage.elapsedMs / 1000 : null;
  const pct =
    phase === 'done' ? 100 :
    phase === 'posting' ? 100 :
    phase === 'proving' && stage?.stage === 'prove' ? Math.max(0, Math.min(100, Math.round(stage.pct))) :
    0;

  // ETA from linear extrapolation of prove progress; only valid for
  // phase==='proving' && pct in (0, 100).
  let etaText = '—';
  if (phase === 'proving' && pct > 1 && pct < 100 && elapsedSec) {
    const totalSec = elapsedSec * (100 / pct);
    const remaining = Math.max(0, totalSec - elapsedSec);
    const m = Math.floor(remaining / 60);
    const s = Math.round(remaining % 60);
    etaText = m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  } else if (phase === 'done') etaText = '0s';
  else if (phase === 'posting') etaText = 'on chain…';

  // Best-effort heap reading. Chrome-only (`performance.memory`); other
  // browsers report '—'. Static "/ 38 GB" hint is the V5.3 snarkjs peak.
  const perfMem = (typeof performance !== 'undefined'
    ? (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
    : undefined);
  const usedGib = perfMem?.usedJSHeapSize ? (perfMem.usedJSHeapSize / (1024 ** 3)).toFixed(1) : null;

  const phaseLabel: Record<Phase, string> = {
    prep: 'PREPARING INPUTS',
    proving: 'GENERATING ZK-PROOF',
    posting: 'PROOF READY · ANCHORING',
    done: 'PROOF GENERATED',
  };

  return (
    <div data-testid="v5-pipeline-stage" style={{
      border: '2px solid var(--cv-ink)',
      background: '#fff',
      padding: '14px 16px',
      fontFamily: 'var(--cv-mono)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--cv-mute)',
      }}>
        <span style={{
          width: 10, height: 10, background: 'var(--cv-ua-blue)',
          border: '1.5px solid var(--cv-ink)', flex: 'none',
        }} />
        <span style={{ color: 'var(--cv-ink)', fontWeight: 700 }}>active flow · register a wallet</span>
      </div>

      {/* Hatched separator */}
      <div style={{
        height: 10,
        background: 'repeating-linear-gradient(45deg, var(--cv-ink) 0 6px, transparent 6px 12px)',
        border: '2px solid var(--cv-ink)',
      }} />

      {/* Big % + meta row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'baseline', gap: 18,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
        }}>
          <span style={{
            fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: .9,
            color: 'var(--cv-ua-blue)', letterSpacing: '.02em',
          }}>
            {String(pct).padStart(3, '0')}
          </span>
          <span style={{
            fontFamily: 'var(--cv-mono)', fontSize: 18, color: 'var(--cv-ink)', fontWeight: 700,
          }}>%</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap',
          fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-mute)',
          letterSpacing: '.04em',
        }}>
          <span><b style={{ color: 'var(--cv-ink)' }}>{phaseLabel[phase]}</b></span>
          {phase === 'proving' && (
            <>
              <span>RAM <b style={{ color: 'var(--cv-ink)' }}>{usedGib ?? '—'}</b> / 38 GB</span>
              <span>ETA <b style={{ color: 'var(--cv-ink)' }}>{etaText}</b></span>
            </>
          )}
          {phase === 'done' && elapsedSec && (
            <span>elapsed <b style={{ color: '#2e7d32' }}>{elapsedSec.toFixed(1)}s</b></span>
          )}
        </div>
      </div>

      {/* Diagonal-striped progress bar */}
      <div style={{
        height: 22, border: '2px solid var(--cv-ink)', background: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: 'repeating-linear-gradient(45deg, var(--cv-ua-yellow) 0 10px, var(--cv-ua-blue) 10px 20px)',
          transition: 'width .25s linear',
        }} />
      </div>

      {/* Status line — what's happening, in plain terms */}
      <p style={{
        margin: 0, fontSize: 12.5, color: '#5b5648', lineHeight: 1.5,
      }}>
        {phase === 'prep' && 'parsing .p7s, building witness, packing calldata — sub-second.'}
        {phase === 'proving' && (stage?.message ?? 'V5.3 ~3.9M-constraint Groth16. CLI ~14s · browser ~5 min.')}
        {phase === 'posting' && (stage?.stage === 'mined' ? 'mined.' : 'waiting on wallet to submit register()…')}
        {phase === 'done' && 'proof ready. anchor it on Base Sepolia below.'}
      </p>
    </div>
  );
}

/**
 * Brutalist "ceremony pending" panel — same visual grammar as the
 * proving panel above. Shows current ceremony round / total rounds as
 * a percentage, with the recruiting/contributing/finalizing phase
 * label and a striped progress bar.
 *
 * This block renders when `canProve === false`: either the ceremony
 * isn't done yet (the common case) or the build is missing real-prover
 * artifact URLs. Either way the user can't fire the prove button — we
 * surface why, and how far along the trusted setup is.
 */
function CeremonyPendingPanel() {
  const { t } = useTranslation();
  const { phase, status } = useCeremonyPhase();
  const round = status?.round ?? 0;
  const total = status?.totalRounds ?? 0;
  const pct =
    total > 0 ? Math.max(0, Math.min(100, Math.round((round / total) * 100))) : 0;

  const phaseLabel =
    phase === 'live' ? 'LIVE — REFRESH'
    : phase === 'ceremony-live' ? 'CONTRIBUTING'
    : 'RECRUITING';

  const meta =
    total > 0 ? `round ${round} / ${total}` : 'awaiting first contributor';

  return (
    <div data-testid="v5-ceremony-pending" style={{
      border: '2px solid var(--cv-ink)',
      background: '#fff',
      padding: '14px 16px',
      fontFamily: 'var(--cv-mono)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--cv-mute)',
      }}>
        <span style={{
          width: 10, height: 10, background: 'var(--cv-ua-yellow)',
          border: '1.5px solid var(--cv-ink)', flex: 'none',
        }} />
        <span style={{ color: 'var(--cv-ink)', fontWeight: 700 }}>
          ceremony · trusted setup
        </span>
      </div>

      <div style={{
        height: 10,
        background: 'repeating-linear-gradient(45deg, var(--cv-ink) 0 6px, transparent 6px 12px)',
        border: '2px solid var(--cv-ink)',
      }} />

      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'baseline', gap: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: .9,
            color: 'var(--cv-ua-blue)', letterSpacing: '.02em',
          }}>
            {String(pct).padStart(3, '0')}
          </span>
          <span style={{
            fontFamily: 'var(--cv-mono)', fontSize: 18, color: 'var(--cv-ink)', fontWeight: 700,
          }}>%</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap',
          fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-mute)',
          letterSpacing: '.04em',
        }}>
          <span><b style={{ color: 'var(--cv-ink)' }}>{phaseLabel}</b></span>
          <span><b style={{ color: 'var(--cv-ink)' }}>{meta}</b></span>
        </div>
      </div>

      <div style={{
        height: 22, border: '2px solid var(--cv-ink)', background: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: 'repeating-linear-gradient(45deg, var(--cv-ua-yellow) 0 10px, var(--cv-ua-blue) 10px 20px)',
          transition: 'width .25s linear',
        }} />
      </div>

      <p style={{
        margin: 0, fontSize: 12.5, color: '#5b5648', lineHeight: 1.5,
      }}>
        {t('registerV5.step4.ceremonyPending')}
      </p>
    </div>
  );
}
