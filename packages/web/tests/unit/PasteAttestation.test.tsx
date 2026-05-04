// PasteAttestation — published-list membership verification widget.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 6.
//
// NOTE: this is NOT a cryptographic chain verify; it's a lookup against the
// published attestation list. The full chain-verify (~30 GB peak) is offered
// as the `zkqes verify-ceremony` CLI per spec §4.4.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PasteAttestation } from '../../src/components/ceremony/PasteAttestation';
import type { CeremonyStatusPayload } from '../../src/lib/ceremonyStatus';

const status: CeremonyStatusPayload = {
  round: 3,
  totalRounds: 10,
  contributors: [
    {
      name: 'alik.eth',
      round: 1,
      completedAt: '2026-05-10T10:00:00Z',
      attestation: '0xaaa',
    },
    {
      name: 'pse.research',
      round: 2,
      completedAt: '2026-05-11T10:00:00Z',
      attestation: '0xbbb',
    },
    {
      name: 'mopro',
      round: 3,
      completedAt: '2026-05-12T10:00:00Z',
      attestation: '0xccc',
    },
  ],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'ceremony-live',
};

describe('PasteAttestation', () => {
  it('shows ✓ result + round + contributor when attestation matches', () => {
    render(<PasteAttestation status={status} />);
    fireEvent.change(screen.getByPlaceholderText(/paste attestation/i), {
      target: { value: '0xbbb' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(
      screen.getByText(/✓.*round 2.*pse\.research/i),
    ).toBeInTheDocument();
  });

  it('matches case-insensitively', () => {
    render(<PasteAttestation status={status} />);
    fireEvent.change(screen.getByPlaceholderText(/paste attestation/i), {
      target: { value: '0xAAA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.getByText(/✓.*alik\.eth/)).toBeInTheDocument();
  });

  it('shows ✗ result when attestation is unknown', () => {
    render(<PasteAttestation status={status} />);
    fireEvent.change(screen.getByPlaceholderText(/paste attestation/i), {
      target: { value: '0xunknown' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(
      screen.getByText(/✗.*not part of this ceremony/i),
    ).toBeInTheDocument();
  });

  it('shows ✗ empty input when nothing pasted', () => {
    render(<PasteAttestation status={status} />);
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.getByText(/✗.*empty input/i)).toBeInTheDocument();
  });
});
