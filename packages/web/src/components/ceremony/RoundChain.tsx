// RoundChain — /ceremony middle column.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 5.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §4.3.
//
// Renders rounds 1..N as ct-panel rows with three states:
//   done           — completed-round panel with contributor name + attestation
//   in-progress    — raised panel with warn-tag highlighting the live round
//   pending        — half-opacity panel with "awaiting contributor" copy
//
// Plus:
//   - ROUND-ZERO SEED panel pinned at the top (admin-bootstrapped initial KZG).
//   - BEACON APPLIED inset panel emitted when phase === 'live' + beaconHash set.
//   - Fallback render when totalRounds === 0 (status feed reachable but
//     ceremony hasn't seeded; promote a "contribute a round" CTA).

import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

function truncate(hex: string, chars = 16): string {
  return hex.length > chars ? `${hex.slice(0, chars)}…` : hex;
}

interface RoundChainProps {
  readonly status: CeremonyStatusPayload;
}

export function RoundChain({ status }: RoundChainProps) {
  const {
    round,
    totalRounds,
    contributors,
    beaconHash,
    finalZkeySha256,
    phase,
  } = status;

  if (totalRounds === 0) {
    return (
      <section
        style={{
          display: 'grid',
          gap: 'var(--ct-gap)',
          fontFamily: 'var(--mono)',
        }}
      >
        <div
          className="ct-panel ct-panel--raised"
          style={{ padding: '24px', textAlign: 'center' }}
        >
          <h2 style={{ fontFamily: 'var(--display)', fontSize: '32px' }}>
            contribute a round
          </h2>
          <p>round-zero hasn't seeded yet. See the cookbook to participate.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{ display: 'grid', gap: 'var(--ct-gap)', fontFamily: 'var(--mono)' }}
    >
      <div className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
        <span className="ct-tag">ROUND-ZERO SEED</span> — admin-bootstrapped
      </div>
      {Array.from({ length: totalRounds }, (_, i) => i + 1).map((roundN) => {
        // CeremonyContributor.round is 1-indexed (see lib/ceremonyStatus.ts);
        // a single contributor maps to exactly one round panel.
        const done = contributors.find((c) => c.round === roundN);
        if (done) {
          return (
            <div
              key={roundN}
              className="ct-panel"
              style={{ padding: 'var(--ct-pad)' }}
            >
              <strong>ROUND {roundN}</strong> · {done.name} ·{' '}
              {done.attestation ? truncate(done.attestation) : ''}
              <div style={{ fontSize: '11px', color: 'var(--ct-mute)' }}>
                ✓ verify · {new Date(done.completedAt).toLocaleString()}
              </div>
            </div>
          );
        }
        if (roundN === round + 1 && phase === 'ceremony-live') {
          return (
            <div
              key={roundN}
              className="ct-panel ct-panel--raised"
              style={{ padding: 'var(--ct-pad)' }}
            >
              <span className="ct-tag ct-tag--warn">ROUND {roundN}</span> · in
              progress
            </div>
          );
        }
        return (
          <div
            key={roundN}
            className="ct-panel"
            style={{ padding: 'var(--ct-pad)', opacity: 0.5 }}
          >
            ROUND {roundN} · awaiting contributor
          </div>
        );
      })}
      {phase === 'live' && beaconHash && (
        <div
          className="ct-panel ct-panel--inset"
          style={{ padding: 'var(--ct-pad)' }}
        >
          <span className="ct-tag">BEACON APPLIED</span> ·{' '}
          {truncate(beaconHash, 20)}
          {finalZkeySha256 && (
            <div>final zkey: {truncate(finalZkeySha256, 20)}</div>
          )}
        </div>
      )}
    </section>
  );
}
