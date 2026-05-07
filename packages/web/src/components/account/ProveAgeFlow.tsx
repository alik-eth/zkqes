// ProveAgeFlow — V5.4 age verification surface (civic-terminal v3 chrome).
//
// Spec ref: docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md §6.
// Plan ref: docs/superpowers/plans/2026-05-05-zkqes-v5_4-web.md T3.
// Orchestration ref: docs/superpowers/plans/2026-05-05-zkqes-v5_4-orchestration.md §1.4, §1.6.
//
// Phase A skeleton — civic-terminal v3 chrome wraps a 4-step state
// machine (cutoff → p7s upload → prove → result). Phase C will wire:
//   - the binding picker (reads on-chain `getBinding()` for the
//     connected wallet's bindings; today the bindingId comes from a
//     stub state field — first-binding lookup lands when
//     ZKQES_REGISTRY_UA deploys per task T5).
//   - the on-chain `proveAge` writeContract submission (today the
//     submit step renders a Phase-C placeholder panel).
//
// Chrome family: hybrid of Verify A Lookup (cutoff form pattern) +
// Rotate B Diagram (chrome wraps step machine). 720px column matches
// Rotate B; Marquee + FooterRibbon shared with the v3 surface family.
//
// Invariant #10 doesn't apply here — there's no wallet rotation; the
// wagmi `useAccount().address` is the connected wallet for the
// nullifierCtx-binding lookup, period.
//
// Cross-worker contract surface honored:
//   §1.4 — `nullifierCtx = keccak256(abi.encodePacked("zkqes-age-ctx-v1",
//          bindingId, ageCutoffDate))`. Computed HERE at the UI layer
//          using viem; passed to `buildAgeWitness` per §1.6 (SDK does
//          NOT derive it).
//   §1.3 — public-signal triple emitted by AgeDiiaUA (slot order
//          ageQualified / ageCutoffDate / nullifierCtx).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { encodePacked, keccak256 } from 'viem';

import {
  buildAgeWitness,
  MockProver,
  packAgeProof,
  zkqesRegistryUaAbi,
  zkqesRegistryUaForChainId,
  type AgePublicSignals,
  type Groth16Proof,
  type IProver,
} from '@zkqes/sdk';

import { Marquee } from '../civic-terminal/Marquee';
import { FooterRibbon } from '../civic-terminal/FooterRibbon';
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { useV5_4BindingsForWallet } from '../../hooks/useV5_4BindingsForWallet';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

/**
 * V5.4 nullifierCtx domain string. Frozen ProtocolBytes literal —
 * NEVER renamed per orchestration §1.4 / repo-root CLAUDE.md ProtocolBytes
 * invariant. Three sites compute the same keccak: SDK (via this UI),
 * circuit (private witness), contract (`proveAge` verification). Drift
 * here breaks the on-chain proveAge silently.
 */
const NULLIFIER_CTX_DOMAIN = 'zkqes-age-ctx-v1';

/** Default cutoff = today − 18y (YYYYMMDD). */
function defaultCutoffYmd(now: Date = new Date()): number {
  const y = now.getUTCFullYear() - 18;
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
}

/** Convert a YYYY-MM-DD `<input type="date">` value to YYYYMMDD integer. */
function dateInputToYmd(input: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  // The regex with capture groups guarantees m[1..3] are defined when
  // m is non-null; non-null assertions silence strict-mode possibly-
  // undefined.
  return Number(m[1]! + m[2]! + m[3]!);
}

/** Convert YYYYMMDD → YYYY-MM-DD for `<input type="date">` value. */
function ymdToDateInput(ymd: number): string {
  const s = String(ymd).padStart(8, '0');
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * Compute the V5.4 §1.4 nullifierCtx keccak. Mirrors the on-chain
 * `proveAge` derivation byte-for-byte. The string literal is the
 * frozen ProtocolBytes domain — see `NULLIFIER_CTX_DOMAIN` JSDoc.
 */
function computeNullifierCtxV5_4(
  bindingId: `0x${string}`,
  ageCutoffDate: number,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ['string', 'bytes32', 'uint256'],
      [NULLIFIER_CTX_DOMAIN, bindingId, BigInt(ageCutoffDate)],
    ),
  );
}

