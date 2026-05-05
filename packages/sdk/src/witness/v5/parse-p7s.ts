// PKCS#7 / CAdES-BES detached signature parser for the V5 witness builder.
//
// Verbatim port of arch-circuits f0d5a73's `src/parse-p7s.ts`. pkijs +
// asn1js are both browser-safe (already used in V4 cades.ts). Buffer is
// arch-web's polyfilled `node:buffer`.
//
// Multi-QTSP facade T4 (2026-05-05): wired `isStrictDER` at three points
// to fail fast on any BER input. Gating on the parse boundary catches
// the bug surface that pkijs's `.toBER(false)` re-encode silently
// rewrites BER→DER mid-pipeline, breaking every downstream hash
// (chain-verify, SPKI commit, signedAttrs hash). Modern QTSPs are
// mostly DER-strict, but the guards are load-bearing for any
// non-Diia QTSP — they surface `cert.berInput` ZkqesError with
// per-call-site `where` so the user-facing error attribution
// distinguishes envelope / leaf-cert / signed-attrs failures.

import { Buffer } from './_buffer-global';
import { fromBER } from 'asn1js';
import { Certificate, ContentInfo, SignedData } from 'pkijs';
import type { CmsExtraction } from './types';
import { isStrictDER } from '../../cert/der-strict';
import { ZkqesError } from '../../errors';

/**
 * Zero-copy view over a `Buffer`'s underlying `ArrayBuffer`. Handing
 * this to `isStrictDER` avoids any allocation; the guard walker
 * indexes into the same bytes the caller passed in.
 */
