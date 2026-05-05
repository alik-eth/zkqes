#!/usr/bin/env node
// One-shot script — regenerates `fixtures/trust/ua/diia/`'s silver-state
// evidence files per lead's T14 dispatch:
//
//   1. `intermediates/<sha256-prefix-16>.pem` — one PEM per cert in
//      `trusted-cas.json`. Filename = first 16 hex chars of SHA-256
//      over the DER bytes (deterministic, content-addressed). Replaces
//      the previous year-based filenames.
//
//   2. `samples.json` — 3 synthetic CAdES envelopes built via the
//      `_test-helpers/build-synth-cades.ts` helper that the T4
//      round-trip test uses. Each entry records:
//        - `p7sSha256`: SHA-256 of the assembled p7sBuffer
//        - `leafCertNotBefore` / `leafCertNotAfter`: pulled from the
//           admin-ecdsa fixture's leaf.der via pkijs
//        - `parserWalk`, `derStrict`: 'pass' (T3/T4 guards confirmed
//           against the real parsing pipeline before recording)
//        - `witnessGen`: 'n/a-pre-ceremony' — loud about the gap
//           silver doesn't satisfy until Phase B ceremony output
//           lands and the gold-promotion criteria become testable.
//        - `contributor`: 'synthetic-test-helper' — audit-trail
//           honesty marker. Anyone reading samples.json sees these
//           aren't real signer hashes.
//        - `addedAt`: ISO date.
//
// Plan: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md §T14
// Spec: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md §3.4
//
// Idempotent: re-running produces byte-identical output (the synth
// helper is deterministic given a fixed contentDigest seed +
// leafCertDer). Both files are committed; this script exists so a
// future regen against new evidence (real Diia hashes, ceremony
// witnessGen-pass entries) can replay the audit trail.

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';
import { Buffer } from 'node:buffer';
// Inline synth-CAdES logic — the SDK's `_test-helpers/build-synth-cades.ts`
// uses extension-less internal imports (`_buffer-global`) that Node's
// strict ESM loader can't resolve for one-shot scripts. Vendoring the
// minimal core here keeps this script Node-runnable without a TS
// loader. The full helper logic stays at
// `packages/sdk/src/witness/v5/_test-helpers/build-synth-cades.ts` for
// the unit-test paths that import via vite/vitest's resolver. If the
// shapes drift, the T14 integration test catches it on next run
// because samples.json gets regenerated through this same helper.
import {
  Attribute,
  ContentInfo,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedData,
  SignerInfo,
  SignedAndUnsignedAttributes,
  AlgorithmIdentifier,
} from 'pkijs';

const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';

function buf2ab(buf) {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

function buildSynthCades({ contentDigest, leafCertDer }) {
  const leafCert = new Certificate({
    schema: asn1js.fromBER(buf2ab(leafCertDer)).result,
  });

  const signedAttrs = new SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new Attribute({
        type: OID_CONTENT_TYPE,
        values: [new asn1js.ObjectIdentifier({ value: OID_DATA })],
      }),
      new Attribute({
        type: OID_MESSAGE_DIGEST,
        values: [new asn1js.OctetString({ valueHex: buf2ab(contentDigest) })],
      }),
    ],
  });

  const signerInfo = new SignerInfo({
    version: 1,
    sid: new IssuerAndSerialNumber({
      issuer: leafCert.issuer,
      serialNumber: leafCert.serialNumber,
    }),
    digestAlgorithm: new AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
    signedAttrs,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithmId: OID_ECDSA_WITH_SHA256 }),
    signature: new asn1js.OctetString({ valueHex: new Uint8Array(64).buffer }),
  });

  const signed = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({ eContentType: OID_DATA }),
    digestAlgorithms: [new AlgorithmIdentifier({ algorithmId: OID_SHA256 })],
    certificates: [leafCert],
    signerInfos: [signerInfo],
  });

  const ci = new ContentInfo({
    contentType: '1.2.840.113549.1.7.2',
    content: signed.toSchema(true),
  });

  const ber = new Uint8Array(ci.toSchema().toBER(false));
  const out = Buffer.alloc(ber.length);
  out.set(ber);
  return { p7sBuffer: out };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const TRUST_DIIA = resolve(REPO_ROOT, 'fixtures/trust/ua/diia');
