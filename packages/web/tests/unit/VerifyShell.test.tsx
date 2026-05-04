// VerifyShell — /verify 3-col civic-terminal inspector tests.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 11.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';

// Mock useCeremonyPhase so the shell renders deterministically without
// fetching status.json or running the polling interval.
vi.mock('../../src/hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: vi.fn(),
}));

import { VerifyShell } from '../../src/components/ceremony/VerifyShell';
import { useCeremonyPhase } from '../../src/hooks/useCeremonyPhase';

const ceremonyLiveStatus = {
  round: 3,
  totalRounds: 10,
  contributors: [
    {
      name: 'alik.eth',
      round: 1,
      completedAt: '2026-05-10T10:00:00Z',
      attestation: '0xaaa1111111111111111111111111111111111111111111111111111111111111',
    },
    {
      name: 'pse.research',
      round: 2,
      completedAt: '2026-05-11T10:00:00Z',
      attestation: '0xbbb2222222222222222222222222222222222222222222222222222222222222',
    },
  ],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'ceremony-live' as const,
};

const liveStatus = {
  ...ceremonyLiveStatus,
  round: 10,
  finalZkeySha256:
    '0xfff3333333333333333333333333333333333333333333333333333333333333',
  phase: 'live' as const,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // pushRecent writes to localStorage even when skipLocalStorage skips
  // the *read* on mount. Without clearing here, recent-log entries from
  // prior tests accumulate and assertions like getByText(/attestation/)
  // hit multiple matches in the RECENT panel.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('VerifyShell', () => {
  it('renders Marquee + tab pair + explainer + RECENT panel', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'ceremony-live',
      status: ceremonyLiveStatus,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    expect(screen.getByLabelText('phase: ceremony-live')).toBeInTheDocument();
    expect(screen.getByTestId('verify-tab-attestation')).toBeInTheDocument();
    expect(screen.getByTestId('verify-tab-wallet')).toBeInTheDocument();
    expect(screen.getByText(/WHAT THIS VERIFIES/)).toBeInTheDocument();
    expect(screen.getByText(/RECENT/)).toBeInTheDocument();
  });

  it('attestation tab matches a contributor and renders round + name', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'ceremony-live',
      status: ceremonyLiveStatus,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    fireEvent.change(screen.getByTestId('verify-input-attestation'), {
      target: {
        value: '0xbbb2222222222222222222222222222222222222222222222222222222222222',
      },
    });
    fireEvent.click(screen.getByTestId('verify-submit-attestation'));
    const result = screen.getByTestId('verify-result-attestation');
    expect(within(result).getByText(/pse\.research/)).toBeInTheDocument();
    expect(within(result).getByText(/^2$/)).toBeInTheDocument();
  });

  it('attestation tab matches the published final zkey hash', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'live',
      status: liveStatus,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    fireEvent.change(screen.getByTestId('verify-input-attestation'), {
      target: {
        value: '0xfff3333333333333333333333333333333333333333333333333333333333333',
      },
    });
    fireEvent.click(screen.getByTestId('verify-submit-attestation'));
    expect(
      screen.getByText(/✓ matches published final zkey/),
    ).toBeInTheDocument();
  });

  it('attestation tab reports unknown for an unmatched hash', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'ceremony-live',
      status: ceremonyLiveStatus,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    fireEvent.change(screen.getByTestId('verify-input-attestation'), {
      target: { value: '0x' + '9'.repeat(64) },
    });
    fireEvent.click(screen.getByTestId('verify-submit-attestation'));
    expect(screen.getByText(/✗ not part of this ceremony/)).toBeInTheDocument();
  });

  it('attestation tab surfaces feed-down verdict when status is null', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: null,
      status: null,
      error: 'network',
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    fireEvent.change(screen.getByTestId('verify-input-attestation'), {
      target: { value: '0x' + 'a'.repeat(64) },
    });
    fireEvent.click(screen.getByTestId('verify-submit-attestation'));
    expect(
      screen.getByText(/status feed unreachable; cannot determine/),
    ).toBeInTheDocument();
  });

  it('wallet tab shows pre-launch verdict for valid 0x address (no on-chain read)', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'recruiting',
      status: null,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    fireEvent.click(screen.getByTestId('verify-tab-wallet'));
    fireEvent.change(screen.getByTestId('verify-input-wallet'), {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.click(screen.getByTestId('verify-submit-wallet'));
    expect(
      screen.getByText(
        /◐ available after trusted setup ceremony \+ Base Sepolia testnet deploy/,
      ),
    ).toBeInTheDocument();
  });

  it('wallet tab rejects an invalid address', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'recruiting',
      status: null,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    fireEvent.click(screen.getByTestId('verify-tab-wallet'));
    fireEvent.change(screen.getByTestId('verify-input-wallet'), {
      target: { value: 'not-an-address' },
    });
    fireEvent.click(screen.getByTestId('verify-submit-wallet'));
    expect(
      screen.getByText(/✗ not a valid 0x-prefixed wallet address/),
    ).toBeInTheDocument();
  });

  it('persists the lookup verdict to the RECENT log', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'ceremony-live',
      status: ceremonyLiveStatus,
      error: null,
      isLoading: false,
    });
    render(<VerifyShell skipLocalStorage />);
    // Empty initial state.
    expect(screen.getByText(/no lookups yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('verify-input-attestation'), {
      target: {
        value: '0xaaa1111111111111111111111111111111111111111111111111111111111111',
      },
    });
    fireEvent.click(screen.getByTestId('verify-submit-attestation'));
    const recentList = screen.getByTestId('verify-recent-list');
    expect(within(recentList).getByText(/attestation/)).toBeInTheDocument();
    expect(within(recentList).getByText(/round 1 · alik\.eth/)).toBeInTheDocument();
  });
});
