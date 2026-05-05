// QtspDrawer — right-edge slide-in panel surfaced from a non-live
// QtspTile click. Renders QTSP context + two CTAs:
//
//   - "Help us verify" — opens a pre-filled GitHub issue against the
//     `help-add-qtsp.md` template (the template lands in T16; until
//     then GitHub renders a generic blank-issue page with the URL
//     fragments still preserved).
//   - "Notify me" — captures the user's email under
//     `localStorage[zkqes.qtsp.notify.<cc>/<slug>]` so they can be
//     reached when the QTSP graduates to `live`.
//
// A11y posture:
//   - role="dialog" + aria-modal="true" + aria-labelledby on the heading.
//   - Esc + overlay click invoke onClose.
//   - When the drawer unmounts (or `open` flips to false), focus
//     returns to whatever element was active when it opened. The
//     caller threads this via `previouslyFocusedRef` (typically a
//     ref on the QtspTile button); the drawer auto-captures
//     `document.activeElement` on mount as a fallback for callers
//     that haven't wired the ref.
//
// Civic-terminal styling — reuses the existing `.ct-*` primitives from
// `civic-terminal.css` (no new primitives, no BRAND.md amendment).

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { QtspMeta } from '@zkqes/sdk';

/** Frozen prefix for "notify me when QTSP X is live" entries. Drift
 *  here would split notify-list reads between the drawer and any
 *  downstream tooling, so it's exported + asserted by the unit suite.
 *  Shape: `zkqes.<feature>.<id>` per the existing namespace
 *  (`zkqes.cliBanner.dismissed`, `zkqes.qtsp.demo.*`). */
export const NOTIFY_STORAGE_PREFIX = 'zkqes.qtsp.notify.';

/** GitHub repo + path for the "help us verify" issue template. The
 *  template file itself lands in T16. The URL pattern follows GitHub's
 *  documented `?template=NAME&<field>=<value>` form. */
const ISSUE_TEMPLATE_URL =
  'https://github.com/alik-eth/zkqes/issues/new';
const ISSUE_TEMPLATE_NAME = 'help-add-qtsp.md';

const REGION_DISPLAY: { of: (cc: string) => string | undefined } | undefined =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : undefined;
function countryName(cc: string): string {
  return REGION_DISPLAY?.of(cc) ?? cc;
}

function flagEmoji(cc: string): string {
  return [...cc]
    .map((c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)))
    .join('');
}

export interface QtspDrawerProps {
  meta: QtspMeta;
  open: boolean;
  onClose: () => void;
  /** Optional — element to restore focus to when the drawer closes.
   *  Typical caller: a ref on the QtspTile <button> that opened the
   *  drawer. If omitted, the drawer captures `document.activeElement`
   *  on mount as a fallback. */
  previouslyFocusedRef?: RefObject<HTMLElement | null>;
}

export function QtspDrawer({
  meta,
  open,
  onClose,
  previouslyFocusedRef,
}: QtspDrawerProps): JSX.Element | null {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);
  // Captured fallback for callers that don't pass `previouslyFocusedRef`.
  const fallbackRef = useRef<HTMLElement | null>(null);

  // Capture the active element on open + return focus on close.
  useEffect(() => {
    if (!open) return;
    const active = (document.activeElement as HTMLElement | null) ?? null;
    fallbackRef.current = active;
    // Move focus into the drawer for screen-reader continuity. The
    // drawer container is `tabindex={-1}` so it can receive
    // programmatic focus without being in the tab order.
    drawerRef.current?.focus();

    return () => {
      const target = previouslyFocusedRef?.current ?? fallbackRef.current;
      target?.focus();
    };
  }, [open, previouslyFocusedRef]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleHelpVerify = useCallback(() => {
    const qtspParam = `${meta.country}/${meta.qtspSlug}`.toLowerCase();
    const url =
      `${ISSUE_TEMPLATE_URL}?template=${ISSUE_TEMPLATE_NAME}` +
      `&qtsp=${encodeURIComponent(qtspParam)}`;
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }, [meta.country, meta.qtspSlug]);

  const handleNotifySubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const email = (
        form.elements.namedItem('email') as HTMLInputElement | null
      )?.value;
      if (!email) return;
      const key = `${NOTIFY_STORAGE_PREFIX}${meta.country}/${meta.qtspSlug}`;
      try {
        globalThis.localStorage?.setItem(
          key,
          JSON.stringify({
            email,
            requestedAt: new Date().toISOString(),
          }),
        );
      } catch {
        // localStorage may be blocked (Safari private mode, file://) —
        // surface as a no-op rather than crashing the drawer; the
        // caller can listen for storage events to confirm if needed.
      }
      onClose();
    },
    [meta.country, meta.qtspSlug, onClose],
  );

  if (!open) return null;

  return (
    <div
      data-testid="qtsp-drawer-overlay"
      onClick={(e) => {
        // Only fire onClose for clicks on the overlay itself, not its
        // bubbled-up children — otherwise any click inside the drawer
        // closes it.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(20, 19, 14, 0.55)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qtsp-drawer-title"
        className="ct-panel"
        style={{
          background: 'var(--ct-paper)',
          color: 'var(--ct-ink)',
          width: 'min(420px, 100%)',
          height: '100%',
          padding: 'var(--ct-pad)',
          overflowY: 'auto',
          fontFamily: 'var(--mono)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header strip — flag + displayName + state badge. */}
        <header style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span aria-label={countryName(meta.country)} role="img">
            {flagEmoji(meta.country)}
          </span>
          <h2
            id="qtsp-drawer-title"
            style={{
              fontFamily: 'var(--display)',
              fontSize: '24px',
              lineHeight: 1,
              margin: 0,
              flex: 1,
            }}
          >
            {meta.displayName}
          </h2>
          <span
            className={
              meta.state === 'live' ? 'ct-tag ct-tag--ok' : 'ct-tag'
            }
          >
            {t(`qtsp.state.${meta.state}`)}
          </span>
        </header>

        {/* About — meta.notes verbatim. */}
        <section>
          <h3 className="ct-kicker">{t('qtsp.page.about')}</h3>
          <p style={{ marginTop: '4px' }}>{meta.notes}</p>
        </section>

        {/* CTAs — help-verify + notify-me. */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            type="button"
            className="ct-btn"
            onClick={handleHelpVerify}
          >
            {t('qtsp.drawer.helpVerify')}
          </button>

          <form
            onSubmit={handleNotifySubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <label htmlFor="qtsp-notify-email" className="ct-kicker">
              email
            </label>
            <input
              id="qtsp-notify-email"
              name="email"
              type="email"
              required
              className="ct-input ct-input--paper"
              autoComplete="email"
            />
            <button type="submit" className="ct-btn ct-btn--primary">
              {t('qtsp.drawer.notifyMe')}
            </button>
          </form>
        </section>

        {/* Close — also Esc + overlay click via the wiring above. */}
        <button
          type="button"
          className="ct-btn ct-btn--ghost"
          onClick={onClose}
          aria-label="close"
          style={{ alignSelf: 'flex-end' }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
