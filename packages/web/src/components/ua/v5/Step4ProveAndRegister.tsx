import { useState } from 'react';
import { Buffer } from 'buffer';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import {
  deploymentForChainId,
  zkqesRegistryV5_2Abi,
  parseP7s,
  findSubjectSerial,
  CliProveError,
  type RegisterArgsV5_2,
} from '@zkqes/sdk';
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
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

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

export function Step4ProveAndRegister({ p7s, bindingBytes, onBack }: Step4Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const dep = deploymentForChainId(chainId);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const useMockProver =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_USE_MOCK_PROVER === '1';
  const realProverConfigured = isV5ArtifactsConfigured();
  const v5Deployed = !!dep && dep.registryV5 !== ZERO_ADDR;

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
  const { isSuccess: txMined } = useWaitForTransactionReceipt({ hash: txHash });

  const [pipelineDone, setPipelineDone] = useState(false);
  // Captured `RegisterArgsV5_2` from the most recent successful prove
  // run. Lifts the closure-local value out of `runPipelineAndSubmit`
  // so the post-success UI can render a "Download proof.json" button
  // — useful for replay, debugging revert reasons against an Anvil
  // fork, or sharing a witness with circuits-eng without re-proving.
  const [provedArgs, setProvedArgs] = useState<RegisterArgsV5_2 | null>(null);
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
    // V5.2 register() consumes the new 22-field sig tuple. msgSender is
    // dropped from the public signals; the contract recomputes
    // keccak(bindingPk) on-chain from the four proven bindingPk* limbs
    // (slots 18-21) and gates against the caller's address.
    submitRegister(registerArgs);
  };

  /** Fire `register()` with a known-good `RegisterArgsV5_2`. Shared by
   *  the post-prove submission path and the "upload proof.json" replay
   *  path — both produce the same calldata shape; only the source of
   *  the args differs. */
  const submitRegister = (registerArgs: RegisterArgsV5_2): void => {
    if (!v5Deployed) return;
    writeContract({
      address: dep!.registryV5,
      abi: zkqesRegistryV5_2Abi,
      functionName: 'register',
      args: [
        registerArgs.proof,
        registerArgs.sig,
        registerArgs.leafSpki,
        registerArgs.intSpki,
        registerArgs.signedAttrs,
        registerArgs.leafSig,
        registerArgs.intSig,
        registerArgs.trustMerklePath,
        registerArgs.trustMerklePathBits,
        registerArgs.policyMerklePath,
        registerArgs.policyMerklePathBits,
      ],
      // Pin an explicit gas limit. V5.2 register() runs the on-chain
      // Groth16 verifier + ECDSA-via-EIP-7212 + 4 storage writes; on
      // Base Sepolia that lands ~900k–1.2M gas. Leave headroom for
      // calldata-cost variation across QTSP cert sizes. Wagmi's auto-
      // estimation has been observed returning sub-intrinsic values
      // for calldata-heavy txs (~5.5KB here), tripping the node's
      // "intrinsic gas too low" pre-flight reject.
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
   * shape validator (`assertRegisterArgsV5_2Shape` from the SDK)
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
        if (obj.schema !== 'zkqes/register-args/v5_2') {
          throw new Error(
            `unrecognized schema: ${String(obj.schema)} (expected "zkqes/register-args/v5_2")`,
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
        } as unknown as RegisterArgsV5_2;
        setProvedArgs(rehydrated);
        setProofSource('uploaded');
        setPipelineDone(true);
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
      {provedArgs && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => downloadProofJson(provedArgs)}
            className="cv-btn is-ghost is-sm"
            data-testid="v5-download-proof"
          >
            ⤓ Download proof.json
          </button>
          {proofSource === 'uploaded' && v5Deployed && (
            <button
              type="button"
              onClick={() => submitRegister(provedArgs)}
              disabled={txPending}
              className="cv-btn"
              data-testid="v5-submit-uploaded-proof"
            >
              ▶ Submit register() with this proof
            </button>
          )}
        </div>
      )}
      {uploadError && (
        <p role="alert" style={errStyle}>
          {uploadError}
        </p>
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
        {t('registerV5.step4.cta')}
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
 * Serialize a `RegisterArgsV5_2` to JSON and trigger a browser
 * download. `bigint` values (Merkle path bits, public-signal slots) get
 * stringified to decimal — the receiver can rehydrate via `BigInt(...)`
 * keyed off the well-known schema. Includes a small header so out-of-
 * band readers can tell which contract version + chain the args target.
 */
function downloadProofJson(args: RegisterArgsV5_2): void {
  const replacer = (_key: string, value: unknown): unknown =>
    typeof value === 'bigint' ? value.toString() : value;
  const payload = {
    schema: 'zkqes/register-args/v5_2',
    generatedAt: new Date().toISOString(),
    args,
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
