// ZkqesRegistry V5.4/V5.6 client-side types + register-calldata encoder.
//
// FROZEN 22-signal public-signal layout (spec ref:
// 2026-05-01-keccak-on-chain-amendment.md). The byte-identical proof
// shape is reused unchanged from V5.2 → V5.4 → V5.6, so this file
// keeps its historical name `registryV5_2.ts` while pointing at the
// active V5.4/V5.6 `zkqesRegistryUaAbi`. V5.6 dropped `rotateWallet`
// (unified into `register` repeat-claim → rebind); the encoder for
// it has been removed.
import { ZkqesError } from '../errors/index.js';

// ===========================================================================
// PublicSignalsV5_2 — 22-element struct. Order is FROZEN per spec
// §"Public-signal layout V5.1 → V5.2".
// ===========================================================================

export interface PublicSignalsV5_2 {
  readonly timestamp: bigint;
  readonly nullifier: bigint;
  readonly ctxHashHi: bigint;
  readonly ctxHashLo: bigint;
  readonly bindingHashHi: bigint;
  readonly bindingHashLo: bigint;
  readonly signedAttrsHashHi: bigint;
  readonly signedAttrsHashLo: bigint;
  readonly leafTbsHashHi: bigint;
  readonly leafTbsHashLo: bigint;
  readonly policyLeafHash: bigint;
  readonly leafSpkiCommit: bigint;
  readonly intSpkiCommit: bigint;
  readonly identityFingerprint: bigint;
  readonly identityCommitment: bigint;
  readonly rotationMode: bigint;
  readonly rotationOldCommitment: bigint;
  readonly rotationNewWallet: bigint;
  // V5.2 additions — slots 18-21 (FROZEN). Each is a 16-byte BE limb of
  // the binding's claimed wallet pk (the 64 bytes of pkBytes[1..65],
  // dropping the SEC1 0x04 prefix).
  readonly bindingPkXHi: bigint;
  readonly bindingPkXLo: bigint;
  readonly bindingPkYHi: bigint;
  readonly bindingPkYLo: bigint;
}

export const PUBLIC_SIGNALS_V5_2_LENGTH = 22;

/**
 * Pack PublicSignalsV5_2 into the 22-bigint array consumed by snarkjs
 * verifiers and the on-chain `uint256[22]` Groth16 input. Order MUST
 * match spec §"Public-signal layout V5.1 → V5.2" exactly. Verified by
 * registryV5_2.test.ts.
 */
export function publicSignalsV5_2ToArray(
  ps: PublicSignalsV5_2,
): readonly [
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  ] {
  return [
    ps.timestamp,
    ps.nullifier,
    ps.ctxHashHi,
    ps.ctxHashLo,
    ps.bindingHashHi,
    ps.bindingHashLo,
    ps.signedAttrsHashHi,
    ps.signedAttrsHashLo,
    ps.leafTbsHashHi,
    ps.leafTbsHashLo,
    ps.policyLeafHash,
    ps.leafSpkiCommit,
    ps.intSpkiCommit,
    ps.identityFingerprint,
    ps.identityCommitment,
    ps.rotationMode,
    ps.rotationOldCommitment,
    ps.rotationNewWallet,
    ps.bindingPkXHi,
    ps.bindingPkXLo,
    ps.bindingPkYHi,
    ps.bindingPkYLo,
  ] as const;
}

/**
 * Inverse: 22 decimal strings (snarkjs publicSignals output) → typed
 * struct. Throws when the array isn't exactly 22 long — protects against
 * drift in either the circuit's public-signal count or the call site's
 * slicing.
 */
export function publicSignalsV5_2FromArray(
  arr: readonly (string | bigint)[],
): PublicSignalsV5_2 {
  if (arr.length !== PUBLIC_SIGNALS_V5_2_LENGTH) {
    throw new ZkqesError('witness.fieldTooLong', {
      reason: 'public-signals-v5_2-length',
      got: arr.length,
      want: PUBLIC_SIGNALS_V5_2_LENGTH,
    });
  }
  const b = (i: number): bigint =>
    typeof arr[i] === 'bigint' ? (arr[i] as bigint) : BigInt(arr[i] as string);
  return {
    timestamp: b(0),
    nullifier: b(1),
    ctxHashHi: b(2),
    ctxHashLo: b(3),
    bindingHashHi: b(4),
    bindingHashLo: b(5),
    signedAttrsHashHi: b(6),
    signedAttrsHashLo: b(7),
    leafTbsHashHi: b(8),
    leafTbsHashLo: b(9),
    policyLeafHash: b(10),
    leafSpkiCommit: b(11),
    intSpkiCommit: b(12),
    identityFingerprint: b(13),
    identityCommitment: b(14),
    rotationMode: b(15),
    rotationOldCommitment: b(16),
    rotationNewWallet: b(17),
    bindingPkXHi: b(18),
    bindingPkXLo: b(19),
    bindingPkYHi: b(20),
    bindingPkYLo: b(21),
  };
}

// ===========================================================================
// Groth16Proof — same shape as V5.1 (no proof structure change).
// ===========================================================================

export interface Groth16ProofV5_2 {
  readonly a: readonly [bigint, bigint];
  readonly b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  readonly c: readonly [bigint, bigint];
}

