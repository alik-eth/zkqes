// zkqes.org root — pre-ceremony hero + recruitment CTA.
//
// Surface served when `VITE_TARGET=landing`. Per BRAND.md §Domains
// (locked 2026-05-03):
//   - zkqes.org root persists post-launch as the project landing.
//   - Pre-ceremony focus today: recruit Phase B contributors. No
//     register flow on this surface — that lives at app.zkqes.org.
//
// Brand discipline (BRAND.md §Names):
//   - Lead with the descriptor: "zkqes — a zero-knowledge proof of a
//     qualified electronic signature."
//   - Use `zkqes` as the protocol noun.
//
// Civic-terminal aesthetic per BRAND.md v2 (`packages/web/src/styles/
// civic-terminal.css`): paper/ink CSS custom-prop layer, VT323
// display + IBM Plex Mono body, dashed inner frames, no icons /
// cards / shadows. The pre-v2 sovereign-indigo / sienna-seal /
// EB Garamond styling was retired here at user request — the entire
// surface now uses only `--ct-*` tokens + `.ct-*` primitives.
//
// Three contribution paths (per #60 dispatch):
//   1. Local snarkjs — ZK infra contributors with their own machine
//      (~5 commands, ~25 min, 32 GB RAM)
//   2. Rented VPS — contributors without local 32 GB; the same
//      snarkjs commands run on any Linux box (Hetzner CCX33, AWS
//      r5.xlarge, etc.). Existing /ceremony/contribute page documents
//      the commands; the OS/host detail is incidental.
//   3. Fly.io launcher — one-click contribution form, ~$0.30/round
//      and free-tier covered. Existing /ceremony/contribute page
//      hosts the launcher form.
//
// All three CTAs deep-link to /ceremony/contribute where the
// commands + Fly form already live. Avoids duplicating the
// instructional content; hero stays minimal-viable.
//
// Privacy: no analytics, no cookies, no third-party tracking.
import { lazy, Suspense } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DocumentFooter } from './DocumentFooter';
import '../styles/civic-terminal.css';

// Lazy-load CountryGrid so the landing entry chunk stays under the
// 2.7 MB budget (T15 reach test). The grid sits below the hero and
// the user is unlikely to interact with it during the first paint;
// deferring its bundle gates the qtsp/* component tree behind a
// tiny async import boundary. No measurable UX regression — same
// content, slightly later paint of the coverage section.
const CountryGrid = lazy(() =>
  import('./qtsp/CountryGrid').then((m) => ({ default: m.CountryGrid })),
);

// Civic-terminal kicker — small-caps lead-in used for the eyebrow
// + each path label. Mirrors BRAND.md §Type table: 11px,
// `--mono`, uppercase, 0.18em letter-spacing.
const KICKER_STYLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--ct-mute)',
};