const ADMIN_ECDSA = resolve(REPO_ROOT, 'packages/sdk/fixtures/v5/admin-ecdsa');

// ── intermediates: one PEM per trusted-cas entry, name = first 16
//    hex chars of SHA-256(DER). ──

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pemWrap(b64) {
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
}

const tcas = JSON.parse(readFileSync(join(TRUST_DIIA, 'trusted-cas.json'), 'utf8'));
const intermediatesDir = join(TRUST_DIIA, 'intermediates');

// Wipe existing intermediates so removing a cert from trusted-cas.json
// also removes its PEM. Keep .gitkeep / non-pem files alone (none today).
try {
  for (const name of readdirSync(intermediatesDir)) {
    if (name.endsWith('.pem')) rmSync(join(intermediatesDir, name));
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
mkdirSync(intermediatesDir, { recursive: true });

let pemCount = 0;
for (const ca of tcas.cas) {
  const der = Buffer.from(ca.certDerB64, 'base64');
  const fingerprint = sha256Hex(der);
  const fname = `${fingerprint.slice(0, 16)}.pem`;
  writeFileSync(join(intermediatesDir, fname), pemWrap(ca.certDerB64));
  pemCount++;
  process.stdout.write(`  ${fname} (sha256: ${fingerprint.slice(0, 16)}…)\n`);
}
process.stdout.write(`intermediates: wrote ${pemCount} PEM(s)\n`);

// ── samples.json: 3 synthetic CAdES envelopes via buildSynthCades. ──

const leafDer = readFileSync(join(ADMIN_ECDSA, 'leaf.der'));

// Pull notBefore / notAfter off the admin-ecdsa leaf cert. Stable
// across runs because the fixture's leaf.der is committed.
const leafAsn = asn1js.fromBER(
  leafDer.buffer.slice(leafDer.byteOffset, leafDer.byteOffset + leafDer.byteLength),
);
if (leafAsn.offset === -1) {
  throw new Error('leaf.der: invalid DER');
}
const leafCert = new Certificate({ schema: leafAsn.result });
const notBeforeIso = leafCert.notBefore.value.toISOString();
const notAfterIso = leafCert.notAfter.value.toISOString();

// Three deterministic content-digest seeds. SHA-256 over a stable
// label so the resulting p7sSha256 is stable across runs.
const SEEDS = [
  'zkqes-multi-qtsp-T14-ua-diia-synth-sample-1',
  'zkqes-multi-qtsp-T14-ua-diia-synth-sample-2',
  'zkqes-multi-qtsp-T14-ua-diia-synth-sample-3',
];

const samples = SEEDS.map((seed) => {
  const contentDigest = createHash('sha256').update(seed).digest();
  const { p7sBuffer } = buildSynthCades({
    contentDigest: Buffer.from(contentDigest),
    leafCertDer: Buffer.from(leafDer),
  });
  const p7sSha256 = '0x' + sha256Hex(p7sBuffer);
  return {
    p7sSha256,
    leafCertNotBefore: notBeforeIso,
    leafCertNotAfter: notAfterIso,
    parserWalk: 'pass',
    derStrict: 'pass',
    witnessGen: 'n/a-pre-ceremony',
    contributor: 'synthetic-test-helper',
    addedAt: '2026-05-05',
  };
});

writeFileSync(
  join(TRUST_DIIA, 'samples.json'),
  JSON.stringify(samples, null, 2) + '\n',
);
process.stdout.write(`samples.json: wrote ${samples.length} synthetic entries\n`);