// ===========================================================================
// RegisterArgsV5_2 — calldata shape for ZkqesRegistryV5_2.register()
//
// Same supporting-bytes payload as V5.1 (leafSpki, intSpki, signedAttrs,
// leafSig, intSig, trust + policy Merkle paths). Only the `sig` field's
// shape changes (22 fields instead of 19).
// ===========================================================================

export interface RegisterArgsV5_2 {
  readonly proof: Groth16ProofV5_2;
  readonly sig: PublicSignalsV5_2;
  readonly leafSpki: `0x${string}`;
  readonly intSpki: `0x${string}`;
  readonly signedAttrs: `0x${string}`;
  readonly leafSig: readonly [`0x${string}`, `0x${string}`];
  readonly intSig: readonly [`0x${string}`, `0x${string}`];
  readonly trustMerklePath: readonly [
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
  ];
  readonly trustMerklePathBits: bigint;
  readonly policyMerklePath: readonly [
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
  ];
  readonly policyMerklePathBits: bigint;
}

const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;
const SPKI_HEX_LEN = 2 + 91 * 2;
const U128_MAX = 1n << 128n;

/**
 * Boundary-check a RegisterArgsV5_2 before encoding. Same posture as
 * `assertRegisterArgsV5Shape` — soundness gates are the contract's job;
 * this just catches early shape drift.
 *
 * V5.2-specific addition: range-check the four `bindingPk*` limbs to
 * fit in 128 bits. The circuit's `Bits2Num(128)` constraint already
 * enforces this for proof validity; the SDK pre-check here protects
 * against a builder bug feeding the contract a >128-bit value (which
 * would also fail proof verification, but a shape error here surfaces
 * the bug pre-prove).
 */
export function assertRegisterArgsV5_2Shape(args: RegisterArgsV5_2): void {
  assertProofV5_2Shape(args.proof);
  assertPublicSignalsV5_2Shape(args.sig);
  assertSpki(args.leafSpki, 'leafSpki');
  assertSpki(args.intSpki, 'intSpki');
  if (!HEX_RE.test(args.signedAttrs)) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'signedAttrs-hex' });
  }
  assertBytes32Pair(args.leafSig, 'leafSig');
  assertBytes32Pair(args.intSig, 'intSig');
  assertBytes32Path(args.trustMerklePath, 'trustMerklePath');
  assertBytes32Path(args.policyMerklePath, 'policyMerklePath');
  assertU256(args.trustMerklePathBits, 'trustMerklePathBits');
  assertU256(args.policyMerklePathBits, 'policyMerklePathBits');
}

function assertProofV5_2Shape(p: Groth16ProofV5_2): void {
  if (p.a.length !== 2 || p.c.length !== 2) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'proof-v5_2-ac' });
  }
  if (p.b.length !== 2 || p.b[0]!.length !== 2 || p.b[1]!.length !== 2) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'proof-v5_2-b' });
  }
}

function assertPublicSignalsV5_2Shape(s: PublicSignalsV5_2): void {
  // timestamp ≤ 2^64 — sanity cap from contract docs.
  if (s.timestamp < 0n || s.timestamp >= 1n << 64n) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'timestamp-range' });
  }
  // bindingPk* limbs — Bits2Num(128). Range-check matches circuit.
  for (const [name, val] of [
    ['bindingPkXHi', s.bindingPkXHi],
    ['bindingPkXLo', s.bindingPkXLo],
    ['bindingPkYHi', s.bindingPkYHi],
    ['bindingPkYLo', s.bindingPkYLo],
  ] as const) {
    if (val < 0n || val >= U128_MAX) {
      throw new ZkqesError('witness.fieldTooLong', {
        reason: 'bindingPk-limb-range',
        field: name,
      });
    }
  }
  // All other fields are uint256.
  for (const v of publicSignalsV5_2ToArray(s)) assertU256(v, 'sig.field');
}

function assertSpki(hex: string, field: string): void {
  if (!HEX_RE.test(hex) || hex.length !== SPKI_HEX_LEN) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'spki-shape', field });
  }
}

function assertBytes32Pair(pair: readonly string[], field: string): void {
  if (pair.length !== 2 || !HEX32_RE.test(pair[0]!) || !HEX32_RE.test(pair[1]!)) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'bytes32-pair', field });
  }
}

function assertBytes32Path(path: readonly string[], field: string): void {
  if (path.length !== 16) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'merkle-path-depth', field });
  }
  for (let i = 0; i < 16; i++) {
    if (!HEX32_RE.test(path[i]!)) {
      throw new ZkqesError('witness.fieldTooLong', { reason: 'merkle-path-entry', field, i });
    }
  }
}

function assertU256(v: bigint, field: string): void {
  if (v < 0n || v >= 1n << 256n) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'uint256-range', field });
  }
}

// V5.6 unified-register changed the on-chain register() ABI from
// (proof, sig, ...) to (chainProof, leafProof, ...) where leafProof
// inlines a/b/c with the 22 public signals. Step4 builds the calldata
// inline via wagmi's writeContract (no SDK encoder), so the
// `encodeV5_2RegisterCalldata` helper that lived here pre-V5.6 has
// been removed. The shape-validators + array converters above remain
// the canonical pre-encode gate.

