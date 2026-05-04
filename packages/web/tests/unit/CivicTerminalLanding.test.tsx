// Phase-driven Landing tests.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 3.
//
// CivicTerminalLanding consumes `useCeremonyPhase`; we mock it to drive each
// phase branch. TanStack Router's `<Link>` is also stubbed because the
// component renders without a wrapping `RouterProvider` in unit tests.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../../src/hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) =>
    // Render an anchor; href reflects the path so any router-aware test can
    // still inspect navigation intent without a full RouterProvider.
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>,
}));

import { CivicTerminalLanding } from '../../src/components/CivicTerminalLanding';
import { useCeremonyPhase } from '../../src/hooks/useCeremonyPhase';

const recruitingStatus = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting' as const,
};

const ceremonyLiveStatus = {
  ...recruitingStatus,
  round: 4,
  phase: 'ceremony-live' as const,
};

const liveStatus = {
  ...recruitingStatus,
  round: 10,
  finalZkeySha256: '0xabc',
  phase: 'live' as const,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CivicTerminalLanding (phase-driven)', () => {
  it('renders recruiting state when phase=recruiting', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'recruiting',
      status: recruitingStatus,
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: recruiting')).toBeInTheDocument();
    expect(screen.getByText(/round 0 of 10/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/awaiting first contributor/i).length,
    ).toBeGreaterThan(0);
  });

  it('renders ceremony-live state when phase=ceremony-live', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'ceremony-live',
      status: ceremonyLiveStatus,
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: ceremony-live')).toBeInTheDocument();
    expect(screen.getByText(/round 4 of 10/i)).toBeInTheDocument();
  });

  it('renders live state with active register link when phase=live', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'live',
      status: liveStatus,
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: live')).toBeInTheDocument();
    // Live state replaces the disabled-tab tooltip with active links.
    expect(
      screen.queryByTitle(
        'Available after trusted setup ceremony + Base Sepolia testnet deploy',
      ),
    ).not.toBeInTheDocument();
  });

  it('falls back to recruiting state when status is unreachable', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: null,
      status: null,
      error: 'network',
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: recruiting')).toBeInTheDocument();
    expect(screen.getByText('round — of —')).toBeInTheDocument();
  });

  it('renders disabled-tab tooltip on Register/Rotate/Verify when phase != live', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'recruiting',
      status: recruitingStatus,
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    const registerTab = screen.getByText(/^Register$/i);
    expect(registerTab.closest('[title]')?.getAttribute('title')).toBe(
      'Available after trusted setup ceremony + Base Sepolia testnet deploy',
    );
  });

  it('renders the frozen binding-statement copy', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'recruiting',
      status: recruitingStatus,
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    // Marketer-locked binding-statement preview from plan §0.1.
    expect(
      screen.getByText(/Holders sign a binding statement that names a wallet/i),
    ).toBeInTheDocument();
  });
});
