// HomeDocument — `/` landing civic-terminal v3 surface.
//
// Task #87 (2026-05-05): the v2 `AppRegisterLanding` (KICKER + h1.ct-display
// + privacy <dl> + ceremony link) on the default `/` route is replaced by
// the v3 "Home C — Document" wireframe — a Form ZK-QES / 01 civic-document
// panel with a UA-blue/UA-yellow letterhead, a 2-column body (LEFT: ASCII
// document figure + Section I legal basis; RIGHT: Seal + Section II what
// you get + two CTAs), and a footer strip. Founder pick per the Claude
// Design handoff at /tmp/zkqes-design/zk-qes-3/. Wireframe source:
// `home-variants.jsx::HomeC_Document` (lines 116–171).
//
// Layout:
//   ┌─ Letterhead (UA-blue) ────────────────────────────────────────┐
//   │ [UA] [EU]  OFFICE OF THE ZERO-KNOWLEDGE REGISTRAR     [FORM #]│
//   │            FORM ZK-QES / 01 · BINDING WALLET TO QID            │
//   ├─ Body (1.2fr / 1fr) ──────────────────────────────────────────┤
//   │ <pre> ASCII document          │ <Seal/>                       │
//   │ § I — LEGAL BASIS             │ § II — WHAT YOU GET           │
//   │ · eIDAS 910/2014              │ · one nullifier per identity  │
//   │ · Law UA 2155-VIII            │ · wallets bound under it      │
//   │ · ceremony parameters         │ · rotate without correlation  │
//   │                               │ · zero correlation QES↔chain  │
//   │                               │ [▶ Begin filing] [Verify…]    │
//   ├─ Form-revision strip ─────────────────────────────────────────┤
//   └────────────────────────────────────────────────────────────────┘
//
// Landing-target safe (CLAUDE.md invariant #21): no wagmi, no SAB context,
// no snarkjs, no argon2-browser. Composes only from sharedRoutes-safe
// primitives — Marquee, FooterRibbon, useCeremonyPhase, TanStack <Link>,
// plain CSS.
//
// Mock→live substitutions, flagged per the convention:
//
//   • Wireframe shipped a fake "ZK · 2026 · 00001" cert no in the
//     letterhead. We render a stable form ID ("ZK · QES · V5") instead —
//     no fake serial, but the design intent (a recognisable "form
//     reference" in the corner of an official document) is preserved.
//
//   • Wireframe said "Ceremony parameters published 2026-04-12 ·
//     attested by 47 contributors". We wire the live useCeremonyPhase
//     payload instead — pre-launch (recruiting, no contributors) reads
//     "Ceremony parameters · in recruitment / round 0 of N", which is
//     honest about the current phase. If the feed is unreachable we
//     fall back to the recruiting posture verbatim.
//
//   • Wireframe footer said "FORM REVISION 04 · MAY 2026". We use a
//     stable revision constant ("FORM REVISION 01 · 2026") because the
//     v3 redesign IS revision 01 of the new form — counting prior
//     iterations as "revision 04" would read like fiction.
//
// CTAs route through TanStack `<Link>`:
//   • "Begin filing" (primary) → /ua/registerV5 — register flow entry.
//   • "Verify a binding" (secondary) → /verify — Verify A Lookup.

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { Marquee } from './Marquee';
import { FooterRibbon } from './FooterRibbon';
import type { CeremonyPhase } from '../../lib/ceremonyStatus';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

// Stable form reference in the letterhead — see Mock→live #1 above.
const FORM_REFERENCE = 'ZK · QES · V5';

// Stable revision — see Mock→live #3 above.
const FORM_REVISION = 'FORM REVISION 01 · 2026';

// ASCII document figure from the wireframe (`zkqes-shared.jsx` ASCII.document).
// Kept verbatim in code (not i18n) to preserve monospace alignment;
// `aria-label` below carries a translatable plain-text summary for
// screen readers.
const DOCUMENT_FIGURE = `
    ╔══════════════════════════════════════════════╗
    ║   BINDING STATEMENT · ЗАЯВА ПРО ПРИВ'ЯЗКУ   ║
    ╠══════════════════════════════════════════════╣
    ║                                              ║
    ║  I, the undersigned holder of a qualified    ║
    ║  electronic signature certificate issued     ║
    ║  pursuant to eIDAS Regulation (EU) 910/2014  ║
    ║  and the Law of Ukraine on Electronic Trust  ║
    ║  Services, hereby bind the wallet:           ║
    ║                                              ║
    ║      0x▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓        ║
    ║                                              ║
    ║  to my identity, without revealing it.       ║
    ║                                              ║
    ║  Issued: ▓▓▓▓-▓▓-▓▓     QTSP: ▓▓▓▓▓▓▓▓▓     ║
    ║                                              ║
    ║                       _________________      ║
    ║                       qualified signature    ║
    ╚══════════════════════════════════════════════╝
`;

function FlagUA() {
  return (
    <div className="ct-flag-ua" title="Україна" aria-hidden="true">
      <i />
      <i />
    </div>
  );
}

function FlagEU() {
  return (
    <div className="ct-flag-eu" title="EU" aria-hidden="true">
      ★
    </div>
  );
}

/** Per-phase sidebar string for the Marquee — mirrors CivicTerminalLanding. */
function sidebarTextForPhase(phase: CeremonyPhase): string {
  if (phase === 'recruiting') {
    return 'awaiting first contributor (10 needed · ≥32 GB RAM)';
  }
  if (phase === 'ceremony-live') {
    return 'ceremony live · attestations on /ceremony';
  }
  return 'live · register / rotate / verify';
}

