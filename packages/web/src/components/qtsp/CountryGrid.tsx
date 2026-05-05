// CountryGrid — Landing's country/QTSP tile grid. Renders all entries
// from `QTSP_INDEX` (T5-emitted), grouped by region, with a state
// filter chip row above.
//
// Click semantics differ by tile state per spec §4.2:
//   - non-live (bronze/silver/gold) on the grid → opens drawer in-place
//     so users can see status + leave a "notify me" or contribute via
//     the help-verify CTA without leaving Landing.
//   - But silver/gold also have dedicated `/qtsp/<cc>/<slug>` pages
//     for inbound deep-links (T10). Per lead's T9 dispatch the GRID
//     navigates silver+ to the dedicated page; the drawer stays as
//     the bronze-only fast path.
// So the rule is: bronze → drawer; silver/gold/live → navigate.
//
// Index injection: prop-driven, defaults to `QTSP_INDEX`. Lets tests
// pass synthetic fixtures without module-level `vi.mock`, and opens
// future composition (URL-param-filtered grids, region-specific
// embeds, etc.).

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import type { QtspMeta, QtspState } from '@zkqes/sdk';
import { QTSP_INDEX } from '../../generated/qtsp-index';
import {
  REGION_ORDER,
  filterByState,
  groupByRegion,
} from '../../lib/qtspIndex';
import { QtspTile } from './QtspTile';
import { QtspDrawer } from './QtspDrawer';

type FilterValue = 'all' | QtspState;
const FILTER_VALUES: readonly FilterValue[] = [
  'all',
  'bronze',
  'silver',
  'gold',
  'live',
];

export interface CountryGridProps {
  /**
   * Source list of QTSP entries. Defaults to the build-time
   * generated `QTSP_INDEX`. Tests + future composition (URL-param
   * filtered grids, region-scoped embeds) override this directly.
   */
  index?: readonly QtspMeta[];
}

export function CountryGrid({
  index = QTSP_INDEX,
}: CountryGridProps): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [drawerMeta, setDrawerMeta] = useState<QtspMeta | null>(null);

  // Filter then group. State filter is the only filter today; future
  // region/country filters slot in here.
  const visible = useMemo(
    () => (filter === 'all' ? index.slice() : filterByState(index, filter)),
    [index, filter],
  );
  const grouped = useMemo(() => groupByRegion(visible), [visible]);

  const handleTileClick = (meta: QtspMeta) => {
    // Focus restoration on drawer close is handled inside QtspDrawer
    // via its `document.activeElement` capture (the tile button is
    // the active element at the moment of click). No explicit
    // `previouslyFocusedRef` plumbing needed from the grid.
    if (meta.state === 'live' || meta.state === 'silver' || meta.state === 'gold') {
      navigate({ to: `/qtsp/${meta.country}/${meta.qtspSlug}` });
      return;
    }
    setDrawerMeta(meta);
  };

  return (
    <div className="ct" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Filter chip row — `all` + per-state. */}
      <div
        role="toolbar"
        aria-label="qtsp-filter"
        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
      >
        {FILTER_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`qtsp-filter-${v}`}
            onClick={() => setFilter(v)}
            className={filter === v ? 'ct-tab' : 'ct-tab ct-tab--off'}
            aria-pressed={filter === v}
          >
            {v === 'all' ? t('qtsp.filter.all') : t(`qtsp.state.${v}`)}
          </button>
        ))}
      </div>

      {/* Empty state. Surfaces `qtsp.grid.empty` so a fresh-clone or
          aggressive-filter scenario reads as deliberate, not broken. */}
      {visible.length === 0 && (
        <p style={{ color: 'var(--ct-mute)' }}>{t('qtsp.grid.empty')}</p>
      )}

      {/* Region sections in canonical order. Empty regions are
          skipped — `groupByRegion` only emits populated buckets. */}
      {REGION_ORDER.filter((r) => grouped[r] !== undefined).map((region) => (
        <section
          key={region}
          data-region={region}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <h3
            className="ct-kicker"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {t(`qtsp.region.${region}`)}
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 'var(--ct-gap)',
            }}
          >
            {grouped[region]!.map((meta) => (
              <QtspTile
                key={`${meta.country}/${meta.qtspSlug}`}
                meta={meta}
                onClick={handleTileClick}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Drawer — bronze tile fast path. Drawer's own
          `document.activeElement` capture handles focus restoration
          back to the originating tile. */}
      <QtspDrawer
        meta={drawerMeta ?? ({} as QtspMeta)}
        open={drawerMeta !== null}
        onClose={() => setDrawerMeta(null)}
      />
    </div>
  );
}
