import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CivicTerminalLanding } from '../components/CivicTerminalLanding';
import { MintButton } from '../components/MintButton';
import { DocumentFooter } from '../components/DocumentFooter';
import { LandingHero } from '../components/LandingHero';
import '../styles/civic-terminal.css';

/**
 * Root `/` route — surface depends on a runtime variant flag, then on
 * the SPA's build target.
 *
 * Variant flag (prototype gate, lead dispatch 2026-05-04):
 *   `?variant=civic-terminal` → render `CivicTerminalLanding`
 *   (variant D Curve-router shell, pre-launch empty-states). Opt-in
 *   review surface; default `/` behavior unchanged. Removing the gate
 *   is the merge-to-adopt path: replace this whole switch with a
 *   direct `<CivicTerminalLanding />` once founder + lead approve.
 *
 * `VITE_TARGET=landing` (zkqes.org root) — pre-ceremony hero +
 * recruitment CTA. `LandingHero` carries the BRAND.md descriptor lead
 * + three contribution paths + status feed link. NO register flow.
 *
 * `VITE_TARGET=app` (app.zkqes.org, default) — the existing
 * register-flow landing: identity-escrow privacy framing + MintButton
 * + ceremony help link (`AppRegisterLanding`).
 *
 * The VITE_TARGET branch is on a compile-time constant, so
 * terser/esbuild eliminates the dead branch at build time. The
 * landing build doesn't pay for `MintButton` (which pulls in the
 * wallet stack); the app build doesn't pay for `LandingHero`. The
 * variant-flag branch IS bundled into both builds (small cost,
 * ~6 KB component + 326-line CSS) — when the prototype is decided,
 * either delete the file (revert) or remove the gate (adopt).
 *
 * `AppRegisterLanding` is extracted into its own component so the
 * hooks it uses (`useTranslation`) stay inside a branch the React
 * linter is comfortable with — calling hooks after an early-return
 * on a compile-time constant works at runtime but trips the
 * `react-hooks/rules-of-hooks` rule statically.
 */
export function IndexScreen() {
  // Variant flag — runtime URL check. `window` is always defined in
  // the SPA runtime; the `typeof` guard is defensive against any
  // future SSR / pre-render path.
  //
  // The T9 `?variant=qtsp-grid` preview surface auto-removed here
  // (per its plan footer): T12 lands `<CountryGrid />` directly into
  // `LandingHero` between the hero and path cards, so the synthetic
  // four-state preview fixtures + their gating branch are no longer
  // needed.
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('variant') ===
      'civic-terminal'
  ) {
    return <CivicTerminalLanding />;
  }

  // Direct env-var comparison rather than the `IS_LANDING_TARGET`
  // indirection — same reason as the comment in `router.tsx`: Vite's
  // `define` plugin substitutes the literal string at source-text
  // time, letting Rollup/terser fold the dead branch BEFORE the
  // module graph is finalized. Going through a const breaks the
  // substitution match and the dead branch (with its static imports)
  // ships in the bundle. Cost: 1 line of repeated literal vs ~4 MB
  // entry-chunk bloat.
  if (import.meta.env.VITE_TARGET === 'landing') {
    return <LandingHero />;
  }
  return <AppRegisterLanding />;
}

// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// PaperGrain + doc-grid + EB Garamond/Inter Tight tokens retired
// per founder direction 2026-05-05 (task #84). Same content +
// translation keys + testid (`landing-ceremony-link`) — only chrome
// migrates to civic-terminal primitives + VT323 / IBM Plex Mono.
const KICKER: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--ct-mute)',
  margin: 0,
};

const BODY: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '15px',
  lineHeight: 1.5,
  maxWidth: '52ch',
  color: 'var(--ct-ink)',
};

function AppRegisterLanding() {
  const { t } = useTranslation();
  return (
    <main
      className="ct"
      style={{
        minHeight: '100vh',
        background: 'var(--ct-paper)',
        color: 'var(--ct-ink)',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '96px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
        }}
      >
        <header style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={KICKER}>
            <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
            {t('landing.eyebrow', 'Verified Ukrainian certificate')}
          </p>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: '64px',
              lineHeight: 1,
              letterSpacing: '0.02em',
              margin: 0,
            }}
          >
            {t('landing.title', 'Verified Identity. On-chain.')}
          </h1>
          <p style={BODY}>
            {t(
              'landing.lede',
              'Mint your Verified Ukrainian certificate. Your identity stays on your machine — only the proof reaches the chain.',
            )}
          </p>
        </header>

        <hr className="ct-divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <MintButton />
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '13px',
              lineHeight: 1.5,
              maxWidth: '52ch',
              color: 'var(--ct-mute)',
            }}
          >
            {t(
              'landing.subline',
              'Powered by Diia QES + Groth16. Your identity bytes never enter this browser.',
            )}
          </p>
        </div>

        <hr className="ct-divider" />

        <section
          aria-labelledby="privacy-heading"
          style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
        >
          <h2
            id="privacy-heading"
            style={{
              fontFamily: 'var(--display)',
              fontSize: '44px',
              lineHeight: 1,
              margin: 0,
            }}
          >
            {t('landing.privacy.heading', 'Identity, escrowed.')}
          </h2>

          <dl style={{ display: 'flex', flexDirection: 'column', gap: '24px', margin: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <dt style={KICKER}>
                <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
                {t('landing.privacy.onLedgerLabel', 'What is on the ledger')}
              </dt>
              <dd style={{ ...BODY, margin: 0 }}>
                {t(
                  'landing.privacy.onLedgerBody',
                  'a nullifier — context-bound, one-way, unlinkable across applications.',
                )}
              </dd>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <dt style={KICKER}>
                <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
                {t('landing.privacy.notOnLedgerLabel', 'What is not on the ledger')}
              </dt>
              <dd style={{ ...BODY, margin: 0 }}>
                {t(
                  'landing.privacy.notOnLedgerBody',
                  'name, address, document numbers, signature, certificate contents.',
                )}
              </dd>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <dt style={KICKER}>
                <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
                {t(
                  'landing.privacy.recoveryLabel',
                  'What can be recovered, by whom, under what process',
                )}
              </dt>
              <dd style={{ ...BODY, margin: 0 }}>
                {t(
                  'landing.privacy.recoveryBody',
                  'by the issuing authority, under lawful order, at meaningful compute cost. Not by third parties.',
                )}
              </dd>
            </div>
          </dl>

          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '14px',
              fontStyle: 'italic',
              lineHeight: 1.5,
              maxWidth: '60ch',
              color: 'var(--ct-ink-2)',
            }}
          >
            {t(
              'landing.privacy.closing',
              'zkqes. Every-day pseudonymity for the holder; recoverable accountability for the state. The same trust structure as the qualified electronic signature itself — preserved on-chain.',
            )}
          </p>
        </section>

        <hr className="ct-divider" />

        <p
          data-testid="landing-ceremony-link"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '14px',
            fontStyle: 'italic',
          }}
        >
          <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
          <Link to="/ceremony" className="ct-link">
            {t(
              'landing.ceremonyLink',
              'Help with the trusted setup ceremony →',
            )}
          </Link>
        </p>
      </div>
      <DocumentFooter />
    </main>
  );
}
