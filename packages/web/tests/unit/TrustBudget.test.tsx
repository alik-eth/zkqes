// TrustBudget — /ceremony right column trust-budget summary.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 6.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustBudget } from '../../src/components/ceremony/TrustBudget';
import type { CeremonyContributor } from '../../src/lib/ceremonyStatus';

describe('TrustBudget', () => {
  it('emits "1 of N honest = sound · completed contributors: <names>"', () => {
    const contributors: CeremonyContributor[] = [
      { name: 'alik.eth', round: 1, completedAt: 'x' },
      { name: 'pse.research', round: 2, completedAt: 'y' },
    ];
    render(<TrustBudget contributors={contributors} />);
    expect(screen.getByText(/1 of 2 honest = sound/)).toBeInTheDocument();
    expect(screen.getByText(/alik\.eth/)).toBeInTheDocument();
    expect(screen.getByText(/pse\.research/)).toBeInTheDocument();
  });

  it('emits awaiting-state when contributors empty', () => {
    render(<TrustBudget contributors={[]} />);
    expect(
      screen.getByText(/trust budget: awaiting first contributor/),
    ).toBeInTheDocument();
  });
});
