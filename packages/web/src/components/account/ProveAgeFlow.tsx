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
import { useAccount } from 'wagmi';
import { encodePacked, keccak256 } from 'viem';

import {
  buildAgeWitness,
  MockProver,
  type IProver,
  type AgePublicSignals,
} from '@zkqes/sdk';

import { Marquee } from '../civic-terminal/Marquee';
import { FooterRibbon } from '../civic-terminal/FooterRibbon';
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';

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
  | 'cutoff'
  | 'p7s'
  | 'prove'
  | 'result'
  | 'error';

interface ProveAgeFlowProps {
  /**
   * Swappable IProver — `MockProver` in tests, SnarkjsProver+Worker in
   * prod. Default is a MockProver that resolves to canned output;
   * routes/accountProveAge.tsx wires the real prover in T4.
   */
  readonly prover?: IProver;
  /**
   * Stub bindingId for Phase A development. Phase C replaces this with
   * a binding-picker that calls `getBinding(connectedAddress)` against
   * the deployed ZKQES_REGISTRY_UA registry. The picker UI lands when
   * the address pump from contracts-eng arrives at T5.
   */
  readonly bindingIdStub?: `0x${string}`;
}

const ZERO_BINDING: `0x${string}` =
  ('0x' + '00'.repeat(32)) as `0x${string}`;

export function ProveAgeFlow({
  prover = new MockProver(),
  bindingIdStub = ZERO_BINDING,
}: ProveAgeFlowProps = {}) {
  const { t } = useTranslation();
  const { phase, status } = useCeremonyPhase();
  const effectivePhase = phase ?? 'recruiting';
  const effectiveRound = status?.round ?? 0;
  const effectiveTotal = status?.totalRounds ?? 1;

  const { isConnected } = useAccount();

  const [step, setStep] = useState<FlowStep>(
    isConnected ? 'cutoff' : 'connect',
  );
  const [ageCutoffDate, setAgeCutoffDate] = useState<number>(() =>
    defaultCutoffYmd(),
  );
  const [p7s, setP7s] = useState<Uint8Array | null>(null);
  const [publicSignals, setPublicSignals] =
    useState<AgePublicSignals | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // The connect step auto-advances when wagmi reports the wallet
  // connected — same affordance as Step1 in the register flow. The
  // user can step back via the back link in the chrome.
  useEffect(() => {
    if (step === 'connect' && isConnected) setStep('cutoff');
  }, [step, isConnected]);

  const bindingId = bindingIdStub;

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

      // Drive the IProver — Phase A uses MockProver default; T5 will
      // wire the real Worker-hosted snarkjs prover here. The witness
      // shape is what the AgeDiiaUA circuit consumes. Phase A
      // placeholder URLs (about:blank); Phase C swaps to the real
      // R2-hosted .wasm + .zkey from the ceremony output. ProveOptions
      // is flat in @zkqes/sdk's shape — wasmUrl + zkeyUrl at root, not
      // wrapped under `artifacts`.
      await prover.prove(witnessOut.witness, {
        side: 'v5',
        wasmUrl: 'about:blank',
        zkeyUrl: 'about:blank',
      });

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
            <p
              style={{
                fontSize: 11.5,
                color: 'var(--ct-mute)',
                margin: '12px 0 0',
              }}
              data-testid="prove-age-submit-pending"
            >
              {t('accountAgeProof.result.submitPending')}
            </p>
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
