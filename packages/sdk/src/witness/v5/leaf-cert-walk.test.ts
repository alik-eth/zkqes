// Tests for V5.5's `findLeafSpkiInTbs` walker. Verifies the byte slice
// extracted from leafTbsBytes byte-for-byte equals the canonical
// leaf-spki.bin fixture (91-byte P-256 SPKI from real Diia leaf).
//
// The walker is the load-bearing primitive for V5.5's leaf-block
// soundness — see spec §7.3 byte-equality gate. A drift between
// circuit-side offset binding and TS-side extraction breaks the proof
// silently (circuit accepts, contract rejects on keyCommit mismatch),
// so this test is the first defensive line.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  findLeafSpkiInTbs,
  findTbsInCert,
  findSubjectSerial,
} from './leaf-cert-walk';
import { Buffer } from './_buffer-global';

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/v5/admin-ecdsa');

function loadLeafDer(): Buffer {
  return Buffer.from(readFileSync(resolve(FIXTURE_DIR, 'leaf.der')));
}

function loadLeafSpki(): Buffer {
  return Buffer.from(readFileSync(resolve(FIXTURE_DIR, 'leaf-spki.bin')));
}

describe('findLeafSpkiInTbs', () => {
  it('extracts the canonical 91-byte SPKI from a real Diia leaf', () => {
    const leaf = loadLeafDer();
    const tbsRange = findTbsInCert(leaf);
    const tbs = leaf.subarray(tbsRange.offset, tbsRange.offset + tbsRange.length);

    const spkiRange = findLeafSpkiInTbs(tbs);
    expect(spkiRange.length).toBe(91);

    const extracted = tbs.subarray(spkiRange.offset, spkiRange.offset + spkiRange.length);
    const canonical = loadLeafSpki();
    expect(extracted.equals(canonical)).toBe(true);
  });

  it('returns offsets that are TBS-relative (not leaf-cert-relative)', () => {
    const leaf = loadLeafDer();
    const tbsRange = findTbsInCert(leaf);
    const tbs = leaf.subarray(tbsRange.offset, tbsRange.offset + tbsRange.length);

    const spkiRange = findLeafSpkiInTbs(tbs);
    // Slice using the returned offset against `tbs` — must yield the
    // canonical SPKI. If the function returned leaf-cert-relative
    // offsets, this slice would point at the wrong region.
    const sliced = tbs.subarray(spkiRange.offset, spkiRange.offset + spkiRange.length);
    expect(sliced.equals(loadLeafSpki())).toBe(true);
  });

  it('rejects a non-SEQUENCE TBS', () => {
    const bad = Buffer.from([0x02, 0x01, 0x00]); // INTEGER, not SEQUENCE
    expect(() => findLeafSpkiInTbs(bad)).toThrow(/not a SEQUENCE/);
  });

  it('rejects truncated TBS (eof while skipping fields)', () => {
    // Construct a degenerate TBS: SEQUENCE of length 2 containing only
    // an empty SEQUENCE (one field). Walker tries to skip 5 fields and
    // hits TBS end early.
    const bad = Buffer.from([0x30, 0x02, 0x30, 0x00]);
    expect(() => findLeafSpkiInTbs(bad)).toThrow(/truncated/);
  });

  it('produces an offset that aligns with subject (last skipped field)', () => {
    // Sanity check: SPKI offset must be > subject's offset, since
    // subject is the field immediately preceding SPKI.
    const leaf = loadLeafDer();
    const tbsRange = findTbsInCert(leaf);
    const tbs = leaf.subarray(tbsRange.offset, tbsRange.offset + tbsRange.length);

    const subjectSerial = findSubjectSerial(leaf);
    const spkiRange = findLeafSpkiInTbs(tbs);

    // findSubjectSerial returns leaf-cert-relative offsets, findLeafSpkiInTbs
    // returns TBS-relative. Convert to compare: SPKI's leaf-relative
    // offset = tbsRange.offset + spkiRange.offset.
    const spkiLeafOffset = tbsRange.offset + spkiRange.offset;
    expect(spkiLeafOffset).toBeGreaterThan(subjectSerial.offset);
  });
});
