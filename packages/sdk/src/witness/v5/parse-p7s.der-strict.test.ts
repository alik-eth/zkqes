// parseP7s + DER-strict guard wiring (T4).
//
// Two test cases per plan §T4:
//
//   1. Indefinite-length outer envelope → throws `cert.berInput` with
//      reason 'indefinite-length' + where 'p7s-envelope'. Trips the
//      guard at offset 0, before any pkijs parsing.
//
//   2. Known-good DER `.p7s` parses end-to-end. Round-trips through
//      `buildSynthCades` (existing test helper at
//      `_test-helpers/build-synth-cades.ts`) which wraps the
//      `fixtures/v5/admin-ecdsa/leaf.der` cert in a strict-DER CMS
//      envelope. Plan §T4 step 1 originally asked for a synthetic
//      `synth-diia-p7s.ts` fixture but the existing helper covers
//      the same role idiomatically — re-using it avoids duplicating
//      ~200 lines of CAdES-BES envelope construction.

import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha256';
import { parseP7s } from './parse-p7s';
import { ZkqesError } from '../../errors';
import { buildSynthCades } from './_test-helpers/build-synth-cades';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, '../../../fixtures/v5/admin-ecdsa');

describe('parseP7s — DER-strict guard', () => {
  it('rejects an indefinite-length-encoded outer envelope', () => {
    // Minimal SEQUENCE with indefinite-length form (BER, prohibited
    // in DER). 0x30 0x80 starts the envelope; 0x00 0x00 is the BER
    // end-of-contents octet pair. The guard rejects at offset 0.
    const berEnvelope = Buffer.from('30800201010000', 'hex');
    expect(() => parseP7s(berEnvelope)).toThrow(ZkqesError);
    try {
      parseP7s(berEnvelope);
      throw new Error('expected parseP7s to throw');
    } catch (e) {
      expect((e as ZkqesError).code).toBe('cert.berInput');
      expect((e as ZkqesError).details).toMatchObject({
        reason: 'indefinite-length',
        where: 'p7s-envelope',
      });
    }
  });

  it('parses a known-good DER `.p7s` end-to-end (round-trips through buildSynthCades)', () => {
    const bindingBytes = Buffer.from(
      readFileSync(resolve(FIXTURE_DIR, 'binding.qkb2.json')),
    );
    const leafCertDer = Buffer.from(
      readFileSync(resolve(FIXTURE_DIR, 'leaf.der')),
    );
    const synth = buildSynthCades({
      contentDigest: Buffer.from(sha256(bindingBytes)),
      leafCertDer,
    });
    const parsed = parseP7s(synth.p7sBuffer);
    expect(parsed.leafCertDer.length).toBeGreaterThan(0);
    expect(parsed.signedAttrsDer.length).toBeGreaterThan(0);
    // signedAttrs MUST start with SET tag (0x31) post-reTag — and the
    // post-reTag guard must have admitted those bytes.
    expect(parsed.signedAttrsDer[0]).toBe(0x31);
  });
});
