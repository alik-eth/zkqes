// CeremonyShell — /ceremony civic-terminal v3 split surface.
//
// Task #87 (2026-05-05): the v2 3-col composition (PathCards + RoundChain
// + PasteAttestation/TrustBudget/CeremonyFaq) is replaced by the v3
// "Ceremony D Split" — a 50/50 split with a STATUS pane on the left and
// a WE NEED YOU recruitment pane on the right. Founder pick per the
// Claude Design handoff at /tmp/zkqes-design/zk-qes-3/. Wireframe source:
// `ceremony-variants.jsx::CeremonyD_Split` (lines 231–299).
//
// Layout:
//   ┌─────────────────────────────┬─────────────────────────────┐
//   │ STATUS                      │ WE NEED YOU  (UA-blue)      │
//   │ The chain so far            │ Make us trustworthy.        │
//   │ <RoundChain> attestations   │ <FOUR COMMANDS preview>     │
//   │ • All hashes verified       │ [contributor guide] [FAQ]   │
//   │ • Append-only · IPFS-pinned │ RAM ≥ 32 GB · ~25 min · $   │
//   └─────────────────────────────┴─────────────────────────────┘
//
// Live-data substitutions (per the mock→live convention from the
// 2026-05-05 web-eng handoff note):
//
//   • Wireframe shipped a 10-row hardcoded attestations log (alik.eth-
//     style fake handles + "9f81…" fake hashes). We render
//     `<RoundChain status={…}>` instead, which is driven by the live
//     `useCeremonyPhase` payload — contributor names, real attestation
//     hashes, "awaiting contributor" pending rows, beacon panel, etc.
//     Pre-launch (no contributors yet) it falls back to the empty-state
//     CTA; a status-feed-down condition surfaces a "feed unavailable"
//     line below the chain. This keeps the v2 e2e assertions
//     (`alik.eth`, `pse.research`, "awaiting contributor") green and
//     never ships canned data.
//
//   • Wireframe FOUR COMMANDS read `cargo build -p zkqes-mpc` etc.;
//     no such Rust binary exists — the real ceremony is snarkjs-based
//     per /ceremony/contribute. We render a 4-line snarkjs preview
//     here and link to the full contributor guide (with copy buttons,
//     signed-URL handoff, Fly launcher form) at `/ceremony/contribute`.
//     This is a deliberate gap: design intent (recruit by showing it
//     fits in four lines) preserved, technical accuracy maintained.
//
//   • Wireframe stats said "RAM ≥ 64 GB · Time ~22 min". The
//     production-tested numbers from the snarkjs cookbook are 32 GB
//     RAM peak (~30 GB observed) and 20–25 min wall-clock; the Fly
//     cookbook costs ~$0.40 on a CCX33 instance. We use those.

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { Marquee } from '../civic-terminal/Marquee';
import { FooterRibbon } from '../civic-terminal/FooterRibbon';
import { RoundChain } from './RoundChain';
import {
  type CeremonyPhase,
  type CeremonyStatusPayload,
} from '../../lib/ceremonyStatus';

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

const EMPTY_STATUS: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 0,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

// Snarkjs four-command preview. The full guide at /ceremony/contribute
// has copy buttons, signed-URL handoff, and Fly-launch form. Kept as
// a code constant (not i18n) to preserve monospace alignment; the
// pre's aria-label below carries a translatable summary.
const FOUR_COMMANDS_PREVIEW = `$ curl -O https://prove.zkqes.org/ceremony/round-N-prev.zkey
$ snarkjs zkey contribute round-N-prev.zkey round-N-mine.zkey
$ snarkjs zkey verify zkqes-v5.r1cs powers22.ptau round-N-mine.zkey
$ curl -X PUT --data-binary @round-N-mine.zkey "$SIGNED_URL"`;

function sidebarTextForCeremonyPhase(phase: CeremonyPhase): string {
  if (phase === 'recruiting') return 'COORD: alik.eth';
  if (phase === 'ceremony-live') return 'live ceremony · attestations below';
  return 'ceremony complete · beacon applied';
}

export function CeremonyShell() {
  const { t } = useTranslation();
  const { phase, status, error } = useCeremonyPhase();

  const effectivePhase: CeremonyPhase = phase ?? 'recruiting';
  const totalRounds = status?.totalRounds ?? 0;
  const round = status?.round ?? 0;

  // Status-feed-down posture: render the chain's empty-state branch
  // (RoundChain handles `totalRounds === 0` with its own CTA panel),
  // and surface an error line below the tags so the user knows the
  // feed didn't load — without scaring them off the recruit pane.
  const middleStatus: CeremonyStatusPayload = status ?? EMPTY_STATUS;
  const feedDown = error !== null && status === null;

  return (
    <main
      className="ct ct-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
      data-testid="ceremony-v3-shell"
    >
      <Marquee
        phase={effectivePhase}
        round={round}
        totalRounds={totalRounds}
        sidebarText={sidebarTextForCeremonyPhase(effectivePhase)}
      />
      <div
        className="ct-grid-2"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          flex: 1,
          alignItems: 'stretch',
        }}
      >
        <StatusPane status={middleStatus} feedDown={feedDown} t={t} />
        <RecruitPane t={t} />
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}

