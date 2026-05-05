/**
 * V5.4 — `buildAgeWitness` unit tests.
 *
 * Strategy: mock `parseP7s` + `extractDobFromDiiaUA` so the tests drive
 * the witness builder's math (ageQualified comparator, public-signal
 * shape, nullifierCtx pass-through, error path) without depending on a
 * real Diia .p7s (gitignored per CLAUDE.md secrets hygiene).
 *
 * The byte-level Diia DOB scanner is unit-tested separately in
 * `src/dob/index.test.ts` (extractor-level tests) — this file pins the
 * V5.4 witness-builder seam.
 *
 * Public-signal layout slots (orchestration §1.3 — FROZEN):
 *   0 ageQualified, 1 ageCutoffDate, 2 nullifierCtx.
 */

import { Buffer } from 'buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../v5/parse-p7s.js', () => ({
  parseP7s: vi.fn(),
}));
vi.mock('../../dob/index.js', () => ({
  extractDobFromDiiaUA: vi.fn(),
}));

import { parseP7s } from '../v5/parse-p7s.js';
import { extractDobFromDiiaUA } from '../../dob/index.js';
import { buildAgeWitness } from './build-age-witness.js';
import { ZkqesError } from '../../errors/index.js';

const mockedParseP7s = vi.mocked(parseP7s);
const mockedExtract = vi.mocked(extractDobFromDiiaUA);

const FAKE_LEAF = Buffer.from(
  // 16 bytes of canned content; the value doesn't matter because the
  // extractor mock returns synthetic results regardless. We just need
  // a non-empty Buffer for parseP7s' mocked return.
  Array.from({ length: 16 }, (_, i) => i),
);

const FAKE_CADES = Buffer.from([0x30, 0x82, 0x00, 0x10]); // not parsed; mocked

const NCTX_HEX = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const NCTX_DEC =
  '77648812782670860460512307594061302913369283834606025297048026922953510464427'; // BigInt(NCTX_HEX) constant for assertion

const BINDING = ('0x' + 'cd'.repeat(32)) as `0x${string}`;

afterEach(() => {
  vi.restoreAllMocks();
  mockedParseP7s.mockReset();
  mockedExtract.mockReset();
});

function primeMocks(
  ymd: number,
  opts: { sdaFrameOffsetInTbs?: number; supported?: boolean } = {},
) {
  mockedParseP7s.mockReturnValue({
    leafCertDer: FAKE_LEAF,
    signedAttrsDer: Buffer.alloc(0),
    signedAttrsMdOffset: 0,
    leafSigR: Buffer.alloc(32),
  });
  mockedExtract.mockReturnValue({
    supported: opts.supported ?? true,
    ymd,
    sourceTag: 1,
    sdaFrameOffsetInTbs: opts.sdaFrameOffsetInTbs ?? 64,
  });
}

describe('buildAgeWitness — V5.4 age witness builder', () => {
  it('produces ageQualified=1 when DOB ≤ cutoff (DOB 2006-01-01, cutoff 2007-01-01)', async () => {
    primeMocks(20060101);
    const out = await buildAgeWitness({
      signedCades: FAKE_CADES,
      bindingId: BINDING,
      ageCutoffDate: 20070101,
      nullifierCtxKeccak: NCTX_HEX,
    });
    expect(out.publicSignals.ageQualified).toBe(1);
    expect(out.publicSignals.ageCutoffDate).toBe(20070101);
    expect(out.dobYmd).toBe(20060101);
  });

  it('produces ageQualified=0 when DOB > cutoff (DOB 2008-06-15, cutoff 2007-01-01)', async () => {
    primeMocks(20080615);
    const out = await buildAgeWitness({
      signedCades: FAKE_CADES,
      bindingId: BINDING,
      ageCutoffDate: 20070101,
      nullifierCtxKeccak: NCTX_HEX,
    });
    expect(out.publicSignals.ageQualified).toBe(0);
    expect(out.dobYmd).toBe(20080615);
  });

  it('produces ageQualified=1 on the boundary (DOB == cutoff)', async () => {
    primeMocks(20070101);
    const out = await buildAgeWitness({
      signedCades: FAKE_CADES,
      bindingId: BINDING,
      ageCutoffDate: 20070101,
      nullifierCtxKeccak: NCTX_HEX,
    });
    expect(out.publicSignals.ageQualified).toBe(1);
  });

  it('passes the consumer-computed nullifierCtxKeccak through to publicSignals as decimal', async () => {
    primeMocks(20000101);
    const out = await buildAgeWitness({
      signedCades: FAKE_CADES,
      bindingId: BINDING,
      ageCutoffDate: 20070101,
      nullifierCtxKeccak: NCTX_HEX,
    });
    // Honors §1.6: SDK does NOT derive nullifierCtx; consumer passes
    // the keccak result, SDK lifts to BN254-scalar decimal.
    expect(out.publicSignals.nullifierCtx).toBe(NCTX_DEC);
    expect(out.witness.nullifierCtxInput).toBe(NCTX_DEC);
  });

  it('emits the §1.3 FROZEN public-signal triple shape (3 fields, named slots)', async () => {
    primeMocks(20000101);
    const out = await buildAgeWitness({
      signedCades: FAKE_CADES,
      bindingId: BINDING,
      ageCutoffDate: 20180101,
      nullifierCtxKeccak: NCTX_HEX,
    });
    // The orchestration §1.3 slot order is enforced by the calldata
    // packer (`packAgeProof`); here we just pin that the SDK surfaces
    // exactly the three named publics and nothing more.
    expect(Object.keys(out.publicSignals).sort()).toEqual([
      'ageCutoffDate',
      'ageQualified',
      'nullifierCtx',
    ]);
  });

  it('includes the SDA frame offset in the witness for the AgeDiiaUA scan anchor', async () => {
    primeMocks(20000101, { sdaFrameOffsetInTbs: 137 });
    const out = await buildAgeWitness({
      signedCades: FAKE_CADES,
      bindingId: BINDING,
      ageCutoffDate: 20180101,
      nullifierCtxKeccak: NCTX_HEX,
    });
    expect(out.witness.sdaFrameOffsetInTbs).toBe(137);
    expect(out.witness.ageCutoffDateIn).toBe(20180101);
  });

  it('throws ZkqesError when the leaf cert lacks the Diia SDA DOB frame', async () => {
    primeMocks(0, { supported: false, sdaFrameOffsetInTbs: -1 });
    await expect(
      buildAgeWitness({
        signedCades: FAKE_CADES,
        bindingId: BINDING,
        ageCutoffDate: 20180101,
        nullifierCtxKeccak: NCTX_HEX,
      }),
    ).rejects.toThrow(ZkqesError);
  });
});
