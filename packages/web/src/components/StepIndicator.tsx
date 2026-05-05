// Civic-terminal v2 surface (BRAND.md §Surface grammar). V4 register
// flow's 3-stage indicator (Install / Submit / Mint) sibling to
// StepIndicatorV5. Pre-v2 sovereign-indigo dot retired in favor of
// --ct-ink + civic-terminal kicker rhythm (task #84).
export interface StepIndicatorProps {
  current: 1 | 2 | 3;
}

const STEPS = ['Install', 'Submit', 'Mint'];

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <ol
      style={{
        display: 'flex',
        gap: '24px',
        fontFamily: 'var(--mono)',
        fontSize: '13px',
        color: 'var(--ct-ink)',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      }}
      aria-label="Progress"
    >
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const active = idx === current;
        const done = idx < current;
        return (
          <li
            key={label}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                background: done || active ? 'var(--ct-ink)' : 'transparent',
                border: '1px solid var(--ct-ink)',
              }}
              aria-current={active ? 'step' : undefined}
            />
            <span style={{ opacity: active ? 1 : 0.6 }}>
              {idx} — {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
