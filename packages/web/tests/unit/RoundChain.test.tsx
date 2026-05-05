// RoundChain — /ceremony middle column.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 5.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundChain } from '../../src/components/ceremony/RoundChain';
import type { CeremonyStatusPayload } from '../../src/lib/ceremonyStatus';

const baseStatus: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('RoundChain', () => {
  it('renders 10 placeholder rounds + ROUND-ZERO SEED panel when round=0 + totalRounds=10', () => {
    render(<RoundChain status={baseStatus} />);
    expect(screen.getAllByText(/awaiting contributor/).length).toBe(10);
    expect(screen.getByText(/ROUND-ZERO SEED/)).toBeInTheDocument();
  });

  it('renders done rounds with attestation hash + contributor name', () => {
    const status: CeremonyStatusPayload = {
      ...baseStatus,
      round: 2,
      contributors: [
        {
          name: 'alik.eth',
          round: 1,
          completedAt: '2026-05-10T10:00:00Z',
          attestation: '0xabcd1234',
        },
      ],
      phase: 'ceremony-live',
    };
    render(<RoundChain status={status} />);
    expect(screen.getByText(/alik\.eth/)).toBeInTheDocument();
    expect(screen.getByText(/0xabcd1234/)).toBeInTheDocument();
    // Exact-string match scopes the assertion to the <strong>ROUND 1</strong>
    // node in the alik panel; a regex like /ROUND 1/ would also pick up
    // "ROUND 10 · awaiting contributor" in the placeholder for the last row.
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
  });

  it('renders BEACON APPLIED panel when phase=live + beaconHash set', () => {
    const status: CeremonyStatusPayload = {
      ...baseStatus,
      round: 10,
      finalZkeySha256: '0xfinal',
      beaconBlockHeight: 21000000,
      beaconHash: '0xbeacon',
      phase: 'live',
    };
    render(<RoundChain status={status} />);
    expect(screen.getByText(/BEACON APPLIED/)).toBeInTheDocument();
    expect(screen.getByText(/0xbeacon/)).toBeInTheDocument();
  });

  it('renders fallback recruitment-cards-grid when totalRounds=0', () => {
    render(<RoundChain status={{ ...baseStatus, totalRounds: 0 }} />);
    expect(screen.queryByText(/awaiting contributor/)).not.toBeInTheDocument();
    expect(screen.getByText(/contribute a round/i)).toBeInTheDocument();
  });

  // Visual smoke for the v3 schema bump (ceremony-coord types.ts v3 →
  // web mirror, this commit). RoundChain reads only top-level fields
  // (round / totalRounds / contributors / beaconHash / etc.); the
  // optional `circuits` map MUST pass through without affecting render
  // output. Per-circuit visibility (e.g., "V5.3 round 3 / V5.4 round 2"
  // sub-display) is a future task.
  it('v3 payload — `circuits` field present, render output unchanged', () => {
    const v3: CeremonyStatusPayload = {
      ...baseStatus,
      round: 1,
      contributors: [
        {
          name: 'alik.eth',
          round: 1,
          completedAt: '2026-05-10T10:00:00Z',
          attestation: '0xabcd1234',
        },
      ],
      phase: 'ceremony-live',
      circuits: {
        'v5.3-identity': {
          round: 1,
          lastContributor: 'alik.eth',
          lastContributedAt: '2026-05-10T10:00:00Z',
        },
        'v5.4-age-diia-ua': {
          round: 0,
          lastContributor: null,
          lastContributedAt: null,
        },
      },
    };
    render(<RoundChain status={v3} />);
    // Same assertions as the single-round-done test above — the chain
    // renders round 1's done panel + the remaining placeholders.
    // `ROUND 1` is the canonical anchor (a stable text node);
    // contributor name lives inside a mixed text node so we regex-match.
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
    expect(screen.getByText(/alik\.eth/)).toBeInTheDocument();
    // Critically: NO leakage of per-circuit map names into the UI
    // (per-circuit surface is future work).
    expect(screen.queryByText(/v5\.3-identity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/v5\.4-age-diia-ua/i)).not.toBeInTheDocument();
  });
});
