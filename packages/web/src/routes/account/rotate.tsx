// /account/rotate — wallet-rotation flow entry point.
//
// Civic-monumental flow (the legacy default) renders RotateWalletFlow
// directly — it ships its own civic-monumental chrome + step indicator.
//
// Civic-terminal v2 variant (gated behind `?variant=civic-terminal` per
// plan Task 10 + spec §5.2) wraps the same RotateWalletFlow internals in
// the v2 chrome:
//
//   <PreviewModeBanner />      — emits when phase != live
//   <DeviceReadinessGate>      — Firefox≥120 + RAM OR `zkqes serve` CLI
//     <RotateWalletFlow />     — UNCHANGED; preserves the 3-sig flow per
//                                packages/web/CLAUDE.md invariant 10
//                                (newWalletAddress is LOCKED at connect step)
//   <FooterRibbon />
//
// Plan-deviation per Task 9 → Task 10: like /register, the RotateWalletFlow
// component (965 lines) is preserved verbatim rather than refactored to a
// stacked single-long-form layout. Lead's "DON'T refactor the steps'
// internals" applies here too — the rotation auth payload byte-locks
// (V5.1 invariant + qkb-rotate-auth-v1 frozen tag) make any internal
// restructure risky. The load-bearing v2 deliverables (gate + banner)
// ship; the stacked layout is a follow-up.

import { RotateWalletFlow } from '../../components/ua/v5/RotateWalletFlow';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

export function AccountRotateScreen() {
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('variant') ===
      'civic-terminal'
  ) {
    return <AccountRotateCivicTerminal />;
  }
  return <RotateWalletFlow />;
}

function AccountRotateCivicTerminal() {
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
