import { describe, it, expect } from 'vitest';
import { QtspMetaSchema, QTSP_STATES, DOB_ENCODINGS } from './qtspMeta';

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
    // V5.4 fields — required on every QtspMeta document going forward.
    dobEncoding: 'diia-ua' as const,
    dobAttributeOid: '1.2.804.2.1.1.1.11.1.4.11.1',
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

  // ── V5.4 dob-encoding fields ────────────────────────────────────────

  it('exposes DOB_ENCODINGS tuple', () => {
    expect(DOB_ENCODINGS).toEqual(['rfc-3739', 'diia-ua', 'none']);
  });

  it("accepts dobEncoding='diia-ua' with non-null dotted-decimal OID", () => {
    const parsed = QtspMetaSchema.parse({
      ...valid,
      dobEncoding: 'diia-ua',
      dobAttributeOid: '1.2.804.2.1.1.1.11.1.4.11.1',
    });
    expect(parsed.dobEncoding).toBe('diia-ua');
    expect(parsed.dobAttributeOid).toBe('1.2.804.2.1.1.1.11.1.4.11.1');
  });

  it("accepts dobEncoding='none' paired with null dobAttributeOid", () => {
    const parsed = QtspMetaSchema.parse({
      ...valid,
      dobEncoding: 'none',
      dobAttributeOid: null,
    });
    expect(parsed.dobEncoding).toBe('none');
    expect(parsed.dobAttributeOid).toBeNull();
  });

  it("rejects dobEncoding='cf-italy' (not in V5.4 enum; reserved for future tier)", () => {
    // The spread widens dobEncoding to string at compile time, so no
    // `@ts-expect-error` is needed; the assertion is a runtime check
    // against the Zod enum.
    expect(() =>
      QtspMetaSchema.parse({
        ...valid,
        dobEncoding: 'cf-italy',
        dobAttributeOid: '1.2.3.4',
      }),
    ).toThrow();
  });

  it("rejects dobEncoding='none' with non-null dobAttributeOid (cross-field)", () => {
    expect(() =>
      QtspMetaSchema.parse({
        ...valid,
        dobEncoding: 'none',
        dobAttributeOid: '1.2.3.4',
      }),
    ).toThrow(/must be null when dobEncoding === 'none'/);
  });

  it("rejects dobEncoding='diia-ua' with null dobAttributeOid (cross-field)", () => {
    expect(() =>
      QtspMetaSchema.parse({
        ...valid,
        dobEncoding: 'diia-ua',
        dobAttributeOid: null,
      }),
    ).toThrow(/must be a dotted-decimal OID/);
  });

  it('rejects malformed dobAttributeOid (single arc, not dotted)', () => {
    expect(() =>
      QtspMetaSchema.parse({
        ...valid,
        dobEncoding: 'diia-ua',
        dobAttributeOid: '1',
      }),
    ).toThrow();
  });
});