export function LandingHero() {
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
        {/* Header — descriptor lead per BRAND.md §"How to write
            about the project". Frozen marketer copy — hero copy
            update lives in marketer task #72 (the "qualified
            electronic signatures across eIDAS Europe" reframing
            for multi-QTSP land happens in a separate post-marketer
            -review commit, not here). */}
        <header data-section="hero" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={KICKER_STYLE}>
            <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
            {t('zkqes.eyebrow', 'Trusted setup ceremony in progress')}
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
            {t('zkqes.headline', 'zk-QES.')}
          </h1>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '15px',
              lineHeight: 1.5,
              maxWidth: '52ch',
            }}
          >
            {t(
              'zkqes.lede',
              'A zero-knowledge protocol over qualified electronic signatures. Prove you hold a state-issued QES — without revealing it, the cert behind it, or the document it signed.',
            )}
          </p>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '13px',
              lineHeight: 1.5,
              maxWidth: '52ch',
              color: 'var(--ct-ink-2)',
            }}
          >
            {t(
              'zkqes.framing',
              'QKB — the V1 implementation — is in trusted-setup ceremony. The Groth16 prover keys are produced by a multi-contributor ceremony; so long as one contributor honestly destroys their entropy, every future proof is sound. We need contributors.',
            )}
          </p>
        </header>

        <hr className="ct-divider" />

        {/* Multi-QTSP facade T12: country/QTSP coverage grid sits
            between hero and path cards. `id="coverage"` is the
            scroll target for the T11 `/countries → /#coverage`
            redirect (and the T10 bronze-tile redirect chain).
            CountryGrid is lazy-loaded for chunk hygiene (T15);
            Suspense fallback is a minimal spacer so the surrounding
            layout doesn't reflow on hydration. */}
        <section
          id="coverage"
          data-section="coverage"
          aria-label="qtsp-coverage"
        >
          <Suspense
            fallback={
              <div
                aria-label="loading-coverage"
                style={{ minHeight: '120px' }}
              />
            }
          >
            <CountryGrid />
          </Suspense>
        </section>

        <hr className="ct-divider" />

        {/* Three contribution paths. Each path links to
            /ceremony/contribute — the page already has the snarkjs
            commands AND the Fly launcher form, so deep-linking
            avoids duplicating the source-of-truth. */}
        <section
          aria-labelledby="paths-heading"
          data-testid="zkqes-paths"
          data-section="path-cards"
          style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
        >
          <h2
            id="paths-heading"
            style={{
              fontFamily: 'var(--display)',
              fontSize: '36px',
              lineHeight: 1,
              margin: 0,
            }}
          >
            {t('zkqes.pathsHeading', 'Three ways to contribute')}
          </h2>

          <article
            data-testid="zkqes-path-snarkjs"
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '60ch' }}
          >
            <h3 style={KICKER_STYLE}>
              <span aria-hidden="true" style={{ marginRight: '0.5em' }}>1</span>
              {t('zkqes.pathSnarkjs.label', 'Local snarkjs')}
            </h3>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '14px', lineHeight: 1.5 }}>
              {t(
                'zkqes.pathSnarkjs.body',
                'For contributors with a 32 GB-RAM machine. Five commands, twenty-five minutes wall-clock. Snarkjs holds the intermediate zkey in V8 heap; ~30 GB peak. Bring your own entropy source.',
              )}
            </p>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>
              <Link to="/ceremony/contribute" className="ct-link">
                {t('zkqes.pathSnarkjs.cta', 'Read the snarkjs runbook →')}
              </Link>
            </p>
          </article>

          <article
            data-testid="zkqes-path-vps"
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '60ch' }}
          >
            <h3 style={KICKER_STYLE}>
              <span aria-hidden="true" style={{ marginRight: '0.5em' }}>2</span>
              {t('zkqes.pathVps.label', 'Rented VPS')}
            </h3>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '14px', lineHeight: 1.5 }}>
              {t(
                'zkqes.pathVps.body',
                'For contributors without local infra. A Hetzner CCX33 (32 GB, 8 vCPU, ~€0.10/hr) — or any 32 GB Linux machine — runs the same snarkjs commands. Spin up, run, attest, destroy.',
              )}
            </p>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>
              <Link to="/ceremony/contribute" className="ct-link">
                {t('zkqes.pathVps.cta', 'Same commands; any 32 GB host →')}
              </Link>
            </p>
          </article>

          <article
            data-testid="zkqes-path-fly"
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '60ch' }}
          >
            <h3 style={KICKER_STYLE}>
              <span aria-hidden="true" style={{ marginRight: '0.5em' }}>3</span>
              {t('zkqes.pathFly.label', 'Fly.io launcher')}
            </h3>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '14px', lineHeight: 1.5 }}>
              {t(
                'zkqes.pathFly.body',
                'For everyone else. One form, your handle, your Fly token; we boot a 32 GB performance-2x machine, run snarkjs against the latest round, attest, and tear it down. Roughly $0.30/round and Fly’s free tier covers it.',
              )}
            </p>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>
              <Link to="/ceremony/contribute" className="ct-link">
                {t('zkqes.pathFly.cta', 'Open the Fly launcher →')}
              </Link>
            </p>
          </article>
        </section>

        <hr className="ct-divider" />

        {/* Status feed link — points at /ceremony, where the live
            contributor chain renders. */}
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '14px',
            fontStyle: 'italic',
          }}
          data-testid="zkqes-status-link"
        >
          <span aria-hidden="true" style={{ marginRight: '0.5em' }}>·</span>
          <Link to="/ceremony" className="ct-link">
            {t(
              'zkqes.statusLink',
              'Live ceremony status — every contributor, every round →',
            )}
          </Link>
        </p>

        <hr className="ct-divider" style={{ marginTop: '32px', marginBottom: '24px' }} />

        {/* Project umbrella framing — surfaced last per BRAND.md */}
        <section
          aria-labelledby="umbrella-heading"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <h2
            id="umbrella-heading"
            style={{
              fontFamily: 'var(--display)',
              fontSize: '28px',
              lineHeight: 1,
              margin: 0,
            }}
          >
            {t('zkqes.umbrellaHeading', 'About zkqes')}
          </h2>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '14px',
              lineHeight: 1.5,
              maxWidth: '60ch',
            }}
          >
            {t(
              'zkqes.umbrellaBody',
              'zkqes is a zero-knowledge proof of a qualified electronic signature. Any state-issued credential exhibits a property: the issuing authority retains the ability to identify a holder under lawful process. zkqes surfaces this property on-chain — every-day pseudonymity for the holder, recoverable accountability for the state, the same trust structure as the qualified electronic signature itself.',
            )}
          </p>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>
            <a
              href="https://docs.zkqes.org"
              rel="noopener noreferrer"
              className="ct-link"
              data-testid="zkqes-docs-link"
            >
              {t('zkqes.docsLink', 'Specs, install, reference at docs.zkqes.org →')}
            </a>
          </p>
        </section>
      </div>
      <DocumentFooter />
    </main>
  );
}
