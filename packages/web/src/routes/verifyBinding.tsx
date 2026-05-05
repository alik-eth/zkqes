// /verify — Verify A Lookup civic-terminal v3 surface.
//
// Founder pick (2026-05-05) per the Claude Design handoff bundle
// (`zk-qes-3.tar.gz` chat transcript). Wireframe source:
// /tmp/zkqes-design/zk-qes-3/project/register-variants.jsx
// `VerifyA_Lookup` (lines 453–497). Layout faithful; "0x91A2…fE"
// mock wallet + the "VALID · checked locally · 12 ms" canned result
// pane are NOT shipped — the design intent is "paste a wallet,
// look it up against the on-chain registry locally". Pre-§9.4
// (Base Sepolia mainnet deploy + ceremony close), the on-chain
// path is gated; we render the v3 chrome with an honest preview-mode
// pane that explains what the verifier WILL show post-launch and
// links to /ceremony/verify (which is live for attestation lookups
// today). Post-§9.4 we wire `getEoaBinding(client, registry, addr)`
// from `@zkqes/sdk` here and render the real result.
//
// **Route partition:** sharedRoutes (visible on both landing + app
// per BRAND.md §Domains). The verifier is intentionally PUBLIC —
// no wallet connection required, no SAB/COOP-COEP context, no
// snarkjs in the bundle. Static composition; can serve from
// landing-target without dragging in the app's wagmi/metamask deps.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { isAddress, type Address } from 'viem';
import { useCeremonyPhase } from '../hooks/useCeremonyPhase';
import { Marquee } from '../components/civic-terminal/Marquee';
import { FooterRibbon } from '../components/civic-terminal/FooterRibbon';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

type VerdictKind = 'idle' | 'invalid-address' | 'pre-launch';

interface Verdict {
  readonly kind: VerdictKind;
  readonly query?: string;
}

export function VerifyBindingScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [verdict, setVerdict] = useState<Verdict>({ kind: 'idle' });
  const { phase, status } = useCeremonyPhase();
  // `phase` is null while the status feed is loading / unreachable;
  // the design's chrome wants a sensible default — 'recruiting' is
  // the pre-launch posture (Phase B contributor recruitment per
  // task #8) and matches the same fallback the Marquee uses on
  // CivicTerminalLanding when the feed is down.
  const effectivePhase = phase ?? 'recruiting';
  const effectiveRound = status?.round ?? 0;
  const effectiveTotal = status?.totalRounds ?? 1;

  const onVerify = () => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setVerdict({ kind: 'idle' });
      return;
    }
    // Address-shape gate. Real on-chain lookup wires here post-§9.4
    // — `getEoaBinding(publicClient, deployment.registryV5, addr)` →
    // `{ identityCommitment, registeredAt, ... } | null`.
    if (!isAddress(trimmed)) {
      setVerdict({ kind: 'invalid-address', query: trimmed });
      return;
    }
    setVerdict({ kind: 'pre-launch', query: trimmed as Address });
  };

  return (
    <main className="ct ct-page" style={{ minHeight: '100vh' }}>
      <Marquee
        phase={effectivePhase}
        round={effectiveRound}
        totalRounds={effectiveTotal}
        sidebarText={t('verify.binding.marqueeSidebar')}
      />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
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
          ← {t('verify.binding.back')}
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
          {t('verify.binding.heading')}
        </h1>
        <p
          style={{
            fontSize: 13,
            maxWidth: 560,
            color: 'var(--ct-ink)',
            margin: '0 0 22px',
          }}
        >
          {t('verify.binding.lede')}
        </p>

        <div className="ct-panel ct-panel--inset" style={{ padding: 16 }}>
          <div
            className="ct-row-h"
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <span
              className="ct-cert-no"
              style={{ minWidth: 80, flex: 'none' }}
              aria-hidden="true"
            >
              {t('verify.binding.queryLabel')}
            </span>
            <label htmlFor="verify-binding-input" className="sr-only">
              {t('verify.binding.queryLabel')}
            </label>
            <input
              id="verify-binding-input"
              className="ct-input"
              data-testid="verify-binding-input"
              placeholder={t('verify.binding.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onVerify();
              }}
              style={{ flex: 1 }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="ct-btn ct-btn--primary"
              data-testid="verify-binding-submit"
              onClick={onVerify}
            >
              {t('verify.binding.submit')}
            </button>
          </div>
        </div>

        <div
          className="ct-grid-2"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 18,
            marginTop: 18,
          }}
        >
          <ResultPane verdict={verdict} />
          <NotLearnedPane />
        </div>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}

function ResultPane({ verdict }: { readonly verdict: Verdict }) {
  const { t } = useTranslation();
  return (
    <div className="ct-field" style={{ padding: 'var(--ct-pad)' }}>
      <span className="ct-legend">{t('verify.binding.result.heading')}</span>
      {verdict.kind === 'idle' && (
        <p
          data-testid="verify-binding-result-idle"
          style={{ fontSize: 12.5, color: 'var(--ct-mute)', margin: 0 }}
        >
          {t('verify.binding.result.idle')}
        </p>
      )}
      {verdict.kind === 'invalid-address' && (
        <div
          data-testid="verify-binding-result-invalid"
          style={{ fontSize: 12.5 }}
        >
          <span
            className="ct-tag ct-tag--err"
            style={{ marginBottom: 8, display: 'inline-block' }}
          >
            {t('verify.binding.result.invalidTag')}
          </span>
          <p style={{ margin: 0, color: 'var(--ct-ink)' }}>
            {t('verify.binding.result.invalidBody')}
          </p>
        </div>
      )}
      {verdict.kind === 'pre-launch' && (
        <div
          data-testid="verify-binding-result-prelaunch"
          className="ct-stack"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div className="ct-row-h" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="ct-tag ct-tag--warn">
              {t('verify.binding.result.preLaunchTag')}
            </span>
            <span className="ct-cert-no">
              {t('verify.binding.result.checkedLocally')}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--display)',
              fontSize: 22,
              lineHeight: 1,
              wordBreak: 'break-all',
            }}
          >
            {verdict.query}
          </div>
          <p style={{ fontSize: 12.5, margin: 0 }}>
            {t('verify.binding.result.preLaunchBody')}
          </p>
          <p style={{ fontSize: 12, color: 'var(--ct-mute)', margin: 0 }}>
            <Link to="/ceremony/verify" className="ct-link">
              {t('verify.binding.result.preLaunchAttestationLink')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function NotLearnedPane() {
  const { t } = useTranslation();
  // Static "what you can't learn" panel — preserves the design's
  // privacy-guarantee bullet list verbatim. Pure copy; no state.
  const bullets = t('verify.binding.notLearned.bullets', {
    returnObjects: true,
  }) as readonly string[];
  return (
    <div className="ct-field" style={{ padding: 'var(--ct-pad)' }}>
      <span className="ct-legend">{t('verify.binding.notLearned.heading')}</span>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 12.5,
          color: 'var(--ct-ink)',
        }}
      >
        {bullets.map((b) => (
          <li key={b} style={{ marginBottom: 4 }}>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
