// qtspIndex helpers — shape `QTSP_INDEX` (T5-emitted) for the
// CountryGrid view + the per-QTSP route's slug-driven lookup.
//
// Keeping pure functions (no React, no DOM) so the same helpers can be
// reused from build-time tooling (e.g. a CLI that lists pending
// notifies, or a docs.zkqes.org auto-page generator).
//
// Region grouping is the canonical EU/EEA bucket layout per lead's T9
// dispatch. UA lives in EASTERN_EU (eIDAS recognition flows through
// the association agreement); a separate "Other" bucket would
// visually orphan the only live country today.
//
// Spec: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md
// Plan: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md §T9

import type { QtspMeta, QtspState } from '@zkqes/sdk';

export type QtspRegion =
  | 'EASTERN_EU'
  | 'NORDICS'
  | 'SOUTHERN_EU'
  | 'CENTRAL_EU'
  | 'WESTERN_EU'
  | 'OTHER';

/**
 * Canonical render order for the country grid. Eastern first because
 * UA (the only live QTSP today) lives there — places the "you can
 * register today" tile above the fold without needing a featured-tile
 * mechanism.
 */
export const REGION_ORDER: readonly QtspRegion[] = [
  'EASTERN_EU',
  'NORDICS',
  'SOUTHERN_EU',
  'CENTRAL_EU',
  'WESTERN_EU',
  'OTHER',
];

const REGION_MEMBERSHIP: Readonly<Record<QtspRegion, readonly string[]>> = {
  // EU + EEA + association-agreement (UA). Codes are ISO 3166-1 alpha-2,
  // uppercase. Membership is mutually exclusive — every supported
  // country lives in exactly one bucket.
  NORDICS: ['NO', 'SE', 'DK', 'FI', 'IS'],
  CENTRAL_EU: ['AT', 'DE', 'CH', 'PL', 'CZ', 'SK'],
  SOUTHERN_EU: ['ES', 'IT', 'PT', 'GR', 'MT', 'CY'],
  EASTERN_EU: ['BG', 'RO', 'HU', 'UA', 'EE', 'LV', 'LT', 'SI', 'HR'],
  WESTERN_EU: ['FR', 'BE', 'NL', 'LU', 'IE'],
  OTHER: [],
};

/**
 * Map an ISO 3166-1 alpha-2 country code to its grid region. Codes
 * outside the EU/EEA grid bucket into `OTHER` rather than being
 * silently dropped — a US/GB QTSP entering the index gets a visible
 * surface even before the regional layout is extended.
 */
export function regionForCountry(cc: string): QtspRegion {
  const u = cc.toUpperCase();
  for (const [region, members] of Object.entries(REGION_MEMBERSHIP) as [
    QtspRegion,
    readonly string[],
  ][]) {
    if (members.includes(u)) return region;
  }
  return 'OTHER';
}

/**
 * Group QTSP entries by region. Returns a partial record — only
 * regions with at least one entry appear as keys, so the consumer
 * can iterate without rendering empty headers. The render-order
 * decision lives in `REGION_ORDER`, not here.
 */
export function groupByRegion(
  metas: readonly QtspMeta[],
): Partial<Record<QtspRegion, QtspMeta[]>> {
  const out: Partial<Record<QtspRegion, QtspMeta[]>> = {};
  for (const m of metas) {
    const r = regionForCountry(m.country);
    (out[r] ??= []).push(m);
  }
  return out;
}

/** Filter QTSP entries by lifecycle state. Pure passthrough wrapper —
 *  exists so callers (filter chips, CLI tooling) don't reach into
 *  `metas.filter(m => m.state === ...)` and risk a future schema
 *  change. */
export function filterByState(
  metas: readonly QtspMeta[],
  state: QtspState,
): QtspMeta[] {
  return metas.filter((m) => m.state === state);
}

/**
 * Look up a QTSP by `<cc>/<slug>` path. Both segments compared
 * case-insensitively so URL paths like `/qtsp/it/aruba-pec` and
 * `/qtsp/IT/aruba-pec` resolve identically. Returns `undefined` for
 * missing segments or unknown entries — the route layer maps that
 * to a 404.
 */
export function getQtspByPath(
  metas: readonly QtspMeta[],
  path: string,
): QtspMeta | undefined {
  const slash = path.indexOf('/');
  if (slash <= 0 || slash === path.length - 1) return undefined;
  const cc = path.slice(0, slash).toUpperCase();
  const slug = path.slice(slash + 1).toLowerCase();
  return metas.find((m) => m.country === cc && m.qtspSlug === slug);
}