interface StatusPaneProps {
  readonly status: CeremonyStatusPayload;
  readonly feedDown: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly t: any;
}

function StatusPane({ status, feedDown, t }: StatusPaneProps) {
  return (
    <section
      className="ct-stack"
      style={{
        padding: 24,
        borderRight: '1.5px solid var(--ct-ink)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      data-testid="ceremony-v3-status-pane"
    >
      <div className="ct-kicker">{t('ceremony.v3.statusKicker')}</div>
      <h2
        className="ct-display"
        style={{
          fontFamily: 'var(--display)',
          fontSize: 36,
          lineHeight: 1,
          margin: 0,
        }}
      >
        {t('ceremony.v3.chainHeading')}
      </h2>
      <RoundChain status={status} />
      <div
        className="ct-row-h"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        <span
          className="ct-tag ct-tag--ok"
          data-testid="ceremony-v3-tag-verified"
        >
          {t('ceremony.v3.tagsHashesVerified')}
        </span>
        <span className="ct-tag" data-testid="ceremony-v3-tag-append-only">
          {t('ceremony.v3.tagsAppendOnly')}
        </span>
      </div>
      {feedDown && (
        <p
          data-testid="ceremony-v3-feed-down"
          style={{
            fontSize: 12,
            color: 'var(--ct-mute)',
            margin: 0,
          }}
        >
          {t('ceremony.v3.feedDown')}
        </p>
      )}
    </section>
  );
}

interface RecruitPaneProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly t: any;
}

function RecruitPane({ t }: RecruitPaneProps) {
  return (
    <section
      className="ct-stack"
      style={{
        padding: 24,
        background: 'var(--ua-blue)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
      data-testid="ceremony-v3-recruit-pane"
    >
      <div
        className="ct-kicker"
        style={{ color: 'var(--ua-yellow)' }}
      >
        {t('ceremony.v3.recruitKicker')}
      </div>
      <h2
        className="ct-display"
        style={{
          fontFamily: 'var(--display)',
          fontSize: 44,
          lineHeight: 1,
          color: '#fff',
          margin: 0,
        }}
      >
        {t('ceremony.v3.recruitHeading')}
      </h2>
      <p style={{ fontSize: 14, margin: 0, maxWidth: 480 }}>
        {t('ceremony.v3.recruitLede')}
      </p>
      <div
        className="ct-field"
        style={{
          background: 'rgba(0,0,0,.3)',
          borderColor: 'var(--ua-yellow)',
          color: '#fff',
          padding: 'var(--ct-pad)',
        }}
      >
        <span
          className="ct-legend"
          style={{ background: 'var(--ua-blue)', color: 'var(--ua-yellow)' }}
        >
          {t('ceremony.v3.commandsLegend')}
        </span>
        <pre
          className="ct-ascii"
          aria-label={t('ceremony.v3.commandsAria')}
          style={{ color: '#fff', fontSize: 11.5, margin: 0 }}
          data-testid="ceremony-v3-commands"
        >
          {FOUR_COMMANDS_PREVIEW}
        </pre>
        <p
          style={{
            fontSize: 11.5,
            color: 'var(--ua-yellow)',
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {t('ceremony.v3.commandsCaption')}
        </p>
      </div>
      <div
        className="ct-row-h"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
      >
        <Link
          to="/ceremony/contribute"
          className="ct-btn ct-btn--ua ct-btn--lg"
          style={{ borderColor: 'var(--ua-yellow)' }}
          data-testid="ceremony-v3-cta-guide"
        >
          ▶ {t('ceremony.v3.ctaContribute')}
        </Link>
        <a
          href="https://docs.zkqes.org/faq/"
          target="_blank"
          rel="noopener noreferrer"
          className="ct-btn ct-btn--lg"
          style={{
            background: 'transparent',
            color: '#fff',
            borderColor: '#fff',
          }}
          data-testid="ceremony-v3-cta-questions"
        >
          {t('ceremony.v3.ctaQuestions')}
        </a>
      </div>
      <div
        className="ct-divider--dashed"
        style={{ borderColor: 'var(--ua-yellow)' }}
      />
      <dl
        className="ct-stack"
        style={{
          gap: 4,
          fontSize: 12,
          margin: 0,
        }}
        data-testid="ceremony-v3-stats"
      >
        <StatRow label={t('ceremony.v3.statRam')} value={t('ceremony.v3.statRamValue')} />
        <StatRow label={t('ceremony.v3.statTime')} value={t('ceremony.v3.statTimeValue')} />
        <StatRow label={t('ceremony.v3.statCost')} value={t('ceremony.v3.statCostValue')} />
      </dl>
    </section>
  );
}

function StatRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div
      className="ct-row-h"
      style={{ display: 'flex', alignItems: 'baseline' }}
    >
      <dt style={{ flex: 1, margin: 0 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );
}
