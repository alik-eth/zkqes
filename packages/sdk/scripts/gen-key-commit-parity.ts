// Generate fixtures/v5_5/key-commit-parity.json from the TS reference
// KeyCommit impl. Run via:
//
//   pnpm --filter @zkqes/sdk exec tsx scripts/gen-key-commit-parity.ts
//
// Re-running is idempotent. The fixture is checked into git and read
// by the TS test (key-commit.test.ts), the Solidity test
// (test/KeyCommit.t.sol), and the Circom witness/parity test.
//
// DO NOT hand-edit the JSON — regenerate from TS so all three
// implementations parity-test against the same canonical vectors.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  KEY_COMMIT_DOMAIN,
  poseidonChunkHashVarT7,
  keyCommit,
} from '../src/witness/v5_5/key-commit';

const REPO_ROOT = resolve(__dirname, '../../..');
const OUT_PATH = resolve(REPO_ROOT, 'fixtures/v5_5/key-commit-parity.json');

interface InputVector {
  label: string;
  describe: string;
  bytes: Uint8Array;
}

// Real P-256 named-curve SPKI from a sample EU eIDAS QES (Diia stub).
// 91 bytes; RFC 5480 §2.1.1.1 named-curve form.
const P256_NAMED_CURVE_SPKI_HEX =
  '3059301306072a8648ce3d020106082a8648ce3d03010703420004' +
  '11111111111111111111111111111111111111111111111111111111' +
  '11111111111111111111111111111111111111111111111111111111' +
  '11111111111111111111111111111111';

// Synthetic RSA-2048 SPKI: 294 bytes. ASN.1 envelope per RFC 8017 §A.1
// (rsaEncryption OID 1.2.840.113549.1.1.1, NULL params), modulus 256
// bytes filled with deterministic pattern, exponent 65537.
const RSA_2048_SPKI_HEX = (() => {
  const modulus = new Uint8Array(256);
  for (let i = 0; i < 256; i++) modulus[i] = (i * 7 + 3) & 0xff;
  modulus[0] |= 0x80;
  return synthRsaSpkiFromModulus(modulus);
})();

const INPUTS: InputVector[] = [
  {
    label: 'empty',
    describe: 'zero-length SPKI (degenerate but valid edge case)',
    bytes: new Uint8Array(0),
  },
  {
    label: 'one-byte',
    describe: 'single byte 0x01',
    bytes: new Uint8Array([0x01]),
  },
  {
    label: 'thirty-one-bytes',
    describe: 'exactly one chunk boundary (CHUNK=31)',
    bytes: range(31),
  },
  {
    label: 'thirty-two-bytes',
    describe: 'one byte over chunk boundary — forces two chunks',
    bytes: range(32),
  },
  {
    label: 'p256-named-curve-spki',
    describe: 'canonical 91-byte P-256 named-curve SubjectPublicKeyInfo (RFC 5480)',
    bytes: hexToBytes(P256_NAMED_CURVE_SPKI_HEX),
  },
  {
    label: 'rsa-2048-pkcs1-spki',
    describe: 'synthetic 294-byte RSA-2048 SPKI (rsaEncryption + 2048-bit modulus + e=65537)',
    bytes: hexToBytes(RSA_2048_SPKI_HEX),
  },
  {
    label: 'rsa-3072-pkcs1-spki',
    describe: 'synthetic ~422-byte RSA-3072 SPKI — exercises 3-round sponge',
    bytes: synthRsaSpki(3072),
  },
  {
    label: 'rsa-4096-pkcs1-spki',
    describe: 'synthetic ~550-byte RSA-4096 SPKI — exercises 4-round sponge (max realistic)',
    bytes: synthRsaSpki(4096),
  },
  {
    label: 'one-round-boundary',
    describe: 'exactly fills one sponge round (4 chunks + length = 5 fe = 1 round)',
    bytes: range(31 * 4),
  },
  {
    label: 'two-round-boundary',
    describe: 'exactly fills two sponge rounds (9 chunks + length = 10 fe = 2 rounds)',
    bytes: range(31 * 9),
  },
];

async function main() {
  const vectors: Array<{
    label: string;
    describe: string;
    spkiHex: string;
    expectedChunkHash: string;
    expectedKeyCommit: string;
  }> = [];
  for (const inp of INPUTS) {
    const ch = await poseidonChunkHashVarT7(inp.bytes);
    const kc = await keyCommit(inp.bytes);
    vectors.push({
      label: inp.label,
      describe: inp.describe,
      spkiHex: '0x' + bytesToHex(inp.bytes),
      expectedChunkHash: ch.toString(),
      expectedKeyCommit: kc.toString(),
    });
  }
  const fixture = {
    notes: [
      'V5.5 KeyCommit parity fixture — DO NOT hand-edit.',
      'Regenerate via `pnpm --filter @zkqes/sdk exec tsx scripts/gen-key-commit-parity.ts`.',
      'TS reference: packages/sdk/src/witness/v5_5/key-commit.ts',
      'Solidity test: packages/contracts/test/KeyCommit.t.sol',
      'Circom test: packages/circuits/test/key-commit-var.test.ts',
    ].join(' '),
    domainLiteral: 'zkqes-key-commit-v1',
    domainConstant: KEY_COMMIT_DOMAIN.toString(),
    vectors,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${OUT_PATH} (${vectors.length} vectors)`);
}

function range(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = i & 0xff;
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ----- canonical fixture inputs -----

function synthRsaSpki(modulusBits: number): Uint8Array {
  const nBytes = modulusBits / 8;
  const modulus = new Uint8Array(nBytes);
  for (let i = 0; i < nBytes; i++) modulus[i] = (i * 7 + 3) & 0xff;
  modulus[0] |= 0x80;
  return hexToBytes(synthRsaSpkiFromModulus(modulus));
}

function synthRsaSpkiFromModulus(modulus: Uint8Array): string {
  // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  // Wrapped in BIT STRING, then SubjectPublicKeyInfo SEQUENCE.
  const expBytes = [0x01, 0x00, 0x01]; // 65537
  // INTEGER modulus — prepend 00 if MSB set (modulus is treated as positive).
  const modPrefix = (modulus[0]! & 0x80) ? [0x00] : [];
  const modBody = [...modPrefix, ...modulus];
  const modTLV = derInteger(new Uint8Array(modBody));
  const expTLV = derInteger(new Uint8Array(expBytes));
  const rsaPubKey = derSequence(new Uint8Array([...modTLV, ...expTLV]));
  // BIT STRING wrapping: leading byte = unused-bits = 0
  const bitstring = derBitString(new Uint8Array([0x00, ...rsaPubKey]));
  // AlgorithmIdentifier { OID rsaEncryption, NULL }
  const rsaOidTLV = [
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  ];
  const nullTLV = [0x05, 0x00];
  const algId = derSequence(new Uint8Array([...rsaOidTLV, ...nullTLV]));
  const spki = derSequence(new Uint8Array([...algId, ...bitstring]));
  return Array.from(spki, (x) => x.toString(16).padStart(2, '0')).join('');
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function derInteger(body: Uint8Array): number[] {
  return [0x02, ...derLength(body.length), ...body];
}

function derSequence(body: Uint8Array): number[] {
  return [0x30, ...derLength(body.length), ...body];
}

function derBitString(body: Uint8Array): number[] {
  return [0x03, ...derLength(body.length), ...body];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
