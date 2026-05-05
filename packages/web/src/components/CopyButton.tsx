// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// sovereign tokens retired in favor of --ct-* + .ct-link grammar
// (task #84). The copy button visually behaves as an underlined
// link rather than a Curve-style .ct-btn — it's an inline action
// embedded in code blocks, not a primary surface CTA.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface CopyButtonProps {
  /** The text to copy. Multi-line code blocks are fine. */
  readonly text: string;
  /** Optional aria-label override; defaults to a translated "Copy command". */
  readonly ariaLabel?: string;
  readonly testId?: string;
}

export function CopyButton({ text, ariaLabel, testId }: CopyButtonProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const onClick = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 1600);
    } catch {
      setState('failed');
      setTimeout(() => setState('idle'), 1600);
    }
  };

  const label =
    state === 'copied'
      ? t('ceremony.copy.copied', 'Copied')
      : state === 'failed'
        ? t('ceremony.copy.failed', 'Copy failed')
        : t('ceremony.copy.idle', 'Copy');

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-label={ariaLabel ?? t('ceremony.copy.aria', 'Copy command')}
      {...(testId ? { 'data-testid': testId } : {})}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: '12px',
        padding: '4px 12px',
        color: 'var(--ua-blue)',
        textDecoration: 'underline',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
