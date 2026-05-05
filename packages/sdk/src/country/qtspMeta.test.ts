import { describe, it, expect } from 'vitest';
import { QtspMetaSchema, QTSP_STATES } from './qtspMeta';

describe('QtspMeta', () => {
  const valid = {
    country: 'UA',
    qtspSlug: 'diia',
    displayName: 'Diia',
    qtspUrl: 'https://diia.gov.ua/',
    tslEntry: null,
    signingTool: { name: 'Diia mobile app', url: 'https://diia.gov.ua/', minVersion: null },
    state: 'live',
    addedAt: '2026-05-05',
    promotedAt: '2026-05-05',
    lastVerified: '2026-05-05',
    notes: 'short note',
  };

  it('accepts canonical valid input', () => {
    expect(QtspMetaSchema.parse(valid)).toMatchObject({ country: 'UA', state: 'live' });
  });

  it('rejects lowercase country', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, country: 'ua' })).toThrow();
  });

  it('rejects unknown state', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, state: 'platinum' })).toThrow();
  });

  it('rejects non-ISO date', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, addedAt: 'May 5 2026' })).toThrow();
  });

  it('rejects qtspSlug with uppercase', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, qtspSlug: 'D-Trust' })).toThrow();
  });

  it('exposes QTSP_STATES tuple', () => {
    expect(QTSP_STATES).toEqual(['bronze', 'silver', 'gold', 'live']);
  });
});