function bufferToUint8Array(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

type GuardWhere = 'p7s-envelope' | 'leaf-cert' | 'signed-attrs';

/**
 * Run `isStrictDER` over `bytes`; on failure, throw `cert.berInput`
 * `ZkqesError` with `reason`/`offset`/`path`/`where` context. The
 * `where` field is what surfaces in the user-facing copy: "your
 * envelope is BER" vs "your leaf cert is BER" vs "your signedAttrs
 * are out of canonical order."
 */
function guardStrictDER(bytes: Uint8Array, where: GuardWhere): void {
  const guard = isStrictDER(bytes);
  if (!guard.ok) {
    throw new ZkqesError('cert.berInput', {
      reason: guard.reason,
      offset: guard.offset,
      path: guard.path,
      where,
    });
  }
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  // Make a copy because pkijs / asn1js mutate the underlying buffer in
  // some code paths and we don't want to corrupt the caller's bytes.
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

/**
 * Find the offset of the messageDigest Attribute SEQUENCE (`0x30 0x2f`)
 * inside a signedAttrs buffer. Looks for the canonical 15-byte CMS
 * sub-prefix —
 *
 *   06 09 2A 86 48 86 F7 0D 01 09 04   // OID 1.2.840.113549.1.9.4
 *   31 22                              // SET (0x31), length 34
 *   04 20                              // OCTET STRING (0x04), length 32
 *
 * — then returns the offset 2 bytes earlier (i.e. of the leading `0x30 0x2f`
 * Attribute SEQUENCE wrap).
 */
function findMessageDigestAttrOffset(signedAttrs: Buffer): number {
  const NEEDLE = Buffer.from([
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04,
    0x31, 0x22, 0x04, 0x20,
  ]);
  const at = signedAttrs.indexOf(NEEDLE);
  if (at < 0) {
    throw new Error('parse-p7s: messageDigest OID + SET/OCTET prefix not found in signedAttrs');
  }
  const seqStart = at - 2;
  if (seqStart < 0 || signedAttrs[seqStart] !== 0x30 || signedAttrs[seqStart + 1] !== 0x2f) {
    throw new Error(
      'parse-p7s: messageDigest OID not preceded by canonical 0x30 0x2f Attribute SEQUENCE',
    );
  }
  return seqStart;
}

/**
 * Re-encode pkijs's SignedAttributes block from `[0]` IMPLICIT (the
 * on-the-wire CMS form, tag 0xA0) into the SET form (tag 0x31) that the
 * leaf signature actually signs over. RFC 5652 §5.4 canonical form.
 */
function reTagSignedAttrs(implicitDer: ArrayBuffer): Buffer {
  const view = new Uint8Array(implicitDer);
  if (view.length === 0) throw new Error('parse-p7s: empty signedAttrs');
  if (view[0] !== 0xa0) {
    throw new Error(
      `parse-p7s: expected [0] IMPLICIT tag 0xA0 on signedAttrs; got 0x${view[0]!.toString(16)}`,
    );
  }
  const out = Buffer.alloc(view.length);
  out.set(view);
  out[0] = 0x31; // SET tag
  return out;
}

/**
 * Parse a raw `.p7s` (CAdES-BES detached signature) and extract the
 * artifacts the V5 witness builder + register() calldata need.
 *
 * Asserts: exactly one SignerInfo, one leaf cert, optional intermediate.
 */
export function parseP7s(p7sBuffer: Buffer): CmsExtraction {
  // Guard #1: outer envelope. Recursive walk catches every BER-form
  // violation in the entire `.p7s` blob — the leaf cert and its TBS
  // ride along inside this top-level TLV, so an indefinite-length
  // anywhere in the tree gets caught here. The leaf-cert + signedAttrs
  // checks below are then "redundant for correctness, but useful for
  // error attribution" per the multi-QTSP facade design.
  guardStrictDER(bufferToUint8Array(p7sBuffer), 'p7s-envelope');

  const asn = fromBER(bufferToArrayBuffer(p7sBuffer));
  if (asn.offset === -1) throw new Error('parse-p7s: invalid BER');
  const contentInfo = new ContentInfo({ schema: asn.result });
  const signed = new SignedData({ schema: contentInfo.content });

  if (signed.signerInfos.length !== 1) {
    throw new Error(
      `parse-p7s: expected exactly 1 SignerInfo, got ${signed.signerInfos.length}`,
    );
  }
  const signer = signed.signerInfos[0]!;
  if (!signer.signedAttrs) {
    throw new Error('parse-p7s: SignerInfo missing signedAttrs (CAdES-BES requires it)');
  }

  const signedAttrsDer = reTagSignedAttrs(signer.signedAttrs.toSchema().toBER(false));
  // Guard #2: signedAttrs POST-reTag. This guard is LOAD-BEARING (not
  // belt-and-suspenders): the wire-form SignedAttributes are wrapped in
  // `[0] IMPLICIT` (tag 0xA0), which the recursive envelope walker
  // recurses into as a constructed wrapper but does NOT apply the
  // SET-OF lex-ordering rule to (the rule is gated on universal SET
  // tag 0x31). After `reTagSignedAttrs` flips 0xA0 → 0x31, the SET-OF
  // canonical-ordering check kicks in — this is the only place we
  // catch signing tools that emit SignedAttributes in non-canonical
  // order, the most common real-world deviation even when the issuer
  // ships strict-DER certs.
  guardStrictDER(bufferToUint8Array(signedAttrsDer), 'signed-attrs');
  const signedAttrsMdOffset = findMessageDigestAttrOffset(signedAttrsDer);

  // Leaf signature: Diia uses ECDSA-P256, signature value is concatenated
  // (r || s) inside an ASN.1 SEQUENCE inside a BIT STRING. pkijs gives us
  // the inner OCTET STRING bytes via `signer.signature.valueBlock.valueHexView`.
  const leafSigBytes = Buffer.from(
    new Uint8Array(signer.signature.valueBlock.valueHexView),
  );
  // ECDSA r/s aren't extracted here — they're a calldata-side concern and
  // the witness builder's circuit-input contract doesn't see them.
  const leafSigR = leafSigBytes; // raw — caller decodes to (r,s) if needed

  // Certificates. pkijs sorts them in include order; the actual leaf vs
  // intermediate distinction needs basicConstraints inspection. Heuristic:
  // the cert whose `subject.serialNumber` (OID 2.5.4.5) starts with an ETSI
  // EN 319 412-1 prefix (TIN/PNO/IDC/PAS/CPI) is the leaf; everything else
  // is treated as intermediate. Falls back to "first cert == leaf".
  if (!signed.certificates || signed.certificates.length === 0) {
    throw new Error('parse-p7s: SignedData carries no certificates');
  }
  const certs = signed.certificates.filter((c): c is Certificate => c instanceof Certificate);
  if (certs.length === 0) {
    throw new Error('parse-p7s: SignedData carries no Certificate-typed entries');
  }
  let leaf: Certificate | undefined;
  let intCert: Certificate | undefined;
  const ETSI_PREFIXES = ['TIN', 'PNO', 'IDC', 'PAS', 'CPI'];
  for (const c of certs) {
    const serialAttr = c.subject.typesAndValues.find(
      (a) => a.type === '2.5.4.5',
    );
    const value =
      typeof serialAttr?.value?.valueBlock?.value === 'string'
        ? (serialAttr.value.valueBlock.value as string)
        : '';
    if (!leaf && ETSI_PREFIXES.some((p) => value.startsWith(p))) leaf = c;
    else if (!intCert) intCert = c;
  }
  leaf ??= certs[0]!;
  if (intCert === leaf) intCert = undefined;

  // Guard #3: leaf cert. Slice from the original `p7sBuffer` via
  // asn1js's `valueBeforeDecodeView` (a Uint8Array view over the
  // original input range that pkijs preserved on parse) — NEVER via
  // `.toSchema().toBER(false)`, which is the very re-encode this whole
  // exercise is dodging. Per the design's "redundant for correctness
  // but useful for error attribution" framing: the outer envelope
  // guard already validated this slice transitively, but `where:
  // 'leaf-cert'` lets the user-facing copy say "your leaf cert is BER"
  // rather than the broader "something somewhere in your `.p7s` is
  // BER".
  const leafSchema = leaf.toSchema() as { valueBeforeDecodeView?: Uint8Array };
  const leafBeforeDecode = leafSchema.valueBeforeDecodeView;
  if (leafBeforeDecode === undefined) {
    // Defensive: the asn1js API exposes this on every node parsed via
    // `fromBER`, so this path indicates a pkijs/asn1js version drift.
    // Surface as a generic Error rather than a `cert.berInput` since
    // the failure mode isn't user-actionable.
    throw new Error(
      'parse-p7s: leaf cert schema is missing valueBeforeDecodeView (asn1js API drift?)',
    );
  }
  guardStrictDER(leafBeforeDecode, 'leaf-cert');

  const leafCertDer = Buffer.from(new Uint8Array(leaf.toSchema().toBER(false)));

  const result: CmsExtraction = {
    signedAttrsDer,
    signedAttrsMdOffset,
    leafCertDer,
    leafSigR,
  };
  if (intCert) {
    result.intCertDer = Buffer.from(new Uint8Array(intCert.toSchema().toBER(false)));
  }
  return result;
}
