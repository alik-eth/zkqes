// V5.5 witness builder round-trip — synthetic-CAdES + admin-ecdsa fixture.
//
// Mirrors round-trip-v5_2.test.ts for V5.4 but asserts the V5.5
// witness shape:
//   - 21 public signals (drop intSpkiCommit; rename leafSpkiCommit →
//     leafKeyCommit).
//   - leafSpkiBytes padded to MAX_LEAF_SPKI=600.
//   - leafSpkiLength + leafSpkiOffsetInTbs as private inputs.
//   - leafKeyCommit byte-equal to standalone keyCommit(canonical-spki).
//   - Dropped V5.4 fields absent: leafXLimbs, leafYLimbs, intXLimbs,
//     intYLimbs, leafSpkiCommit, intSpkiCommit.

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2';
import { describe, expect, it } from 'vitest';

import { buildWitnessV5_5 } from './build-witness-v5_5';
import { keyCommit, MAX_LEAF_SPKI } from './key-commit';
import { parseP7s } from '../v5/parse-p7s';
import { buildSynthCades } from '../v5/_test-helpers/build-synth-cades';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, '../../../fixtures/v5/admin-ecdsa');

function readFixture(name: string): Buffer {
  return Buffer.from(readFileSync(resolve(FIXTURE_DIR, name)));
}

const PUBLIC_KEYS_V5_5 = [
  'timestamp', 'nullifier',
  'ctxHashHi', 'ctxHashLo',
  'bindingHashHi', 'bindingHashLo',
  'signedAttrsHashHi', 'signedAttrsHashLo',
  'leafTbsHashHi', 'leafTbsHashLo',
  'policyLeafHash',
  'leafKeyCommit',                   // V5.5 — replaces V5.4's leafSpkiCommit
  // V5.4 had 'intSpkiCommit' here — DROPPED in V5.5.
  'identityFingerprint', 'identityCommitment',
  'rotationMode', 'rotationOldCommitment', 'rotationNewWallet',
  'bindingPkXHi', 'bindingPkXLo', 'bindingPkYHi', 'bindingPkYLo',
] as const;

const REMOVED_V5_4_KEYS = [
  // P-256 affine-coord limbs (private inputs to V5.4 SpkiCommit blocks).
  'leafXLimbs', 'leafYLimbs', 'intXLimbs', 'intYLimbs',
  // Public signals replaced (leafSpkiCommit → leafKeyCommit) or dropped (intSpkiCommit).
  'leafSpkiCommit', 'intSpkiCommit',
] as const;

describe('V5.5 witness builder — admin-ecdsa round-trip', () => {
  it('produces a 21-signal V5.5 witness with leafKeyCommit + SPKI slice', async () => {
    const bindingBytes = readFixture('binding.qkb2.json');
    const leafCertDer = readFixture('leaf.der');
    const leafSpki = readFixture('leaf-spki.bin');
    const intSpki = readFixture('intermediate-spki.bin');

    const bindingDigest = Buffer.from(sha256(bindingBytes));
    const synth = buildSynthCades({
      contentDigest: bindingDigest,
      leafCertDer,
    });
    const parsed = parseP7s(synth.p7sBuffer);

    const witness = await buildWitnessV5_5({
      bindingBytes,
      leafCertDer: parsed.leafCertDer,
      leafSpki,
      intSpki,
      signedAttrsDer: parsed.signedAttrsDer,
      signedAttrsMdOffset: parsed.signedAttrsMdOffset,
      walletSecret: Buffer.alloc(32),
    });

    // ----- 21 public signals all present, V5.4 ones removed -----
    expect(PUBLIC_KEYS_V5_5.length).toBe(21);
    for (const k of PUBLIC_KEYS_V5_5) {
      expect(witness[k]).toBeDefined();
    }
    for (const removed of REMOVED_V5_4_KEYS) {
      expect((witness as Record<string, unknown>)[removed]).toBeUndefined();
    }

    // ----- leafSpkiBytes padded to MAX_LEAF_SPKI -----
    expect(witness.leafSpkiBytes.length).toBe(MAX_LEAF_SPKI);
    // First 91 bytes match canonical leaf-spki.bin (the admin-ecdsa P-256 SPKI).
    for (let i = 0; i < leafSpki.length; i++) {
      expect(witness.leafSpkiBytes[i]).toBe(leafSpki[i]);
    }
    // Tail is zero-padded.
    for (let i = leafSpki.length; i < MAX_LEAF_SPKI; i++) {
      expect(witness.leafSpkiBytes[i]).toBe(0);
    }

    // ----- leafSpkiLength matches canonical 91 bytes -----
    expect(witness.leafSpkiLength).toBe('91');

    // ----- leafSpkiOffsetInTbs is reasonable (TBS-relative, > 0) -----
    const offsetInTbs = parseInt(witness.leafSpkiOffsetInTbs, 10);
    expect(offsetInTbs).toBeGreaterThan(0);
    expect(offsetInTbs + 91).toBeLessThanOrEqual(leafCertDer.length);

    // ----- leafKeyCommit byte-equal to standalone keyCommit() -----
    const expectedCommit = await keyCommit(new Uint8Array(leafSpki));
    expect(witness.leafKeyCommit).toBe(expectedCommit.toString());

    // ----- 128-bit limb range carries forward from V5.4 -----
    const U128_MAX = 1n << 128n;
    for (const k of ['bindingPkXHi', 'bindingPkXLo', 'bindingPkYHi', 'bindingPkYLo'] as const) {
      const v = BigInt(witness[k] as string);
      expect(v).toBeGreaterThanOrEqual(0n);
      expect(v).toBeLessThan(U128_MAX);
    }
  });

  // Note on MAX_LEAF_SPKI guard: the size-rejection branch in
  // buildWitnessV5_5 fires only when findLeafSpkiInTbs returns a length
  // > 600. Constructing a synthetic leaf cert that (a) has all the
  // V5.4-required fields (subject.serialNumber etc.) AND (b) holds an
  // oversized SPKI is messier than the value of the test. The downstream
  // size guard at the keyCommit layer is unit-tested in
  // key-commit.test.ts (poseidonChunkHashVarT7 rejects > MAX_LEAF_SPKI
  // input directly).
});
