// TrustBudget — /ceremony right-column trust-budget summary.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 6.
// "1 of N honest = sound" is the Groth16 trusted-setup soundness invariant:
// as long as one contributor honestly destroys their entropy, the resulting
// proving key is sound.

import type { CeremonyContributor } from '../../lib/ceremonyStatus';

interface TrustBudgetProps {
  readonly contributors: readonly CeremonyContributor[];
}

export function TrustBudget({ contributors }: TrustBudgetProps) {
  if (contributors.length === 0) {
    return (
      <p
        className="ct-panel"
        style={{
          padding: 'var(--ct-pad)',
          fontFamily: 'var(--mono)',
          fontSize: '12px',
        }}
      >
        trust budget: awaiting first contributor
      </p>
    );
  }
  const names = contributors.map((c) => c.name).join(', ');
  return (
    <p
      className="ct-panel"
      style={{
        padding: 'var(--ct-pad)',
        fontFamily: 'var(--mono)',
        fontSize: '12px',
      }}
    >
      <strong>1 of {contributors.length} honest = sound</strong> · completed
      contributors: {names}
    </p>
  );
}
