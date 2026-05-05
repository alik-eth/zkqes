import { describe, it, expect } from 'vitest';
import { isStrictDER } from './der-strict';

// Helper: hex → Uint8Array
const h = (s: string) =>
  new Uint8Array(s.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

describe('isStrictDER', () => {
  it('accepts canonical SEQUENCE { INTEGER 1 }', () => {
    expect(isStrictDER(h('3003020101'))).toEqual({ ok: true });
  });

  it('accepts canonical INTEGER zero (single 0x00 byte) — lead T3 add-on', () => {
    // `02 01 00` — INTEGER value 0 in canonical 1-byte form. The strict
    // INTEGER rule rejects redundant 0x00 prefix only when contentLen ≥ 2;
    // contentLen=1 must always pass.
    expect(isStrictDER(h('020100'))).toEqual({ ok: true });
  });

  it('accepts canonical OID 2.5.4.5 (subjectSerialNumber) — lead T3 add-on', () => {
    // `06 03 55 04 05` — OID 2.5.4.5. Real-fixture territory; the OID
    // canonical rule is "no leading 0x80 padding byte in any subidentifier".
    // 0x55 = first-arc 2 + second-arc 5 = 2*40+5 = 85. 0x04 = 4. 0x05 = 5.
    expect(isStrictDER(h('0603550405'))).toEqual({ ok: true });
  });

  it('rejects indefinite-length SEQUENCE', () => {
    const r = isStrictDER(h('3080020101000a'));
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: 'indefinite-length' });
  });

  it('rejects non-minimal length (0x82 0x00 0x05 instead of 0x05)', () => {
    const r = isStrictDER(h('3082000502010102010f'));
    expect(r).toMatchObject({ ok: false, reason: 'non-minimal-length' });
  });

  it('rejects INTEGER with redundant 0x00 prefix', () => {
    expect(isStrictDER(h('30050203000001'))).toMatchObject({
      ok: false,
      reason: 'non-canonical-integer',
    });
  });

  it('rejects SET-OF with unsorted members', () => {
    // SET-OF { INTEGER 2, INTEGER 1 } — must be sorted lex by encoding.
    expect(isStrictDER(h('3106020102020101'))).toMatchObject({
      ok: false,
      reason: 'non-canonical-set',
    });
  });

  it('rejects truncated TLV', () => {
    expect(isStrictDER(h('30'))).toMatchObject({
      ok: false,
      reason: 'truncated',
    });
  });

  it('round-trips a real DER SubjectPublicKeyInfo (Diia leaf)', async () => {
    const { default: spkiHex } = await import(
      '../../tests/fixtures/diia-leaf-spki.json',
      { assert: { type: 'json' } }
    );
    expect(isStrictDER(h(spkiHex.spki))).toEqual({ ok: true });
  });

  // ---------------------------------------------------------------------
  // T3.1 — defense-in-depth reject cases. The 4 checks below are
  // implemented in `der-strict.ts` but weren't surfaced in the original
  // T3 test sweep. Per lead's T3 ack: BOOLEAN / BIT STRING / NULL / OID
  // are content that real X.509 carries everywhere (basicConstraints,
  // signatureValue, KeyUsage, every AlgorithmIdentifier + Attribute +
  // Extension), so a regression in any reject path bites real fast.
  // ---------------------------------------------------------------------

  it('rejects BOOLEAN with content !== 0x00 or 0xFF (T3.1)', () => {
    expect(isStrictDER(h('010101'))).toMatchObject({
      ok: false,
      reason: 'non-canonical-boolean',
    });
    // Sanity: canonical TRUE encoding (0xFF) must pass.
    expect(isStrictDER(h('0101ff'))).toEqual({ ok: true });
  });

  it('rejects BIT STRING with unused-bits > 7 (T3.1)', () => {
    expect(isStrictDER(h('030208ff'))).toMatchObject({
      ok: false,
      reason: 'non-canonical-bit-string',
    });
  });

  it('rejects NULL with non-zero length (T3.1)', () => {
    expect(isStrictDER(h('050100'))).toMatchObject({
      ok: false,
      reason: 'non-canonical-null',
    });
  });

  it('rejects OID with leading 0x80 padding byte (T3.1)', () => {
    // Subid `0x80 0x01` would encode value 1 with a redundant
    // continuation byte — DER §10 requires the minimum-byte base-128
    // encoding for every subidentifier.
    expect(isStrictDER(h('06028001'))).toMatchObject({
      ok: false,
      reason: 'non-canonical-oid',
    });
  });
});