export function HomeDocument() {
  const { t } = useTranslation();
  const { phase, status } = useCeremonyPhase();
  const effectivePhase: CeremonyPhase = phase ?? 'recruiting';
  const effectiveTotal = status?.totalRounds ?? 0;
  const effectiveRound = status?.round ?? 0;

  // Live cert-line under SECTION I legal basis. Honest about the phase
  // — pre-launch (recruiting) we show round 0 of N (or the HN-screenshot
  // mitigation `— of —` when N is also 0); ceremony-live and live use
  // the live count.
  const ceremonyParams =
    effectivePhase === 'recruiting'
      ? t('landing.v3.legal.ceremonyRecruiting', {
          total: effectiveTotal > 0 ? effectiveTotal : '—',
        })
      : effectivePhase === 'ceremony-live'
        ? t('landing.v3.legal.ceremonyLive', {
            round: effectiveRound,
            total: effectiveTotal,
          })
        : t('landing.v3.legal.ceremonyComplete', {
            total: effectiveTotal,
          });

  return (
    <main
      className="ct ct-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
      data-testid="home-document-v3-shell"
    >
      <Marquee
        phase={effectivePhase}
        round={effectiveRound}
        totalRounds={effectiveTotal}
        sidebarText={sidebarTextForPhase(effectivePhase)}
      />

      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '28px 24px',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <div
          className="ct-panel"
          style={{ padding: 0, background: 'var(--ct-paper-2)' }}
          data-testid="home-document-v3-panel"
        >
          {/* Letterhead — UA-blue band, FlagUA + FlagEU + office heading */}
          <div
            style={{
              background: 'var(--ua-blue)',
              color: '#fff',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              borderBottom: '1.5px solid var(--ct-ink)',
            }}
            data-testid="home-document-v3-letterhead"
          >
            <FlagUA />
            <FlagEU />
            <div>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: 22,
                  lineHeight: 1,
                }}
              >
                {t('landing.v3.letterhead.office')}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: '0.18em',
                  color: 'var(--ua-yellow)',
                  marginTop: 4,
                }}
              >
                {t('landing.v3.letterhead.formId')}
              </div>
            </div>
            <div className="ct-spacer" />
            <span
              className="ct-cert-no"
              style={{ color: 'var(--ua-yellow)' }}
              data-testid="home-document-v3-form-ref"
            >
              {FORM_REFERENCE}
            </span>
          </div>

          {/* Body — 1.2fr / 1fr split */}
          <div
            style={{
              padding: 24,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
              gap: 24,
            }}
          >
            {/* LEFT — ASCII document figure + Section I legal basis */}
            <div className="ct-stack" data-testid="home-document-v3-left">
              <pre
                className="ct-ascii"
                aria-label={t('landing.v3.documentFigure.aria')}
                style={{ margin: 0 }}
              >
                {DOCUMENT_FIGURE}
              </pre>
              <div className="ct-field">
                <span className="ct-legend">
                  {t('landing.v3.legal.legend')}
                </span>
                <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                  <div>
                    ·{' '}
                    {t('landing.v3.legal.eidas', {
                      reg: '910/2014',
                    })}
                  </div>
                  <div>· {t('landing.v3.legal.uaLaw')}</div>
                  <div data-testid="home-document-v3-ceremony-params">
                    ·{' '}
                    <span style={{ color: 'var(--ua-blue)' }}>
                      {ceremonyParams}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT — Seal + Section II + CTAs */}
            <div className="ct-stack" data-testid="home-document-v3-right">
              <div
                className="ct-seal"
                role="img"
                aria-label={t('landing.v3.seal.aria')}
                data-testid="home-document-v3-seal"
              >
                <span>
                  <b>zkQES</b>
                  {t('landing.v3.seal.label')}
                </span>
              </div>
              <div className="ct-field">
                <span className="ct-legend">
                  {t('landing.v3.benefits.legend')}
                </span>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                  }}
                >
                  <li>{t('landing.v3.benefits.oneNullifier')}</li>
                  <li>{t('landing.v3.benefits.boundWallets')}</li>
                  <li>{t('landing.v3.benefits.rotate')}</li>
                  <li>{t('landing.v3.benefits.zeroCorrelation')}</li>
                </ul>
              </div>
              <div className="ct-row-h" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Link
                  to="/ua/registerV5"
                  className="ct-btn ct-btn--primary ct-btn--lg"
                  data-testid="home-document-v3-cta-begin"
                >
                  ▶ {t('landing.v3.cta.beginFiling')}
                </Link>
                <Link
                  to="/verify"
                  className="ct-btn ct-btn--lg"
                  data-testid="home-document-v3-cta-verify"
                >
                  {t('landing.v3.cta.verify')}
                </Link>
              </div>
            </div>
          </div>

          {/* Form-revision strip */}
          <div
            style={{
              borderTop: '1.5px solid var(--ct-ink)',
              padding: '6px 18px',
              display: 'flex',
              gap: 14,
              fontSize: 10.5,
              color: 'var(--ct-mute)',
            }}
            data-testid="home-document-v3-revision-strip"
          >
            <span>{FORM_REVISION}</span>
            <span>{t('landing.v3.revision.supersedes')}</span>
            <span className="ct-spacer" />
            <span>{t('landing.v3.revision.page')}</span>
          </div>
        </div>
      </div>

      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
