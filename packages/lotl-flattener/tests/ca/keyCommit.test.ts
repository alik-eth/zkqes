import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { keyCommit, KEY_COMMIT_DOMAIN, MAX_LEAF_SPKI } from '../../src/ca/keyCommit.js';

interface ParityFixture {
  notes: string;
  domainLiteral: string;
  domainConstant: string;
  vectors: Array<{
    label: string;
    describe?: string;
    spkiHex: string;
    expectedChunkHash: string;
    expectedKeyCommit: string;
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
// Pumped from arch-web (lead-owned) at fixtures/v5_5/key-commit-parity.json.
const parityPath = resolve(here, '../../../../fixtures/v5_5/key-commit-parity.json');

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (stripped.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('keyCommit (V5.5 algorithm-agnostic Poseidon-domain commitment)', () => {
  test('domain constant matches frozen fixture value', async () => {
    const fx = JSON.parse(await readFile(parityPath, 'utf8')) as ParityFixture;
    expect(KEY_COMMIT_DOMAIN.toString()).toBe(fx.domainConstant);
  });

  test('parity vectors round-trip byte-for-byte against SDK reference', async () => {
    const fx = JSON.parse(await readFile(parityPath, 'utf8')) as ParityFixture;
    expect(fx.vectors.length).toBeGreaterThan(0);
    for (const v of fx.vectors) {
      const spki = hexToBytes(v.spkiHex);
      const commit = await keyCommit(spki);
      expect(
        commit.toString(),
        `keyCommit mismatch for vector "${v.label}"`,
      ).toBe(v.expectedKeyCommit);
    }
  });

  test('rejects SPKI larger than MAX_LEAF_SPKI', async () => {
    const oversize = new Uint8Array(MAX_LEAF_SPKI + 1);
    await expect(keyCommit(oversize)).rejects.toThrow(/MAX_LEAF_SPKI/);
  });
});
