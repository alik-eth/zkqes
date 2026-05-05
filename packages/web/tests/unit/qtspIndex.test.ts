// Unit tests for `qtspIndex` helpers — `groupByRegion`, `filterByState`,
// `getQtspByPath`. The helpers shape `QTSP_INDEX` for the
// `CountryGrid` consumer + the per-QTSP route's slug-driven lookup.
//
// Per lead's T9 dispatch: regional buckets are the canonical EU/EEA
// grouping (Nordics, Central, Southern, Eastern, Western); UA lives in
// Eastern despite not being EU, because eIDAS recognition flows
// through the association agreement and a separate "Other" bucket
// would visually orphan the only live country today.

import { describe, it, expect } from 'vitest';
import type { QtspMeta } from '@zkqes/sdk';
import {
  filterByState,
  getQtspByPath,
  groupByRegion,
  REGION_ORDER,
  regionForCountry,
} from '../../src/lib/qtspIndex';

function meta(country: string, slug: string, state: QtspMeta['state']): QtspMeta {
  return {
    country,
    qtspSlug: slug,
    displayName: `${country}/${slug}`,
    qtspUrl: 'https://example.invalid/',
    tslEntry: null,
    signingTool: { name: 'tool', url: 'https://example.invalid/', minVersion: null },
    state,
    addedAt: '2026-05-05',
    promotedAt: null,
    lastVerified: '2026-05-05',
    notes: '',
    // V5.4 — required QtspMeta fields. Cross-field invariant requires
    // a non-null OID when dobEncoding !== 'none'.
    dobEncoding: 'diia-ua' as const,
    dobAttributeOid: '1.2.804.2.1.1.1.11.1.4.11.1',
  };
}

const fixtures: QtspMeta[] = [
  meta('UA', 'diia', 'live'),
  meta('IT', 'aruba-pec', 'bronze'),
  meta('DE', 'd-trust', 'silver'),
  meta('FI', 'digi-fi', 'gold'),
  meta('FR', 'certinomis', 'bronze'),
];

describe('regionForCountry', () => {
  it('classifies Nordics members', () => {
    expect(regionForCountry('FI')).toBe('NORDICS');
    expect(regionForCountry('SE')).toBe('NORDICS');
    expect(regionForCountry('NO')).toBe('NORDICS');
    expect(regionForCountry('DK')).toBe('NORDICS');
    expect(regionForCountry('IS')).toBe('NORDICS');
  });
  it('classifies Central EU members', () => {
    expect(regionForCountry('DE')).toBe('CENTRAL_EU');
    expect(regionForCountry('AT')).toBe('CENTRAL_EU');
    expect(regionForCountry('PL')).toBe('CENTRAL_EU');
  });
  it('classifies Southern EU members', () => {
    expect(regionForCountry('IT')).toBe('SOUTHERN_EU');
    expect(regionForCountry('ES')).toBe('SOUTHERN_EU');
    expect(regionForCountry('PT')).toBe('SOUTHERN_EU');
  });
  it('classifies Eastern EU members + UA (association agreement)', () => {
    expect(regionForCountry('BG')).toBe('EASTERN_EU');
    expect(regionForCountry('UA')).toBe('EASTERN_EU');
    expect(regionForCountry('EE')).toBe('EASTERN_EU');
  });
  it('classifies Western EU members', () => {
    expect(regionForCountry('FR')).toBe('WESTERN_EU');
    expect(regionForCountry('BE')).toBe('WESTERN_EU');
    expect(regionForCountry('NL')).toBe('WESTERN_EU');
  });
  it('falls through to OTHER for codes outside the EU/EEA grid', () => {
    expect(regionForCountry('US')).toBe('OTHER');
    expect(regionForCountry('GB')).toBe('OTHER');
  });
});

describe('groupByRegion', () => {
  it('groups fixtures by region; only populated regions appear in the result', () => {
    const groups = groupByRegion(fixtures);
    expect(groups['EASTERN_EU']?.map((m) => m.country)).toEqual(['UA']);
    expect(groups['NORDICS']?.map((m) => m.country)).toEqual(['FI']);
    expect(groups['SOUTHERN_EU']?.map((m) => m.country)).toEqual(['IT']);
    expect(groups['CENTRAL_EU']?.map((m) => m.country)).toEqual(['DE']);
    expect(groups['WESTERN_EU']?.map((m) => m.country)).toEqual(['FR']);
  });

  it('preserves caller-supplied ordering inside each region', () => {
    const ordered: QtspMeta[] = [
      meta('IT', 'b-second', 'bronze'),
      meta('IT', 'a-first', 'bronze'),
    ];
    const groups = groupByRegion(ordered);
    expect(groups['SOUTHERN_EU']?.map((m) => m.qtspSlug)).toEqual([
      'b-second',
      'a-first',
    ]);
  });

  it('emits an OTHER bucket for non-EU/EEA codes (does not silently drop)', () => {
    const groups = groupByRegion([meta('US', 'docusign', 'bronze')]);
    expect(groups['OTHER']?.map((m) => m.country)).toEqual(['US']);
  });
});

describe('REGION_ORDER', () => {
  it('lists the canonical render order for the grid', () => {
    expect(REGION_ORDER).toEqual([
      'EASTERN_EU',
      'NORDICS',
      'SOUTHERN_EU',
      'CENTRAL_EU',
      'WESTERN_EU',
      'OTHER',
    ]);
  });
});

describe('filterByState', () => {
  it('keeps only entries with the matching state', () => {
    expect(filterByState(fixtures, 'bronze').map((m) => m.country)).toEqual([
      'IT',
      'FR',
    ]);
    expect(filterByState(fixtures, 'live').map((m) => m.country)).toEqual(['UA']);
  });

  it('returns empty array when no matches', () => {
    expect(filterByState([meta('UA', 'diia', 'live')], 'bronze')).toEqual([]);
  });
});

describe('getQtspByPath', () => {
  it('looks up by lowercase `<cc>/<slug>` path', () => {
    expect(getQtspByPath(fixtures, 'IT/aruba-pec')?.displayName).toBe(
      'IT/aruba-pec',
    );
  });

  it('lookup is case-insensitive on both segments', () => {
    expect(getQtspByPath(fixtures, 'it/Aruba-PEC')?.qtspSlug).toBe('aruba-pec');
    expect(getQtspByPath(fixtures, 'UA/DIIA')?.country).toBe('UA');
  });

  it('returns undefined for unknown path', () => {
    expect(getQtspByPath(fixtures, 'XX/nope')).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(getQtspByPath(fixtures, 'no-slash')).toBeUndefined();
    expect(getQtspByPath(fixtures, '/missing-cc')).toBeUndefined();
    expect(getQtspByPath(fixtures, 'cc/')).toBeUndefined();
  });
});
