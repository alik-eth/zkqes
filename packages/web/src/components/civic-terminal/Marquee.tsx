// Marquee — phase-driven civic-terminal chrome shared by Landing + /ceremony.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 2.
// BRAND.md §Phase-LED states + §Surface grammar (v2 amendment).
//
// Renders a 3-column raised panel:
//   left   — coloured LED + phase text
//   center — round count (`round N of M`, with HN-screenshot empty-state)
//   right  — caller-supplied sidebar string (changes per surface + phase)
//
// All visual tokens come from civic-terminal.css; no inline tokens drift the
// brand.

import type { CeremonyPhase } from '../../lib/ceremonyStatus';

interface MarqueeProps {
  readonly phase: CeremonyPhase;
  readonly round: number;
  readonly totalRounds: number;
  readonly sidebarText: string;
}

/** Maps the v2 phase to the LED colour name surfaced via `data-led-color`. */
const LED_COLORS: Record<CeremonyPhase, 'yellow' | 'green' | 'blue'> = {
  recruiting: 'yellow',
  'ceremony-live': 'green',
  live: 'blue',
};

/** Maps the LED colour to the civic-terminal CSS variable that paints it. */
const LED_VAR: Record<'yellow' | 'green' | 'blue', string> = {
  yellow: 'var(--ua-yellow)',
  green: 'var(--ok)',
  blue: 'var(--eu-blue)',
};

/** Maps phase to its lower-case label rendered next to the LED. */
const PHASE_TEXT: Record<CeremonyPhase, string> = {
  recruiting: 'recruiting',
  'ceremony-live': 'ceremony-live',
  live: 'live',
};

/**
 * Format the centre-column round count.
 * - `totalRounds === 0` → "round — of —" (HN-screenshot mitigation per
 *   plan §0.1: a stale "round 0 of 0" implies the ceremony is broken).
 * - `live` post-final → "round N of N · complete".
 * - `ceremony-live` → "round N of M · in progress".
 * - otherwise → "round N of M".
 */
function formatCount(
  round: number,
  totalRounds: number,
  phase: CeremonyPhase,
): string {
  if (totalRounds === 0) return 'round — of —';
  if (phase === 'live' && round >= totalRounds) {
    return `round ${totalRounds} of ${totalRounds} · complete`;
  }
  if (phase === 'ceremony-live') {
    return `round ${round} of ${totalRounds} · in progress`;
  }
  return `round ${round} of ${totalRounds}`;
}

export function Marquee({ phase, round, totalRounds, sidebarText }: MarqueeProps) {
  const ledColor = LED_COLORS[phase];
  return (
    <div
      className="ct-panel ct-panel--raised"
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 260px',
        padding: 'var(--ct-pad)',
        fontFamily: 'var(--display)',
        fontSize: '22px',
        color: 'var(--ct-ink)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          aria-label={`phase: ${phase}`}
          data-led-color={ledColor}
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: LED_VAR[ledColor],
          }}
        />
        <span>{PHASE_TEXT[phase]}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        {formatCount(round, totalRounds, phase)}
      </div>
      <div
        style={{
          textAlign: 'right',
          fontSize: '13px',
          fontFamily: 'var(--mono)',
        }}
      >
        {sidebarText}
      </div>
    </div>
  );
}
