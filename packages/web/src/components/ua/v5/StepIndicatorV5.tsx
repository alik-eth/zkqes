// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// sovereign-indigo dot retired in favor of --ct-ink + civic-terminal
// kicker rhythm. Behaviour byte-identical: 1..4 indexed steps, current
// receives aria-current="step", done/active receive a filled marker.
//
// V5 register flow has 4 stages, distinct from V4's StepIndicator
// (Install / Submit / Mint). Kept as a sibling rather than extended on
// top of StepIndicator so V4 ergonomics are unaffected during migration.
import { useTranslation } from 'react-i18next';

export interface StepIndicatorV5Props {
  current: 1 | 2 | 3 | 4;
}

// EN keys live in i18n/en.json under registerV5.indicator.{connect,
// generate, sign, prove}; UK has its own translation. The fallback
// strings below match what the page rendered before the indicator was
// localised, so any locale missing the bundle still reads correctly.
const STEP_KEYS = [
  ['registerV5.indicator.connect', 'Connect'],
  ['registerV5.indicator.generate', 'Generate'],
  ['registerV5.indicator.sign', 'Sign'],
  ['registerV5.indicator.prove', 'Prove + register'],
] as const;

export function StepIndicatorV5({ current }: StepIndicatorV5Props) {
  const { t } = useTranslation();
  return (
    <ol
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        fontFamily: 'var(--mono)',
        fontSize: '13px',
        color: 'var(--ct-ink)',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      }}
      aria-label={t('registerV5.indicator.aria', 'Progress')}
    >
      {STEP_KEYS.map(([key, fallback], i) => {
        const idx = i + 1;
        const active = idx === current;
        const done = idx < current;
        const label = t(key, fallback);
        return (
          <li
            key={key}
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
