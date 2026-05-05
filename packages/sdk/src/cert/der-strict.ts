/**
 * isStrictDER — pure-byte X.690 §10 (Distinguished Encoding Rules) guard.
 *
 * Walks a byte sequence as a tree of TLVs and verifies every primitive +
 * length-encoding rule that distinguishes DER from BER. Returns
 * `{ ok: true }` on success or `{ ok, reason, offset, path }` on the first
 * failure; recursion stops at the failing TLV.
 *
 * Why this matters: pkijs's `.toBER(false)` re-encodes structures before
 * downstream hashes (chain-verify, SPKI-commit, signedAttrs hash). A
 * BER-encoded leaf cert silently turns into a DIFFERENT byte sequence on
 * re-encode, breaking every signature + commitment that was computed over
 * the original bytes. Modern QTSPs are mostly DER-strict but the guard is
 * load-bearing for any non-Diia QTSP — it fails fast at the parse boundary
 * with an actionable reason rather than silently producing wrong outputs.
 *
 * Spec ref: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md §6.2 + §6.3
 * Plan ref: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md T3
 *
 * Implementation notes (per lead's T3 gotchas):
 *  - SET-OF canonical order: children sorted by full encoding (tag + length
 *    + value), bytewise lex with shorter-as-prefix-less. Walked via offset
 *    + length tuples so the recursion stays slice-free; only SET ordering
 *    materializes child byte ranges and even then only as offsets, not
 *    Uint8Array copies.
 *  - INTEGER canonical: single-byte content always valid (incl. 0x00).
 *    Multi-byte: reject if first byte is 0x00 with second byte's high bit
 *    clear (redundant zero pad), or first byte 0xFF with second byte's
 *    high bit set (redundant sign extension).
 *  - Length encoding: short form (<0x80) preferred. Long form requires
 *    minimal byte count — reject when 0x82 0x00 0x05 is used for what
 *    short form 0x05 would encode.
 *
 * Performance: target <1ms for typical X.509 leaf cert. Achieved by
 * walking with offsets only; no copies in the canonical path.
 */

export type DerStrictReason =
  | 'indefinite-length'
  | 'non-minimal-length'
  | 'non-canonical-integer'
  | 'non-canonical-set'
  | 'non-canonical-boolean'
  | 'non-canonical-bit-string'
  | 'non-canonical-null'
  | 'non-canonical-oid'
  | 'truncated';

export type DerStrictResult =
  | { ok: true }
  | {
      ok: false;
      reason: DerStrictReason;
      offset: number;
      path: string;
    };

// ---------------------------------------------------------------------------
// Tag constants (universal class, primitive bit clear / set per type).
// ---------------------------------------------------------------------------
const TAG_BOOLEAN = 0x01;
const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_NULL = 0x05;
const TAG_OID = 0x06;
const TAG_SEQUENCE = 0x30; // constructed
const TAG_SET = 0x31; // constructed

function tagName(tag: number): string {
  const cls = tag & 0xc0;
  if (cls === 0x80) return `[${tag & 0x1f}]`;
  if (cls === 0x40) return `APP[${tag & 0x1f}]`;
  if (cls === 0xc0) return `PRIV[${tag & 0x1f}]`;
  switch (tag) {
    case TAG_BOOLEAN: return 'BOOLEAN';
    case TAG_INTEGER: return 'INTEGER';
    case TAG_BIT_STRING: return 'BIT_STRING';
    case 0x04: return 'OCTET_STRING';
    case TAG_NULL: return 'NULL';
    case TAG_OID: return 'OID';
    case 0x0c: return 'UTF8String';
    case 0x13: return 'PrintableString';
    case 0x14: return 'TeletexString';
    case 0x16: return 'IA5String';
    case 0x17: return 'UTCTime';
    case 0x18: return 'GeneralizedTime';
    case 0x1e: return 'BMPString';
    case TAG_SEQUENCE: return 'SEQUENCE';
    case TAG_SET: return 'SET';
    default: return `TAG_${tag.toString(16).padStart(2, '0')}`;
  }
}

const fail = (
  reason: DerStrictReason,
  offset: number,
  path: string,
): DerStrictResult => ({ ok: false, reason, offset, path });

// ---------------------------------------------------------------------------
// Header parser. Returns the content's [start, end) range plus the next
// offset (== end). Does NOT validate per-tag rules.
// ---------------------------------------------------------------------------
interface ParsedHeader {
  readonly tag: number;
  readonly contentStart: number;
  readonly contentEnd: number;
}

