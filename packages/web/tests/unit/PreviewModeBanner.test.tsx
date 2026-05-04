// PreviewModeBanner — app-route banner for non-live phases.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 7.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §5.4.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../../src/hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: vi.fn(),
}));

import { PreviewModeBanner } from '../../src/components/app/PreviewModeBanner';
import { useCeremonyPhase } from '../../src/hooks/useCeremonyPhase';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PreviewModeBanner', () => {
  it('renders banner when phase=recruiting', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'recruiting',
      status: null,
      error: null,
      isLoading: false,
    });
    render(<PreviewModeBanner />);
    expect(screen.getByText(/PREVIEW MODE/)).toBeInTheDocument();
    expect(screen.getByText(/stub verifier/)).toBeInTheDocument();
  });

  it('renders banner when phase=ceremony-live', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'ceremony-live',
      status: null,
      error: null,
      isLoading: false,
    });
    render(<PreviewModeBanner />);
    expect(screen.getByText(/PREVIEW MODE/)).toBeInTheDocument();
  });

  it('renders nothing when phase=live', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: 'live',
      status: null,
      error: null,
      isLoading: false,
    });
    const { container } = render(<PreviewModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when phase is null (network failure — conservative)', () => {
    vi.mocked(useCeremonyPhase).mockReturnValue({
      phase: null,
      status: null,
      error: 'network',
      isLoading: false,
    });
    render(<PreviewModeBanner />);
    expect(screen.getByText(/PREVIEW MODE/)).toBeInTheDocument();
  });
});
