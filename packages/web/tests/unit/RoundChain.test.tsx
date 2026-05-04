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
});