type HeaderResult =
  | { ok: true; header: ParsedHeader }
  | { ok: false; reason: DerStrictReason };

function parseHeader(
  buf: Uint8Array,
  offset: number,
  end: number,
): HeaderResult {
  if (offset >= end) return { ok: false, reason: 'truncated' };
  const tag = buf[offset]!;
  const lengthOffset = offset + 1;
  if (lengthOffset >= end) return { ok: false, reason: 'truncated' };
  const firstLengthByte = buf[lengthOffset]!;
  let contentLen: number;
  let lengthByteCount: number;
  if (firstLengthByte < 0x80) {
    // Short form.
    contentLen = firstLengthByte;
    lengthByteCount = 1;
  } else if (firstLengthByte === 0x80) {
    // BER-only indefinite-length form. Disallowed in DER.
    return { ok: false, reason: 'indefinite-length' };
  } else {
    // Long form.
    const numLengthBytes = firstLengthByte & 0x7f;
    // Refuse pathological lengths >4 bytes (would never appear in real
    // certs and signals malformed input).
    if (numLengthBytes === 0 || numLengthBytes > 4) {
      return { ok: false, reason: 'non-minimal-length' };
    }
    if (lengthOffset + numLengthBytes >= end) {
      return { ok: false, reason: 'truncated' };
    }
    contentLen = 0;
    for (let i = 0; i < numLengthBytes; i++) {
      contentLen = (contentLen << 8) | buf[lengthOffset + 1 + i]!;
    }
    // DER §10.1: long form prohibited when short form would encode the
    // same value (i.e., contentLen < 128 must use short form).
    if (contentLen < 0x80) {
      return { ok: false, reason: 'non-minimal-length' };
    }
    // Long form must use the minimum number of bytes — leading 0x00 byte
    // is redundant.
    if (numLengthBytes >= 2 && buf[lengthOffset + 1] === 0x00) {
      return { ok: false, reason: 'non-minimal-length' };
    }
    lengthByteCount = 1 + numLengthBytes;
  }
  const contentStart = offset + 1 + lengthByteCount;
  const contentEnd = contentStart + contentLen;
  if (contentEnd > end) return { ok: false, reason: 'truncated' };
  return { ok: true, header: { tag, contentStart, contentEnd } };
}

// ---------------------------------------------------------------------------
// Per-tag canonical-form checks (universal-class primitives only).
// ---------------------------------------------------------------------------

function checkInteger(buf: Uint8Array, start: number, len: number): boolean {
  if (len === 0) return false; // INTEGER must have ≥1 content byte
  if (len === 1) return true; // single byte (incl. 0x00) is always canonical
  const b0 = buf[start]!;
  const b1 = buf[start + 1]!;
  if (b0 === 0x00 && (b1 & 0x80) === 0) return false; // redundant zero pad
  if (b0 === 0xff && (b1 & 0x80) === 0x80) return false; // redundant sign-ext
  return true;
}

function checkBoolean(buf: Uint8Array, start: number, len: number): boolean {
  if (len !== 1) return false;
  const b = buf[start]!;
  return b === 0x00 || b === 0xff;
}

function checkBitString(buf: Uint8Array, start: number, len: number): boolean {
  if (len === 0) return false; // must have ≥1 byte (the unused-bits count)
  const unusedBits = buf[start]!;
  if (unusedBits > 7) return false;
  // Trailing-zero-bits rule: when unusedBits > 0 AND the value is non-empty,
  // the unused bits in the last byte must all be 0.
  if (unusedBits > 0 && len > 1) {
    const lastByte = buf[start + len - 1]!;
    const mask = (1 << unusedBits) - 1;
    if ((lastByte & mask) !== 0) return false;
  }
  return true;
}

function checkNull(_buf: Uint8Array, _start: number, len: number): boolean {
  return len === 0;
}

function checkOid(buf: Uint8Array, start: number, len: number): boolean {
  if (len === 0) return false;
  let i = start;
  const end = start + len;
  while (i < end) {
    const subStart = i;
    // First byte of any subidentifier must not be 0x80 — that would mean
    // the subidentifier started with a continuation byte encoding 0,
    // which is a redundant leading-zero pad in the base-128 encoding.
    if (buf[subStart] === 0x80) return false;
    while ((buf[i]! & 0x80) === 0x80) {
      i++;
      if (i >= end) return false; // truncated continuation
    }
    i++; // consume the terminating byte (high bit clear)
  }
  return i === end;
}

