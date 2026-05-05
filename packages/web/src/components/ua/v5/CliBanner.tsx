// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// sovereign + --rule tokens retired here per founder direction
// 2026-05-05 (task #84). Banner is now a `.ct-field` (civic-terminal
// dashed-border framed block) — matches the same outline grammar
// used elsewhere on the surface; info-level rather than --err framing.
//
// Plan ref: docs/superpowers/plans/2026-05-03-qkb-cli-server-web-eng.md T3.
//
// Dismiss persistence: localStorage. SessionStorage would re-show on
// every tab open, which feels pushy for an OPTIONAL upgrade. The CLI
// is genuinely optional — browser prove must remain a working path
// (CLAUDE.md V5.16).
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useCliPresence } from '../../../hooks/useCliPresence';

/** localStorage key for the dismiss flag. Namespaced so future banner
 *  additions can re-use the same prefix. */
export const CLI_BANNER_DISMISSED_KEY = 'zkqes.cliBanner.dismissed';

function readDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLI_BANNER_DISMISSED_KEY) === '1';
  } catch {
    // SSR path or sandboxed iframe — treat as not-dismissed.
    return false;
  }
}

function writeDismissed(): void {
  try {
    globalThis.localStorage?.setItem(CLI_BANNER_DISMISSED_KEY, '1');
  } catch {
    // No-op — the banner just won't persist its dismissal across reloads,
    // which is the lesser evil vs throwing.
  }
}

export function CliBanner() {
  const { t } = useTranslation();
  const { status } = useCliPresence();
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  // Don't render during 'detecting' (avoid a flash of the banner before
  // the CLI is detected) or 'present' (CLI is running — banner serves
  // no purpose) or after dismissal.
  if (status !== 'absent' || dismissed) return null;

  const onDismiss = (): void => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <aside
      className="ct-field"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        color: 'var(--ct-ink)',
      }}
      data-testid="cli-banner"
      role="complementary"
      aria-label={t('cliBanner.title')}
    >
      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '13px',
          fontWeight: 600,
          margin: 0,
        }}
      >
        {t('cliBanner.title')}
      </p>
      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '13px',
          margin: 0,
          color: 'var(--ct-ink-2)',
        }}
      >
        {t('cliBanner.body')}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontFamily: 'var(--mono)',
          fontSize: '13px',
        }}
      >
        <Link
          to="/ua/cli"
          className="ct-link"
          data-testid="cli-banner-cta"
        >
          {t('cliBanner.cta')}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            color: 'var(--ct-mute)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          data-testid="cli-banner-dismiss"
        >
          {t('cliBanner.dismiss')}
        </button>
      </div>
    </aside>
  );
}
