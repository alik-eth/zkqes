// QtspTile — country-grid cell on the multi-QTSP Landing layout.
//
// One tile per QTSP from `QTSP_INDEX` (T5-emitted). The tile is a
// keyboard-accessible <button>; the parent component decides what to
// route to based on `meta.state` (drawer for non-live, register flow
// for live).
//
// Visual grammar — civic-terminal v2 (BRAND.md):
//   - Display name in VT323 (`var(--display)`).
//   - State label in IBM Plex Mono uppercase (`var(--mono)`).
//   - `data-state` attribute on the root <button> so sibling CSS can
//     theme the chrome — bronze=dotted, silver=dashed, gold=solid,
//     live=solid+filled badge. We use inline `borderStyle` rather
//     than minting a new `.ct-qtsp-tile` primitive to keep the
//     BRAND.md surface grammar untouched (a new primitive would
//     require a BRAND.md amendment per the rebrand-spec rule).
//
// Country flag — native emoji per lead's T7 pick:
//   - Zero deps, zero bundle cost, no Twemoji asset bundle.
//   - System glyph variance reads as authentic to the civic-document /
//     paper-grain aesthetic.
//   - aria-label is hard-pinned to English ('Italy', not user-locale)
//     so screen-reader output stays stable across language toggles.

import type { QtspMeta } from '@zkqes/sdk';
import { useTranslation } from 'react-i18next';

/**
 * Convert ISO 3166-1 alpha-2 to the matching pair of regional
 * indicator code points. e.g. 'IT' → '🇮🇹'. Caller must supply an
 * uppercase 2-char string (the schema in T2 already enforces this
 * shape, so we don't re-validate here).
 */
function flagEmoji(cc: string): string {
  const REGIONAL_INDICATOR_OFFSET = 0x1f1a5; // U+1F1E6 - 'A' (0x41)
  return [...cc]
    .map((c) => String.fromCodePoint(REGIONAL_INDICATOR_OFFSET + c.charCodeAt(0)))
    .join('');
}

/**
 * English country name from ISO 3166-1 alpha-2. `Intl.DisplayNames`
 * is available in Node 18+ and every browser engine zkqes targets;
 * the `?? cc` fallback covers any code rejected by the runtime.
 */
const REGION_DISPLAY: { of: (cc: string) => string | undefined } | undefined =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : undefined;
function countryName(cc: string): string {
  return REGION_DISPLAY?.of(cc) ?? cc;
}

/** Per-state border style on the outer <button>. */
const BORDER_STYLE: Record<QtspMeta['state'], string> = {
  bronze: 'dotted',
  silver: 'dashed',
  gold: 'solid',
  live: 'solid',
};

export interface QtspTileProps {
  meta: QtspMeta;
  onClick: (meta: QtspMeta) => void;
}

export function QtspTile({ meta, onClick }: QtspTileProps): JSX.Element {
  const { t } = useTranslation();
  const isLive = meta.state === 'live';

  return (
    <button
      type="button"
      data-state={meta.state}
      data-country={meta.country}
      data-qtsp-slug={meta.qtspSlug}
      onClick={() => onClick(meta)}
      style={{
        // Inline border so we can vary `borderStyle` per state without
        // minting a new civic-terminal primitive. Other visual tokens
        // (paper bg, ink fg) stay sourced from the CSS custom-prop
        // layer so a global theme tweak still propagates.
        borderWidth: '1.5px',
        borderColor: 'var(--ct-ink)',
        borderStyle: BORDER_STYLE[meta.state],
        background: 'var(--ct-paper)',
        color: 'var(--ct-ink)',
        padding: 'var(--ct-pad)',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span aria-label={countryName(meta.country)} role="img">
          {flagEmoji(meta.country)}
        </span>
        <span
          style={{
            fontFamily: 'var(--display)',
            fontSize: '24px',
            lineHeight: 1,
          }}
        >
          {meta.displayName}
        </span>
      </div>
      <span
        className={isLive ? 'ct-tag ct-tag--ok' : 'ct-tag'}
        // The state badge uses the existing `.ct-tag--ok` filled
        // primitive only for `live`; non-live states get the default
        // outline-only tag so the visual progression bronze→silver→
        // gold→live reads as "increasingly committed."
      >
        {t(`qtsp.state.${meta.state}`)}
      </span>
    </button>
  );
}
