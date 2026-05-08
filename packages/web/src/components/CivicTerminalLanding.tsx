// Variant D — "Curve router · dense" — pre-launch shell.
//
// Prototype gated behind `?variant=civic-terminal`. Default `/` still
// renders `LandingHero` (the recruitment-CTA hero shipped in #60). This
// file exists so founder + lead can review variant D in real browser
// context (`https://zkqes.org/?variant=civic-terminal`) before deciding
// whether to flip the live surface.
//
// The wireframe was designed as POST-launch UI ("enter the protocol"
// terminal-density router) — round 2/3 marquee, recent-bindings ledger,
// active register/rotate/verify tabs. We're pre-launch (recruiting for
// Phase B ceremony, Sepolia §9.4 not yet green), so the live-data slots
// are graceful empty-states:
//
//   - Marquee: "ceremony round 0 of 10 · recruiting" (not "round 2/3 ·
//     ● live"). Reads from /ceremony/status.json if available; falls
//     back to recruiting copy if feed is unreachable or planned.
//   - LEFT "YOU WILL NEED": Diia + EU QTSP + EOA wallet on Base + RAM
//     requirement (carries from current LandingHero CTAs).
//   - MIDDLE: tabs (Register / Rotate / Verify) DISABLED with hover
//     "available after Phase B + Sepolia §9.4". BINDING STATEMENT field
//     shows what users will sign post-launch.
//   - RIGHT: "CEREMONY ATTESTATIONS" — a contributor chain from the
//     real status feed. If empty, shows "awaiting first contributor".
//
// CSS: `civic-terminal.css` lifted verbatim from the wireframe bundle
// (see `packages/web/src/styles/civic-terminal.css`). Side-effect
// import here — when the variant flag is off, this component is never
// rendered AND never imported, so the CSS doesn't bundle into the
// default `/` route. Verified by `import.meta.env`-gated dynamic
// loading (see `routes/index.tsx`).
//
// References:
//   - Original wireframe variant D: `home-variants.jsx::HomeD_Marquee`
//   - Founder direction: variant D selected, full rebrand · replace ·
//     amend (this prototype downscoped to landing-only per lead)
//   - Lead dispatch: 2026-05-04, `feat/v5_3-zkqes-d-prototype`

import { Link } from '@tanstack/react-router';
import { type CeremonyContributor, type CeremonyPhase } from '../lib/ceremonyStatus';
import { useCeremonyPhase } from '../hooks/useCeremonyPhase';
import { Marquee } from './civic-terminal/Marquee';
import '../styles/civic-terminal.css';

// Frozen marketer-locked copy from plan §0.1 / BRAND.md v2 amendment §Frozen
// marketer-locked copy. Keep verbatim; rephrasing breaks the marketer review trail.
const DISABLED_TAB_TOOLTIP =
  'Available after trusted setup ceremony + Base Sepolia testnet deploy';
const BINDING_STATEMENT_PREVIEW =
  'Holders sign a binding statement that names a wallet, and prove the signature in zk — without disclosing it.';

/** Per-phase right-sidebar text for the Marquee. */
function sidebarTextForPhase(phase: CeremonyPhase): string {
  if (phase === 'recruiting') {
    return 'awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)';
  }
  if (phase === 'ceremony-live') {
    return 'last 7 attested rounds + current-round pulse';
  }
  return 'full chain + beacon panel';
}

// ---------------------------------------------------------------- //
// Inline ASCII art — original schematic per wireframe bundle.       //
// Kept inline (not in a JSON fixture) so this prototype is fully    //
// self-contained.                                                   //
// ---------------------------------------------------------------- //

const ASCII_PIPELINE = `\
    ┌─ QTSP ─┐    ┌─ Diia.Sign ─┐    ┌─ Groth16 ─┐    ┌─ Base L2 ─┐
    │  EU    │ ─► │   QES sig   │ ─► │  zkproof  │ ─► │  nullifier│
    │ LOTL   │    │  CMS / CAdES│    │   ~20KB   │    │   anchor  │
    └────────┘    └─────────────┘    └───────────┘    └───────────┘
        ▲                                   ▲
        │                                   │
       trust                              ceremony
       list                                params`;