// ---------------------------------------------------------------------------
// SET-OF ordering check. Children walked + their byte ranges recorded;
// then bytewise lex sort verified.
// ---------------------------------------------------------------------------
function compareBytesLex(
  buf: Uint8Array,
  aStart: number,
  aLen: number,
  bStart: number,
  bLen: number,
): number {
  const minLen = aLen < bLen ? aLen : bLen;
  for (let i = 0; i < minLen; i++) {
    const av = buf[aStart + i]!;
    const bv = buf[bStart + i]!;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  // Shorter-as-prefix-of-longer compares as less.
  return aLen - bLen;
}

function checkSetOrdering(
  buf: Uint8Array,
  contentStart: number,
  contentEnd: number,
): boolean {
  // Walk the SET's children to collect their (start, totalLen) ranges.
  const ranges: Array<{ start: number; len: number }> = [];
  let off = contentStart;
  while (off < contentEnd) {
    const childStart = off;
    const hr = parseHeader(buf, off, contentEnd);
    if (!hr.ok) return false; // truncated child — caller already handles
    const childTotalLen = hr.header.contentEnd - childStart;
    ranges.push({ start: childStart, len: childTotalLen });
    off = hr.header.contentEnd;
  }
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1]!;
    const cur = ranges[i]!;
    if (compareBytesLex(buf, prev.start, prev.len, cur.start, cur.len) > 0) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Recursive walker. Iterates TLVs in [start, end); for each, validates
// header, applies per-tag canonical rules, recurses if constructed, and
// (for SET only) verifies child ordering. Returns first failure.
// ---------------------------------------------------------------------------
function walk(
  buf: Uint8Array,
  start: number,
  end: number,
  path: string,
): DerStrictResult {
  let offset = start;
  while (offset < end) {
    const hr = parseHeader(buf, offset, end);
    if (!hr.ok) return fail(hr.reason, offset, path);
    const { tag, contentStart, contentEnd } = hr.header;

    const childPath = path === '' ? tagName(tag) : `${path}.${tagName(tag)}`;
    const contentLen = contentEnd - contentStart;
    const cls = tag & 0xc0;
    const isUniversal = cls === 0;

    // Per-tag canonical checks (universal class primitives only).
    if (isUniversal) {
      switch (tag) {
        case TAG_INTEGER:
          if (!checkInteger(buf, contentStart, contentLen)) {
            return fail('non-canonical-integer', offset, path);
          }
          break;
        case TAG_BOOLEAN:
          if (!checkBoolean(buf, contentStart, contentLen)) {
            return fail('non-canonical-boolean', offset, path);
          }
          break;
        case TAG_BIT_STRING:
          if (!checkBitString(buf, contentStart, contentLen)) {
            return fail('non-canonical-bit-string', offset, path);
          }
          break;
        case TAG_NULL:
          if (!checkNull(buf, contentStart, contentLen)) {
            return fail('non-canonical-null', offset, path);
          }
          break;
        case TAG_OID:
          if (!checkOid(buf, contentStart, contentLen)) {
            return fail('non-canonical-oid', offset, path);
          }
          break;
      }
    }

    // Constructed types: recurse. The constructed bit (0x20) is set.
    if ((tag & 0x20) !== 0) {
      const inner = walk(buf, contentStart, contentEnd, childPath);
      if (!inner.ok) return inner;
      if (tag === TAG_SET) {
        if (!checkSetOrdering(buf, contentStart, contentEnd)) {
          return fail('non-canonical-set', offset, path);
        }
      }
    }

    offset = contentEnd;
  }
  return { ok: true };
}

/**
 * Validate that `bytes` is a strict-DER encoding of a single (or sequence of)
 * top-level TLV(s). For typical use the input is a single root TLV (e.g., a
 * cert's outer SEQUENCE or a CMS ContentInfo's outer SEQUENCE).
 *
 * Returns `{ ok: true }` on success or `{ ok: false, reason, offset, path }`
 * on the first canonical-form violation. `offset` is the byte index of the
 * failing TLV's tag; `path` is a dot-separated trail (`SEQUENCE.SET.OID`)
 * useful for logging which structure tripped the guard.
 */
export function isStrictDER(bytes: Uint8Array): DerStrictResult {
  return walk(bytes, 0, bytes.length, '');
}
