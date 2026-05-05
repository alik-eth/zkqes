// /account/rotate — wallet-rotation flow entry point.
//
// V3 surface (Task #87, 2026-05-05): civic-terminal v3 chrome wraps
// RotateWalletFlow per founder pick from the Claude Design handoff
// bundle (`/tmp/zkqes-design/zk-qes-3/`). Wireframe source:
// `register-variants.jsx::RotateB_Diagram` (lines 400–449). Layout
// faithful in spirit — Marquee header, h1.ct-display "Rotate a
// wallet", lede, and ASCII OLD→nullifier→NEW figure inside a
// ct-panel — but adapted to the live multi-step flow:
//
//   • The wireframe shows a single-screen FROM/TO input layout.
//     Reality is a 6-step machine (connect → diia → derive-new →
//     derive-old → prove → submit) with wallet switching between
//     stages. Per the resume handoff (2026-05-05), the v3 chrome
//     renders as a persistent header/explainer around the step
//     machine; the steps themselves are PRESERVED VERBATIM.
//
//   • Design said FROM/TO input fields rendered above the action
//     row. Wired the step machine inline instead because
//     RotateWalletFlow already supplies the wallet-input UX with
//     the V5.1 walletSecret derivation + `qkb-rotate-auth-v1` byte
//     -lock. Surfacing duplicate wallet inputs here would risk
//     newWalletAddress drift between the chrome and the React-
//     state-locked source-of-truth in RotateWalletFlow (invariant
//     #10 in packages/web/CLAUDE.md). The ASCII figure carries the
//     conceptual FROM→nullifier→TO visual instead.
//
// IMPORTANT: RotateWalletFlow's 965-line internals + V5.1
// `qkb-rotate-auth-v1` byte-lock + walletSecret derivation are
// PRESERVED VERBATIM per packages/web/CLAUDE.md invariant 10. The
// shell is composition only.

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';

import { RotateWalletFlow } from '../../components/ua/v5/RotateWalletFlow';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { TestnetBanner } from '../../components/app/TestnetBanner';
import { Marquee } from '../../components/civic-terminal/Marquee';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

// ASCII figure from the wireframe — kept verbatim in code (not
// i18n) to preserve monospace alignment. The aria-label below
// carries a translatable plain-text summary for screen readers.
const ROTATION_DIAGRAM = `
   ┌────────────────┐                       ┌────────────────┐
   │  OLD WALLET    │                       │  NEW WALLET    │
   │  bound earlier │     ──────────►       │  binding ▶     │
   │                │   nullifier (you)     │                │
   └───────┬────────┘                       └────────┬───────┘
           │                                         │
           ▼                                         ▼
   ┌──────────────────────────────────────────────────────┐
   │  CHAIN view: two unrelated nullifier-uses · NO LINK  │
   └──────────────────────────────────────────────────────┘
`;

export function AccountRotateScreen() {
  const { t } = useTranslation();
  const { phase, status } = useCeremonyPhase();
  // Same fallback posture as VerifyBindingScreen — Phase B
  // recruitment is the pre-launch default while the status feed
  // is loading or unreachable.
  const effectivePhase = phase ?? 'recruiting';
  const effectiveRound = status?.round ?? 0;
  const effectiveTotal = status?.totalRounds ?? 1;

  return (
    <main
      className="ct ct-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
      data-testid="account-rotate-v3-shell"
    >
      <TestnetBanner />
      <PreviewModeBanner />
      <Marquee
        phase={effectivePhase}
        round={effectiveRound}
        totalRounds={effectiveTotal}
        sidebarText={t('accountRotate.v3.marqueeSidebar')}
      />
      <div
        style={{
          maxWidth: 960,
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
          ← {t('accountRotate.v3.back')}
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
          {t('accountRotate.v3.heading')}
        </h1>
        <p
          style={{
            fontSize: 13,
            maxWidth: 600,
            color: 'var(--ct-ink)',
            margin: '0 0 22px',
          }}
        >
          {t('accountRotate.v3.lede')}
        </p>

        <div
          className="ct-panel"
          style={{ padding: 18, background: 'var(--ct-paper-2)' }}
          data-testid="account-rotate-v3-diagram"
        >
          <pre
            className="ct-ascii"
            aria-label={t('accountRotate.v3.diagram.aria')}
            style={{ margin: 0 }}
          >
            {ROTATION_DIAGRAM}
          </pre>
        </div>

        <div style={{ marginTop: 22 }}>
          <DeviceReadinessGate>
            <RotateWalletFlow />
          </DeviceReadinessGate>
        </div>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