// ---------------------------------------------------------------- //
// Small inline primitives. Kept inside this file to make the       //
// prototype trivially deletable — no extra components/ entries.    //
// If we adopt variant D site-wide, these get extracted to          //
// components/civic-terminal/ as a follow-up.                       //
// ---------------------------------------------------------------- //

function CivicStripe() {
  return (
    <div className="ct-civic-stripe" aria-hidden="true">
      <i /><i /><i /><i />
    </div>
  );
}

function FlagUA() {
  return (
    <div className="ct-flag-ua" title="Україна">
      <i /><i />
    </div>
  );
}

function FlagEU() {
  return <div className="ct-flag-eu" title="EU">★</div>;
}

function CertNo({ children }: { children: React.ReactNode }) {
  return <span className="ct-cert-no">CERT.&nbsp;NO.&nbsp;{children}</span>;
}

function Tag({
  kind,
  children,
}: {
  kind?: 'ua' | 'eu' | 'ok' | 'warn' | 'err';
  children: React.ReactNode;
}) {
  return (
    <span className={`ct-tag ${kind ? `ct-tag--${kind}` : ''}`}>{children}</span>
  );
}

// ---------------------------------------------------------------- //
// Site header — civic stripe + nav. The nav links route to the     //
// existing TanStack Router routes; ceremony pages exist (#27,      //
// #34), so those work; register/rotate/verify links route to       //
// existing routes too (which under VITE_TARGET=landing show a      //
// "available after launch" state already). Variant URL-flag is     //
// preserved across nav so visitors stay in civic-terminal mode.    //
// ---------------------------------------------------------------- //

