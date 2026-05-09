// ZkqesRegistry V7 client-side types + register-calldata pre-encode shape.
//
// V7 = V5.5 wire format (21-signal Groth16, KeyCommit leaves, HostSig
// dispatch, variable-length `bytes` signature calldata) + V5.6 features
// (unified register, registerWithAge). Spec:
//   docs/superpowers/specs/2026-05-09-v7-merged-amendment.md
//
// Frozen 21-signal public-signal layout (spec §3.1):
//   slot [11] = leafKeyCommit  (V5.5 — replaces V5.4 leafSpkiCommit)
//   V5.4 slot [12] (intSpkiCommit) is DROPPED — registry recomputes
//   `KeyCommit(intSpki)` on-chain at Gate 4. All slots after the dropped
//   one renumber down by −1 → 21 publics total.
import { ZkqesError } from '../errors/index.js';

// ===========================================================================
// PublicSignalsV7 — 21-element struct. Order is FROZEN per V7 spec §3.1.
// ===========================================================================

export interface PublicSignalsV7 {
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
  /** V5.5 — algorithm-agnostic SPKI commitment (slot 11). */
  readonly leafKeyCommit: bigint;
  readonly identityFingerprint: bigint;
  readonly identityCommitment: bigint;
  readonly rotationMode: bigint;
  readonly rotationOldCommitment: bigint;
  readonly rotationNewWallet: bigint;
  // bindingPk* limbs — 16-byte BE limbs of the binding's claimed wallet pk
  // (the 64 bytes of pkBytes[1..65], dropping the SEC1 0x04 prefix).
  readonly bindingPkXHi: bigint;
  readonly bindingPkXLo: bigint;
  readonly bindingPkYHi: bigint;
  readonly bindingPkYLo: bigint;
}

export const PUBLIC_SIGNALS_V7_LENGTH = 21;

/**
 * Pack PublicSignalsV7 into the 21-bigint array consumed by snarkjs
 * verifiers and the on-chain `uint256[21]` Groth16 input. Order MUST
 * match V7 spec §3.1 exactly.
 */
export function publicSignalsV7ToArray(
  ps: PublicSignalsV7,
): readonly [
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
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
    ps.leafKeyCommit,
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
 * Inverse: 21 decimal strings (snarkjs publicSignals output) → typed
 * struct. Throws when the array isn't exactly 21 long — protects against
 * drift in either the circuit's public-signal count or the call site's
 * slicing.
 */
export function publicSignalsV7FromArray(
  arr: readonly (string | bigint)[],
): PublicSignalsV7 {
  if (arr.length !== PUBLIC_SIGNALS_V7_LENGTH) {
    throw new ZkqesError('witness.fieldTooLong', {
      reason: 'public-signals-v7-length',
      got: arr.length,
      want: PUBLIC_SIGNALS_V7_LENGTH,
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
    leafKeyCommit: b(11),
    identityFingerprint: b(12),
    identityCommitment: b(13),
    rotationMode: b(14),
    rotationOldCommitment: b(15),
    rotationNewWallet: b(16),
    bindingPkXHi: b(17),
    bindingPkXLo: b(18),
    bindingPkYHi: b(19),
    bindingPkYLo: b(20),
  };
}

// ===========================================================================
// Groth16Proof — same shape across V5.x → V7 (no proof structure change).
// ===========================================================================

export interface Groth16ProofV7 {
  readonly a: readonly [bigint, bigint];
  readonly b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  readonly c: readonly [bigint, bigint];
}

// ===========================================================================
// RegisterArgsV7 — calldata shape for ZKQESRegistryUA.register() (V7).
//
// V7 deltas vs V5.4/V5.6 RegisterArgsV5_2:
//   * `leafSig` / `intSig` widen from `bytes32[2]` to variable-length
//     `bytes` (V5.5 enables RSA-2048+ ranges).
//   * Public signals struct is 21-wide (`leafKeyCommit`; no `intSpkiCommit`).
// ===========================================================================

export interface RegisterArgsV7 {
  readonly proof: Groth16ProofV7;
  readonly sig: PublicSignalsV7;
  readonly leafSpki: `0x${string}`;
  readonly intSpki: `0x${string}`;
  readonly signedAttrs: `0x${string}`;
  /** Variable length: P-256 64 B, RSA-2048 256 B, RSA-4096 512 B. */
  readonly leafSig: `0x${string}`;
  readonly intSig: `0x${string}`;
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
 * Boundary-check a RegisterArgsV7 before encoding. Soundness gates are
 * the contract's job; this just catches early shape drift.
 *
 * Range-checks the four `bindingPk*` limbs to fit in 128 bits (mirrors
 * the circuit's `Bits2Num(128)` constraint).
 */
export function assertRegisterArgsV7Shape(args: RegisterArgsV7): void {
  assertProofV7Shape(args.proof);
  assertPublicSignalsV7Shape(args.sig);
  assertSpki(args.leafSpki, 'leafSpki');
  assertSpki(args.intSpki, 'intSpki');
  if (!HEX_RE.test(args.signedAttrs)) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'signedAttrs-hex' });
  }
  assertVarBytes(args.leafSig, 'leafSig');
  assertVarBytes(args.intSig, 'intSig');
  assertBytes32Path(args.trustMerklePath, 'trustMerklePath');
  assertBytes32Path(args.policyMerklePath, 'policyMerklePath');
  assertU256(args.trustMerklePathBits, 'trustMerklePathBits');
  assertU256(args.policyMerklePathBits, 'policyMerklePathBits');
}

function assertProofV7Shape(p: Groth16ProofV7): void {
  if (p.a.length !== 2 || p.c.length !== 2) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'proof-v7-ac' });
  }
  if (p.b.length !== 2 || p.b[0]!.length !== 2 || p.b[1]!.length !== 2) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'proof-v7-b' });
  }
}

function assertPublicSignalsV7Shape(s: PublicSignalsV7): void {
  if (s.timestamp < 0n || s.timestamp >= 1n << 64n) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'timestamp-range' });
  }
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
  for (const v of publicSignalsV7ToArray(s)) assertU256(v, 'sig.field');
}

function assertSpki(hex: string, field: string): void {
  if (!HEX_RE.test(hex) || hex.length !== SPKI_HEX_LEN) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'spki-shape', field });
  }
}

function assertVarBytes(hex: string, field: string): void {
  if (!HEX_RE.test(hex) || (hex.length & 1) !== 0) {
    throw new ZkqesError('witness.fieldTooLong', { reason: 'var-bytes-shape', field });
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

// V7 register() takes a single `RegisterCall` struct argument. Step4
// builds the calldata inline via wagmi's writeContract (no SDK encoder),
// so this file exposes only the shape-validators + array converters as
// the canonical pre-encode gate.
