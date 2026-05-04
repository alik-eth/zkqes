// CeremonyShell — /ceremony 3-col civic-terminal composition.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 6.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §4 (full /ceremony surface).
//
// Layout: 260px / 1fr / 260px (matches Landing). Marquee + FooterRibbon are
// the shared chrome from `civic-terminal/`. Body columns render
// `PathCards`, `RoundChain`, and `PasteAttestation + TrustBudget +
// CeremonyFaq`. Status-feed-down fallback collapses the left column to
// the COORD attribution per spec §4.5; the middle column falls back to the
// recruitment-cards-grid via `RoundChain`'s `totalRounds === 0` branch.

import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { Marquee } from '../civic-terminal/Marquee';
import { FooterRibbon } from '../civic-terminal/FooterRibbon';
import { PathCards } from './PathCards';
import { RoundChain } from './RoundChain';
import { PasteAttestation } from './PasteAttestation';
import { TrustBudget } from './TrustBudget';
import { CeremonyFaq } from './CeremonyFaq';
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

function sidebarTextForCeremonyPhase(phase: CeremonyPhase): string {
  if (phase === 'recruiting') return 'COORD: alik.eth';
  if (phase === 'ceremony-live') return 'live ceremony · attestations below';
  return 'ceremony complete · beacon applied';
}

export function CeremonyShell() {
  const { phase, status, error } = useCeremonyPhase();
  const effectivePhase: CeremonyPhase = phase ?? 'recruiting';
  const totalRounds = status?.totalRounds ?? 0;
  const round = status?.round ?? 0;

  // Status-feed-down fallback per spec §4.5: collapse the left column to
  // COORD-only when the feed is unreachable AND we have no cached data.
  const collapseLeft = error !== null && status === null;
  const middleStatus: CeremonyStatusPayload = status ?? EMPTY_STATUS;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
    >
      <Marquee
        phase={effectivePhase}
        round={round}
        totalRounds={totalRounds}
        sidebarText={sidebarTextForCeremonyPhase(effectivePhase)}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr 260px',
          gap: 'var(--ct-gap)',
          padding: 'var(--ct-pad)',
          flex: 1,
        }}
      >
        <PathCards collapseToCoord={collapseLeft} />
        <RoundChain status={middleStatus} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ct-gap)',
          }}
        >
          {status && <PasteAttestation status={status} />}
          {status && <TrustBudget contributors={status.contributors} />}
          <CeremonyFaq />
        </div>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