function SiteHeader() {
  // Preserve the variant flag on every internal link so visitors
  // don't fall off the prototype mid-navigation.
  const variantSearch = { variant: 'civic-terminal' } as const;
  return (
    <div style={{ borderBottom: '1.5px solid var(--ct-ink)' }}>
      <CivicStripe />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '10px 18px',
          background: 'var(--ct-paper)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FlagUA />
          <FlagEU />
          <span
            style={{
              fontFamily: 'var(--display)',
              fontSize: 26,
              letterSpacing: '.04em',
            }}
          >
            zkQES
          </span>
          <CertNo>v0&nbsp;·&nbsp;BASE-SEPOLIA</CertNo>
        </div>
        <div className="ct-spacer" />
        <Link
          to="/"
          search={variantSearch}
          className="ct-link"
          style={{
            textDecoration: 'underline',
            color: 'var(--ua-blue)',
            fontWeight: 600,
          }}
        >
          Home
        </Link>
        <Link
          to="/ceremony"
          search={variantSearch}
          className="ct-link"
          style={{ color: 'var(--ct-ink)' }}
        >
          Ceremony
        </Link>
        <Link
          to="/integrations"
          search={variantSearch}
          className="ct-link"
          style={{ color: 'var(--ct-ink)' }}
        >
          Docs
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- //
// Marquee status bar.                                              //
//                                                                   //
// v2 swap (2026-05-04): the prior `MarqueeBar` (a one-line strip)  //
// was replaced by the shared `<Marquee>` raised-panel chrome that  //
// /ceremony also uses. Phase comes from `useCeremonyPhase`; the    //
// per-phase right-column sidebar text comes from                   //
// `sidebarTextForPhase` above.                                     //
// ---------------------------------------------------------------- //

// ---------------------------------------------------------------- //
// Ceremony attestations — lifted from the contributor chain in     //
// the live status feed. Empty-state when the chain has zero        //
// completed rounds (the typical pre-launch state).                 //
// ---------------------------------------------------------------- //

function shortAttestation(att: string | undefined): string {
  if (!att) return '—';
  // Show first 4 + last 4 hex chars, like a wallet truncation.
  if (att.length <= 12) return att;
  return `${att.slice(0, 6)}…${att.slice(-4)}`;
}

function CeremonyAttestations({
  contributors,
}: {
  contributors: readonly CeremonyContributor[];
}) {
  if (contributors.length === 0) {
    return (
      <div className="ct-field">
        <span className="ct-legend">CEREMONY ATTESTATIONS</span>
        <div
          style={{
            fontSize: 11,
            color: 'var(--ct-mute)',
            padding: '14px 4px',
            textAlign: 'center',
          }}
        >
          awaiting first contributor
          <div style={{ marginTop: 6, fontSize: 10.5 }}>
            (10 needed · 32&nbsp;GB&nbsp;RAM each)
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="ct-field">
      <span className="ct-legend">CEREMONY ATTESTATIONS</span>
      <div className="ct-log ct-stack" style={{ gap: 2, fontSize: 11 }}>
        {contributors.slice(-7).map((c) => (
          <div key={`${c.round}-${c.name}`} className="ct-row-h">
            <span className="t">#{String(c.round).padStart(2, '0')}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.name}
            </span>
            <span className="t" style={{ fontSize: 10 }}>
              {shortAttestation(c.attestation)}
            </span>
            <span className="ok">✓</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- //
// Tab variants — register / rotate / verify.                       //
//                                                                   //
// v2 phase-driven swap: when phase === 'live' the tabs render as   //
// active TanStack `<Link>`s pointing into app.zkqes.org; otherwise //
// they render as visibly disabled `<span>`s with the FROZEN        //
// tooltip from plan §0.1 ("Available after trusted setup ceremony //
// + Base Sepolia testnet deploy"). The tooltip is asserted in unit //
// tests and locked by the marketer review trail — do not rephrase.//
// ---------------------------------------------------------------- //

function DisabledTab({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="ct-tab ct-tab--off"
      title={DISABLED_TAB_TOOLTIP}
      style={{
        opacity: 0.5,
        cursor: 'not-allowed',
        textDecoration: 'line-through',
      }}
    >
      {children}
    </span>
  );
}

function ActiveTab({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="ct-tab" href={href}>
      {children}
    </a>
  );
}

function PhaseAwareTabs({ phase }: { phase: CeremonyPhase }) {
  if (phase === 'live') {
    return (
      <>
        <ActiveTab href="https://app.zkqes.org/ua/registerV5">Register</ActiveTab>
        <ActiveTab href="https://app.zkqes.org/ceremony/verify">
          Verify a binding
        </ActiveTab>
      </>
    );
  }
  return (
    <>
      <DisabledTab>Register</DisabledTab>
      <DisabledTab>Verify a binding</DisabledTab>
    </>
  );
}

// ---------------------------------------------------------------- //
// Main component                                                    //
// ---------------------------------------------------------------- //

export function CivicTerminalLanding() {
  // Read phase + status from the single-source-of-truth hook. When the feed
  // is unreachable (network, 404, parse error), `phase` is null and we fall
  // back to recruiting per spec §4.5.
  const { phase, status } = useCeremonyPhase();
  const effectivePhase: CeremonyPhase = phase ?? 'recruiting';
  const effectiveTotal = status?.totalRounds ?? 0;
  const effectiveRound = status?.round ?? 0;

  return (
    <div
      className="ct ct-page"
      style={{ minHeight: '100vh', background: 'var(--ct-paper)' }}
    >
      <SiteHeader />
      <div style={{ padding: 18 }}>
        <div className="ct-panel" style={{ padding: 0 }}>
          <Marquee
            phase={effectivePhase}
            round={effectiveRound}
            totalRounds={effectiveTotal}
            sidebarText={sidebarTextForPhase(effectivePhase)}
          />

          <div
            style={{
              padding: 18,
              display: 'grid',
              gridTemplateColumns: '260px 1fr 260px',
              gap: 16,
            }}
          >
            {/* LEFT — what you'll need */}
            <div className="ct-stack">
              <div className="ct-field">
                <span className="ct-legend">YOU WILL NEED</span>
                <div className="ct-stack" style={{ gap: 6, fontSize: 12 }}>
                  <div className="ct-row-h">
                    <FlagUA />
                    <span>Diia.Sign or any UA QES</span>
                  </div>
                  <div className="ct-row-h">
                    <FlagEU />
                    <span>or any EU QTSP cert</span>
                  </div>
                  <div>· An EOA wallet on Base</div>
                  <div>
                    · A computer with ≥38&nbsp;GB&nbsp;RAM{' '}
                    <i style={{ color: 'var(--ct-mute)' }}>or</i> the CLI
                    prover (post-launch)
                  </div>
                </div>
              </div>
              <div className="ct-field">
                <span className="ct-legend">CONTRIBUTE NOW</span>
                <div className="ct-stack" style={{ gap: 8, fontSize: 12 }}>
                  <div>
                    Phase B ceremony is recruiting 10 contributors,
                    32&nbsp;GB&nbsp;RAM each. Help bind the trust&nbsp;list
                    onchain.
                  </div>
                  <Link
                    to="/ceremony"
                    search={{ variant: 'civic-terminal' }}
                    className="ct-btn ct-btn--primary"
                    style={{ justifyContent: 'center' }}
                  >
                    ▶ Help with the ceremony
                  </Link>
                </div>
              </div>
            </div>

            {/* MIDDLE — the act. Tabs phase-aware (active when live, otherwise disabled with frozen tooltip). */}
            <div className="ct-stack">
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <PhaseAwareTabs phase={effectivePhase} />
                <span className="ct-spacer" />
                <CertNo>
                  {effectivePhase === 'live'
                    ? 'ZK·2026·LIVE'
                    : 'ZK·2026·PENDING'}
                </CertNo>
              </div>
              <div className="ct-field" style={{ paddingTop: 22 }}>
                <span className="ct-legend">BINDING STATEMENT · PREVIEW</span>
                <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                  {/* Frozen marketer copy from plan §0.1 — verbatim. */}
                  {BINDING_STATEMENT_PREVIEW}
                </div>
                <div className="ct-divider--dashed" style={{ margin: '10px 0' }} />
                <div className="ct-row-h">
                  {effectivePhase === 'live' ? (
                    <>
                      <a
                        href="https://app.zkqes.org/ua/registerV5"
                        className="ct-link"
                        style={{ fontSize: 11, color: 'var(--ct-ink)' }}
                      >
                        Sign in →
                      </a>
                      <span className="ct-spacer" />
                      <Tag kind="ok">LIVE</Tag>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: 'var(--ct-mute)' }}>
                        Wallet binding flow opens after the trusted setup
                        ceremony + Base Sepolia testnet deploy.
                      </span>
                      <span className="ct-spacer" />
                      <Tag kind="warn">PRE-LAUNCH</Tag>
                    </>
                  )}
                </div>
              </div>
              <pre className="ct-ascii ct-ascii--dense">{ASCII_PIPELINE}</pre>
              <div className="ct-row-h" style={{ gap: 10, marginTop: 4 }}>
                <Tag kind="ua">UA · Diia.Sign</Tag>
                <Tag kind="eu">EU · QTSP</Tag>
                <Tag kind="ok">Groth16 · ~20KB proof</Tag>
                <Tag>Base L2</Tag>
              </div>
            </div>

            {/* RIGHT — public attestation chain */}
            <div className="ct-stack">
              <CeremonyAttestations
                contributors={status?.contributors ?? []}
              />
              <Link
                to="/ceremony"
                search={{ variant: 'civic-terminal' }}
                className="ct-btn ct-btn--lg"
                style={{ justifyContent: 'center' }}
              >
                ▶ Read the ceremony brief
              </Link>
              <a
                href="https://docs.zkqes.org"
                className="ct-btn"
                style={{ justifyContent: 'center' }}
              >
                Read the docs ▸
              </a>
            </div>
          </div>

          {/* Footer ribbon */}
          <div
            style={{
              borderTop: '1.5px solid var(--ct-ink)',
              padding: '6px 18px',
              display: 'flex',
              gap: 14,
              fontSize: 10.5,
              color: 'var(--ct-mute)',
            }}
          >
            <span>FORM REVISION 04 · MAY 2026</span>
            <span>VARIANT D · PROTOTYPE</span>
            <span className="ct-spacer" />
            <span>?variant=civic-terminal · gated review surface</span>
          </div>
        </div>
      </div>
    </div>
  );
}
