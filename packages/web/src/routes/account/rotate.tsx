// /account/rotate — wallet-rotation flow entry point.
//
// V2 atomic flip (Task 13, 2026-05-04): the `?variant=civic-terminal`
// URL gate was deleted in this commit. The civic-terminal v2 chrome
// (PreviewModeBanner + DeviceReadinessGate + 720px column +
// FooterRibbon) wraps RotateWalletFlow at every visit. Founder Q1
// ACCEPT (2026-05-04) approved the v2 shells as canonical.
//
// IMPORTANT: RotateWalletFlow's 965-line internals + V5.1
// `qkb-rotate-auth-v1` byte-lock + walletSecret derivation are
// PRESERVED VERBATIM per packages/web/CLAUDE.md invariant 10. The
// shell is composition only.

import { RotateWalletFlow } from '../../components/ua/v5/RotateWalletFlow';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { TestnetBanner } from '../../components/app/TestnetBanner';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

export function AccountRotateScreen() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
      data-testid="account-rotate-v2-shell"
    >
      <TestnetBanner />
      <PreviewModeBanner />
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '24px',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <DeviceReadinessGate>
          <RotateWalletFlow />
        </DeviceReadinessGate>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