type FlowStep =
  | 'connect'
  | 'binding-pick'
  | 'cutoff'
  | 'p7s'
  | 'prove'
  | 'result'
  | 'error';

interface ProveAgeFlowProps {
  /**
   * Swappable IProver — `MockProver` in tests, SnarkjsWorkerProver in
   * prod. Default is a MockProver that resolves to canned output;
   * routes/accountProveAge.tsx wires the real Worker-hosted snarkjs
   * prover in T5.3.
   */
  readonly prover?: IProver;
  /**
   * AgeDiiaUA wasm URL. Defaults to `'about:blank'` so the MockProver
   * test path doesn't try to fetch (the mock ignores URLs). Real
   * wiring at T5.3+ passes the sha256-pinned URL from
   * `fixtures/circuits/age-ua-v5_4/urls.json`.
   */
  readonly wasmUrl?: string;
  /** AgeDiiaUA zkey URL. Same default-vs-real treatment as `wasmUrl`. */
  readonly zkeyUrl?: string;
}

export function ProveAgeFlow({
  prover = new MockProver(),
  wasmUrl = 'about:blank',
  zkeyUrl = 'about:blank',
}: ProveAgeFlowProps = {}) {
  const { t } = useTranslation();
  const { phase, status } = useCeremonyPhase();
  const effectivePhase = phase ?? 'recruiting';
  const effectiveRound = status?.round ?? 0;
  const effectiveTotal = status?.totalRounds ?? 1;

  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const registry = useMemo(
    () =>
      chainId !== undefined ? zkqesRegistryUaForChainId(chainId) : undefined,
    [chainId],
  );

  // wagmi tx-submission state. `txHash` is the user-signed tx; once
  // mined, `useWaitForTransactionReceipt` flips `txMined` true so the
  // result step can pivot from "submitting" to "submitted".
  const {
    writeContract,
    data: txHash,
    isPending: txPending,
    error: writeError,
    reset: resetWriteContract,
  } = useWriteContract();
  const { isSuccess: txMined, data: txReceipt } =
    useWaitForTransactionReceipt({ hash: txHash });

  const [step, setStep] = useState<FlowStep>(
    isConnected ? 'binding-pick' : 'connect',
  );
  const [bindingId, setBindingId] = useState<`0x${string}` | null>(null);
  const [ageCutoffDate, setAgeCutoffDate] = useState<number>(() =>
    defaultCutoffYmd(),
  );
  const [p7s, setP7s] = useState<Uint8Array | null>(null);
  const [publicSignals, setPublicSignals] =
    useState<AgePublicSignals | null>(null);
  // Captured snarkjs prover output — fed into `packAgeProof` for the
  // on-chain `proveAge` writeContract call. `proverPublics` is the
  // raw 3-string-array snarkjs returns (slot order §1.3 FROZEN);
  // `publicSignals` (above) is the typed off-circuit mirror used for
  // UI rendering. Drift between the two would surface as a contract
  // revert with no offset context — `packAgeProof` validates length.
  const [proof, setProof] = useState<Groth16Proof | null>(null);
  const [proverPublics, setProverPublics] = useState<readonly string[] | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // V5.4 cardinality (per the cross-broadcast): walletX MAY own
  // multiple bindings. Resolver hook returns the active set; picker
  // UX auto-selects N=1, lists N>1, empty-states N=0.
  const {
    data: ownedBindings,
    isLoading: bindingsLoading,
    error: bindingsError,
  } = useV5_4BindingsForWallet(connectedAddress);

  // The connect step auto-advances when wagmi reports the wallet
  // connected — same affordance as Step1 in the register flow. The
  // user can step back via the back link in the chrome.
  useEffect(() => {
    if (step === 'connect' && isConnected) setStep('binding-pick');
  }, [step, isConnected]);

  // Binding-pick step auto-advances on N=1 (vast-majority path) so the
  // common-case user never sees a picker. N=0 / N>1 stop here for the
  // empty-state CTA / multi-select picker respectively.
  useEffect(() => {
    if (step !== 'binding-pick' || bindingsLoading || bindingsError) return;
    if (ownedBindings.length === 1) {
      setBindingId(ownedBindings[0]!);
      setStep('cutoff');
    }
  }, [step, bindingsLoading, bindingsError, ownedBindings]);

  const onP7sChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => {
      setP7s(new Uint8Array(buf));
      setErrorMsg(null);
    });
  };

  const onProve = async () => {
    if (!p7s) {
      setErrorMsg(t('accountAgeProof.errors.missingP7s'));
      return;
    }
    if (!bindingId) {
      // Defensive — the binding-pick step blocks advancing to p7s
      // without a bindingId set; this guards against a future state-
      // machine refactor regressing the invariant.
      setErrorMsg(t('accountAgeProof.errors.missingBinding'));
      return;
    }
    setIsWorking(true);
    setErrorMsg(null);
    setStep('prove');
    try {
      const nullifierCtxKeccak = computeNullifierCtxV5_4(
        bindingId,
        ageCutoffDate,
      );
      // Buffer↔Uint8Array: buildAgeWitness expects Buffer-compatible
      // bytes; a Uint8Array is structurally compatible with the typed
      // signature on browsers via the global Buffer polyfill.
      const witnessOut = await buildAgeWitness({
        signedCades: p7s as unknown as Buffer,
        bindingId,
        ageCutoffDate,
        nullifierCtxKeccak,
      });

      // Drive the IProver — MockProver default in tests, Worker-hosted
      // SnarkjsWorkerProver in prod (wired from `routes/account/
      // proveAge.tsx` at T5.3). ProveOptions is flat in @zkqes/sdk's
      // shape — `wasmUrl + zkeyUrl + side?` at root, not wrapped under
      // `artifacts`. The route layer threads sha256-pinned URLs from
      // `lib/v5_4AgeArtifacts.ts`; tests default to `'about:blank'`
      // because MockProver ignores URLs.
      const proveResult = await prover.prove(witnessOut.witness, {
        side: 'v5',
        wasmUrl,
        zkeyUrl,
      });

      // Capture prover output for T5.4's writeContract. The off-
      // circuit `witnessOut.publicSignals` drives UI rendering;
      // `proveResult.publicSignals` is the raw snarkjs string array
      // packed into the on-chain AgeProof tuple.
      setProof(proveResult.proof);
      setProverPublics(proveResult.publicSignals);
      setPublicSignals(witnessOut.publicSignals);
      setStep('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    } finally {
      setIsWorking(false);
    }
  };

  const cutoffInputValue = useMemo(
    () => ymdToDateInput(ageCutoffDate),
    [ageCutoffDate],
  );

  const onSubmit = () => {
    if (
      !proof ||
      !proverPublics ||
      !bindingId ||
      !registry ||
      !publicSignals
    ) {
      // Defensive — the submit CTA only renders when all prerequisites
      // are present. This guards against future state-machine refactors
      // that could pre-render the CTA before the prover settles.
      setErrorMsg(t('accountAgeProof.errors.missingForSubmit'));
      return;
    }
    if (publicSignals.ageQualified !== 1) {
      // No on-chain submission for ageQualified=0 — the contract would
      // record `ageProvenCutoffs[bindingId][cutoff] = false` which is
      // useless; the local verdict stops at the result panel.
      return;
    }
    setErrorMsg(null);
    try {
      // `packAgeProof` validates `publicSignals.length === 3` per the
      // §1.3 FROZEN layout. A length mismatch is a cross-worker drift
      // bug, not a user-recoverable error — surface in the dedicated
      // error step so the failure is visible (vs an uncaught render
      // exception that would white-screen the surface).
      const calldata = packAgeProof(proof, proverPublics);
      writeContract({
        address: registry.address,
        abi: zkqesRegistryUaAbi,
        functionName: 'proveAge',
        args: [
          bindingId,
          BigInt(ageCutoffDate),
          // `packAgeProof` returns a strongly-typed tuple-shape object;
          // viem's `args` for a tuple-typed Solidity input wants the
          // object form, which matches the IZKQESRegistry.AgeProof
          // struct components 1:1.
          calldata,
        ],
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  // Surface wagmi writeContract errors via the existing error step —
  // user can retry or step back. Reset the wagmi state on retry so
  // the next submit isn't blocked by the prior error.
  useEffect(() => {
    if (writeError) {
      setErrorMsg(writeError.message);
      setStep('error');
    }
  }, [writeError]);

  return (
    <main
      className="ct ct-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
      data-testid="prove-age-v3-shell"
    >
      <Marquee
        phase={effectivePhase}
        round={effectiveRound}
        totalRounds={effectiveTotal}
        sidebarText={t('accountAgeProof.marqueeSidebar')}
      />
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '28px 24px',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <Link
          to="/"
          className="ct-link"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            display: 'inline-block',
            marginBottom: 18,
          }}
        >
          ← {t('accountAgeProof.back')}
        </Link>

        <h1
          className="ct-display"
          style={{
            fontFamily: 'var(--display)',
            fontSize: 38,
            lineHeight: 1,
            margin: '0 0 8px',
          }}
        >
          {t('accountAgeProof.heading')}
        </h1>
        <p
          style={{
            fontSize: 13,
            maxWidth: 560,
            color: 'var(--ct-ink)',
            margin: '0 0 22px',
          }}
        >
          {t('accountAgeProof.lede')}
        </p>

        {step === 'connect' && (
          <div
            className="ct-panel ct-panel--inset"
            style={{ padding: 'var(--ct-pad)' }}
            data-testid="prove-age-step-connect"
          >
            <span className="ct-legend">
              {t('accountAgeProof.connect.legend')}
            </span>
            <p style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
              {t('accountAgeProof.connect.body')}
            </p>
            <ConnectButton />
          </div>
        )}

        {step === 'binding-pick' && (
          <BindingPickerStep
            t={t}
            isLoading={bindingsLoading}
            error={bindingsError}
            bindings={ownedBindings}
            onPick={(id) => {
              setBindingId(id);
              setStep('cutoff');
            }}
          />
        )}

        {step === 'cutoff' && (
          <div
            className="ct-panel ct-panel--inset"
            style={{ padding: 'var(--ct-pad)' }}
            data-testid="prove-age-step-cutoff"
          >
            <span className="ct-legend">
              {t('accountAgeProof.cutoff.legend')}
            </span>
            <p style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
              {t('accountAgeProof.cutoff.body')}
            </p>
            <label
              htmlFor="prove-age-cutoff"
              className="ct-cert-no"
              style={{ display: 'block', marginBottom: 6 }}
            >
              {t('accountAgeProof.cutoff.label')}
            </label>
            <input
              id="prove-age-cutoff"
              type="date"
              data-testid="prove-age-cutoff-input"
              className="ct-input"
              value={cutoffInputValue}
              onChange={(e) => {
                const ymd = dateInputToYmd(e.target.value);
                if (ymd !== null) setAgeCutoffDate(ymd);
              }}
              style={{ marginBottom: 14 }}
            />
            <div className="ct-row-h" style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                data-testid="prove-age-cutoff-advance"
                onClick={() => setStep('p7s')}
              >
                {t('accountAgeProof.cutoff.advance')}
              </button>
            </div>
          </div>
        )}

        {step === 'p7s' && (
          <div
            className="ct-panel ct-panel--inset"
            style={{ padding: 'var(--ct-pad)' }}
            data-testid="prove-age-step-p7s"
          >
            <span className="ct-legend">
              {t('accountAgeProof.p7s.legend')}
            </span>
            <p style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
              {t('accountAgeProof.p7s.body')}
            </p>
            <input
              type="file"
              data-testid="prove-age-p7s-input"
              accept=".p7s,application/pkcs7-signature"
              onChange={onP7sChange}
              style={{ marginBottom: 14 }}
            />
            <div className="ct-row-h" style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="ct-btn"
                onClick={() => setStep('cutoff')}
                disabled={isWorking}
              >
                ◂ {t('accountAgeProof.actions.back')}
              </button>
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                data-testid="prove-age-prove"
                onClick={onProve}
                disabled={!p7s || isWorking}
              >
                ▶ {t('accountAgeProof.p7s.advance')}
              </button>
            </div>
          </div>
        )}

        {step === 'prove' && (
          <div
            className="ct-panel"
            style={{ padding: 'var(--ct-pad)' }}
            data-testid="prove-age-step-prove"
          >
            <span className="ct-legend">
              {t('accountAgeProof.prove.legend')}
            </span>
            <p style={{ fontSize: 12.5, margin: '6px 0 0' }}>
              {t('accountAgeProof.prove.working')}
            </p>
          </div>
        )}

        {step === 'result' && publicSignals && (
          <div
            className="ct-field"
            style={{ padding: 'var(--ct-pad)' }}
            data-testid="prove-age-step-result"
          >
            <span className="ct-legend">
              {t('accountAgeProof.result.legend')}
            </span>
            <ResultBody publicSignals={publicSignals} />
            <SubmitSubstep
              t={t}
              ageQualified={publicSignals.ageQualified}
              registry={registry}
              txHash={txHash}
              txPending={txPending}
              txMined={txMined}
              txReceipt={txReceipt}
              onSubmit={onSubmit}
              onReset={() => {
                resetWriteContract();
              }}
            />
          </div>
        )}

        {step === 'error' && (
          <div
            className="ct-field"
            style={{ padding: 'var(--ct-pad)' }}
            data-testid="prove-age-step-error"
          >
            <span className="ct-tag ct-tag--err">
              {t('accountAgeProof.error.tag')}
            </span>
            <p style={{ fontSize: 12.5, marginTop: 10 }}>
              {errorMsg ?? t('accountAgeProof.error.unknown')}
            </p>
            <button
              type="button"
              className="ct-btn"
              onClick={() => {
                setErrorMsg(null);
                setStep('p7s');
              }}
            >
              ◂ {t('accountAgeProof.actions.retry')}
            </button>
          </div>
        )}
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}

/** Truncate a 0x-prefixed hex value for display: `0x91A2…fE`. */
function shortHex(v: `0x${string}`, head = 6, tail = 4): string {
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

interface SubmitSubstepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly t: any;
  readonly ageQualified: 0 | 1;
  readonly registry:
    | { readonly chainId: number; readonly address: `0x${string}` }
    | undefined;
  readonly txHash: `0x${string}` | undefined;
  readonly txPending: boolean;
  readonly txMined: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly txReceipt: any;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
}

/**
 * Result-step submit substate machine:
 *
 *   ageQualified=0          → no submit (qualified-or-not is local-only)
 *   no registry on chain    → "no V5.4 deployment on this chain" hint
 *   no txHash + !txPending  → "Submit on-chain" CTA
 *   txPending (signing)     → "awaiting wallet signature"
 *   txHash set + !txMined   → "submitting" + tx-hash basescan link
 *   txMined === true        → "submitted" success state + receipt link
 *
 * Errors from `useWriteContract` (user-rejected, RPC fail, contract
 * revert) propagate via the parent's `useEffect` → setStep('error'),
 * which the parent surfaces in the dedicated error step. No need for
 * a per-substate error branch here.
 */
function SubmitSubstep({
  t,
  ageQualified,
  registry,
  txHash,
  txPending,
  txMined,
  txReceipt,
  onSubmit,
  onReset,
}: SubmitSubstepProps) {
  if (ageQualified === 0) {
    return (
      <p
        style={{
          fontSize: 11.5,
          color: 'var(--ct-mute)',
          margin: '12px 0 0',
        }}
        data-testid="prove-age-submit-skip-not-qualified"
      >
        {t('accountAgeProof.submit.skipNotQualified')}
      </p>
    );
  }

  if (!registry) {
    return (
      <p
        style={{
          fontSize: 11.5,
          color: 'var(--ct-mute)',
          margin: '12px 0 0',
        }}
        data-testid="prove-age-submit-no-registry"
      >
        {t('accountAgeProof.submit.noRegistry')}
      </p>
    );
  }

  if (txMined && txHash) {
    return (
      <div
        data-testid="prove-age-submit-success"
        style={{ marginTop: 14 }}
      >
        <span className="ct-tag ct-tag--ok">
          {t('accountAgeProof.submit.successTag')}
        </span>
        <p style={{ fontSize: 12.5, margin: '10px 0 6px' }}>
          {t('accountAgeProof.submit.successBody')}
        </p>
        <p
          style={{
            fontSize: 11.5,
            fontFamily: 'var(--mono)',
            color: 'var(--ct-mute)',
            margin: 0,
            wordBreak: 'break-all',
          }}
        >
          tx: {shortHex(txHash, 10, 8)}
          {txReceipt?.blockNumber !== undefined && (
            <> · block {String(txReceipt.blockNumber)}</>
          )}
        </p>
      </div>
    );
  }

  if (txHash && !txMined) {
    return (
      <div data-testid="prove-age-submit-pending" style={{ marginTop: 14 }}>
        <span className="ct-tag ct-tag--warn">
          {t('accountAgeProof.submit.pendingTag')}
        </span>
        <p style={{ fontSize: 12.5, margin: '10px 0 6px' }}>
          {t('accountAgeProof.submit.pendingBody')}
        </p>
        <p
          style={{
            fontSize: 11.5,
            fontFamily: 'var(--mono)',
            color: 'var(--ct-mute)',
            margin: 0,
            wordBreak: 'break-all',
          }}
        >
          tx: {shortHex(txHash, 10, 8)}
        </p>
      </div>
    );
  }

  if (txPending) {
    return (
      <p
        data-testid="prove-age-submit-awaiting-signature"
        style={{
          fontSize: 12.5,
          color: 'var(--ct-ink)',
          margin: '14px 0 0',
        }}
      >
        {t('accountAgeProof.submit.awaitingSignature')}
      </p>
    );
  }

  // Idle: render the CTA. `onReset` exposed so a future "submit again"
  // affordance can clear the wagmi state — not surfaced today.
  void onReset;
  return (
    <button
      type="button"
      className="ct-btn ct-btn--primary"
      data-testid="prove-age-submit-cta"
      onClick={onSubmit}
      style={{ marginTop: 14 }}
    >
      ▶ {t('accountAgeProof.submit.cta')}
    </button>
  );
}

interface BindingPickerStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly t: any;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly bindings: readonly `0x${string}`[];
  readonly onPick: (id: `0x${string}`) => void;
}

/**
 * V5.4 binding-picker step.
 *
 * Substates:
 *   - loading: spinner + "checking your bindings"
 *   - error:   surfaces the resolver error verbatim (RPC failure
 *              etc.); doesn't block the user, just stops the flow
 *   - N=0:     empty-state with CTA to /ua/registerV5
 *   - N=1:     auto-advance handled UPSTREAM via useEffect — this
 *              substate is reached transiently before the parent's
 *              effect commits the bindingId + setStep('cutoff'); we
 *              render a brief "found 1 binding" tag so users with
 *              slow rerenders aren't staring at a blank panel
 *   - N>1:     list with a click-to-select interaction
 */
function BindingPickerStep({
  t,
  isLoading,
  error,
  bindings,
  onPick,
}: BindingPickerStepProps) {
  if (isLoading) {
    return (
      <div
        className="ct-panel"
        style={{ padding: 'var(--ct-pad)' }}
        data-testid="prove-age-step-binding-pick-loading"
      >
        <span className="ct-legend">{t('accountAgeProof.bindingPick.legend')}</span>
        <p style={{ fontSize: 12.5, margin: '6px 0 0' }}>
          {t('accountAgeProof.bindingPick.loading')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="ct-field"
        style={{ padding: 'var(--ct-pad)' }}
        data-testid="prove-age-step-binding-pick-error"
      >
        <span className="ct-tag ct-tag--err">
          {t('accountAgeProof.bindingPick.errorTag')}
        </span>
        <p style={{ fontSize: 12.5, marginTop: 10 }}>{error.message}</p>
      </div>
    );
  }

  if (bindings.length === 0) {
    return (
      <div
        className="ct-field"
        style={{ padding: 'var(--ct-pad)' }}
        data-testid="prove-age-step-binding-pick-empty"
      >
        <span className="ct-tag ct-tag--warn">
          {t('accountAgeProof.bindingPick.emptyTag')}
        </span>
        <p style={{ fontSize: 12.5, margin: '10px 0 14px' }}>
          {t('accountAgeProof.bindingPick.emptyBody')}
        </p>
        <Link
          to="/"
          className="ct-btn ct-btn--primary"
          data-testid="prove-age-binding-pick-register-cta"
        >
          ▶ {t('accountAgeProof.bindingPick.registerCta')}
        </Link>
      </div>
    );
  }

  if (bindings.length === 1) {
    return (
      <div
        className="ct-panel"
        style={{ padding: 'var(--ct-pad)' }}
        data-testid="prove-age-step-binding-pick-single"
      >
        <span className="ct-legend">{t('accountAgeProof.bindingPick.legend')}</span>
        <p style={{ fontSize: 12.5, margin: '6px 0 0' }}>
          {t('accountAgeProof.bindingPick.singleAutoAdvance', {
            bindingId: shortHex(bindings[0]!),
          })}
        </p>
      </div>
    );
  }

  // N > 1 — explicit picker.
  return (
    <div
      className="ct-panel ct-panel--inset"
      style={{ padding: 'var(--ct-pad)' }}
      data-testid="prove-age-step-binding-pick-multi"
    >
      <span className="ct-legend">{t('accountAgeProof.bindingPick.legend')}</span>
      <p style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
        {t('accountAgeProof.bindingPick.multiBody', { count: bindings.length })}
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {bindings.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="ct-btn"
              data-testid={`prove-age-binding-pick-option-${id}`}
              onClick={() => onPick(id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'var(--mono)',
              }}
            >
              {shortHex(id, 10, 8)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultBody({
  publicSignals,
}: {
  readonly publicSignals: AgePublicSignals;
}) {
  const { t } = useTranslation();
  const cutoffIso = ymdToDateInput(publicSignals.ageCutoffDate);
  if (publicSignals.ageQualified === 1) {
    return (
      <div data-testid="prove-age-result-qualified">
        <span className="ct-tag ct-tag--ok">
          {t('accountAgeProof.result.qualifiedTag')}
        </span>
        <p style={{ fontSize: 13, margin: '10px 0 0' }}>
          {t('accountAgeProof.result.qualifiedBody', { cutoffIso })}
        </p>
      </div>
    );
  }
  return (
    <div data-testid="prove-age-result-not-qualified">
      <span className="ct-tag ct-tag--warn">
        {t('accountAgeProof.result.notQualifiedTag')}
      </span>
      <p style={{ fontSize: 13, margin: '10px 0 0' }}>
        {t('accountAgeProof.result.notQualifiedBody', { cutoffIso })}
      </p>
    </div>
  );
}
