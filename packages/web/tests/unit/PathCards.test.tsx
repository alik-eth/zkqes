// PathCards — /ceremony left-column path cards + COORD attribution.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 4.
// Frozen marketer-locked copy from plan §0.1.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PathCards } from '../../src/components/ceremony/PathCards';

describe('PathCards', () => {
  it('renders three stacked path cards (LOCAL, CLOUD, HETZNER) with frozen specs', () => {
    render(<PathCards />);
    expect(screen.getByText(/LOCAL/)).toBeInTheDocument();
    expect(screen.getByText(/CLOUD/)).toBeInTheDocument();
    expect(screen.getByText(/HETZNER/)).toBeInTheDocument();
    expect(screen.getByText(/≥32 GB RAM · ~20 min · \$0/)).toBeInTheDocument();
    expect(screen.getByText(/Fly\.io · ~20 min · ~\$0\.30/)).toBeInTheDocument();
    expect(
      screen.getByText(/CCX33 · self-driven · see README/),
    ).toBeInTheDocument();
  });

  it('renders the frozen COORD attribution', () => {
    render(<PathCards />);
    expect(
      screen.getByText(/COORD: alik\.eth · DM for round assignment/),
    ).toBeInTheDocument();
  });

  it('collapses to COORD-only when collapseToCoord=true (status-feed-down fallback)', () => {
    render(<PathCards collapseToCoord />);
    expect(screen.queryByText(/LOCAL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CLOUD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HETZNER/)).not.toBeInTheDocument();
    expect(screen.getByText(/COORD: alik\.eth/)).toBeInTheDocument();
  });
});
