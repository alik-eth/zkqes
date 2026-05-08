// V5.5 KeyCommit — algorithm-agnostic SPKI commitment.
//
// Spec: docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md
//   §5.3 (generic commitment surface)
//   §7.4 (Circom KeyCommitVar primitive)
//   §9.2 (Solidity KeyCommit library)
//
// Construction (frozen):
//
//   keyCommit = Poseidon2( KEY_COMMIT_DOMAIN,
//                          PoseidonChunkHashVarT7(spkiDerBytes) )
//
// Three byte-identical implementations MUST exist:
//   - this file (TS reference + parity fixture generator)
//   - packages/circuits/circuits/primitives/KeyCommitVar.circom
//   - packages/contracts/src/libs/KeyCommit.sol
//
// Drift between any two breaks the V5.5 trust-list / proof equality
// invariant (spec §12 invariants 5+6).
//
// ---------------------------------------------------------------------
// Why a NEW chunk-hash variant (T7 instead of V5.4's T16)?
//
// V5.4's `PoseidonChunkHashVar` uses RATE=15 (Poseidon-T16 per round).
// Solidity has hashT7 deployed via PoseidonBytecode but does NOT have
// hashT16 — adding T16 means deploying a new opaque bytecode contract
// + extending the reproducibility-check gate. Avoidable.
//
// T7 (RATE=5, CAPACITY=1) uses Poseidon-6 per round. Solidity already
// owns `hashT7` (arity 6→1), so on-chain KeyCommit is `hashT7` in a
// loop with bounded round count.
//
// V5.4's V4 chunk-hash stays untouched (still used by
// canonicalizeCertHash / nullifier derivation). V5.5 introduces a
// PARALLEL primitive — additive, not breaking.
//
// Sponge sizing for V5.5:
//   RATE = 5          (5 field elements absorbed per round)
//   CHUNK = 31        (bytes per field element; matches V5.4)
//   MAX_LEAF_SPKI = 600 bytes  (covers RSA-4096 SPKI ~ 550 bytes)
//   N_CHUNKS_MAX = ⌈600 / 31⌉ = 20
//   N_FE_MAX     = N_CHUNKS_MAX + 1 = 21  (chunks ‖ length)
//   N_ROUNDS_MAX = ⌈21 / 5⌉ = 5
//
// In practice:
//   - P-256 named-curve SPKI (91 bytes) → 4 fe → 1 round
//   - RSA-2048 SPKI (~294 bytes) → 11 fe → 3 rounds
//   - RSA-3072 SPKI (~414 bytes) → 15 fe → 3 rounds
//   - RSA-4096 SPKI (~550 bytes) → 19 fe → 4 rounds
//
// MAX_ROUNDS=5 leaves headroom for SPKIs up to 620 bytes.
//
// ---------------------------------------------------------------------
// KEY_COMMIT_DOMAIN derivation:
//
//   KEY_COMMIT_DOMAIN = bigint( keccak256(utf8("zkqes-key-commit-v1")) )
//                          mod p_bn254
//
// Convention: human-readable ProtocolBytes literal hashed via keccak,
// reduced mod p_bn254 to land in field. Matches the V5.1 wallet-secret
// domain pattern + V5.4 nullifierCtx pattern. The string
// "zkqes-key-commit-v1" is a frozen ProtocolBytes literal; never
// renamed (per CLAUDE.md ProtocolBytes invariant).

import { keccak_256 } from '@noble/hashes/sha3';
import { buildPoseidon } from 'circomlibjs';

interface Poseidon {
  F: { e: (v: bigint) => unknown; toObject: (v: unknown) => bigint };
  (inputs: unknown[]): unknown;
}

let poseidonP: Promise<Poseidon> | null = null;
function getPoseidon(): Promise<Poseidon> {
  poseidonP ??= buildPoseidon() as unknown as Promise<Poseidon>;
  return poseidonP;
}

// BN254 scalar field prime (Poseidon's domain).
const P_BN254 = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const KEY_COMMIT_DOMAIN_LITERAL = 'zkqes-key-commit-v1';

/**
 * Frozen field constant for KeyCommit domain separation. Equal to
 * `keccak256("zkqes-key-commit-v1") mod p_bn254`.
 *
 * The Solidity KeyCommit library and Circom KeyCommitVar template MUST
 * embed the same bigint value. The fixture file
 * `fixtures/v5_5/key-commit-parity.json` carries the canonical decimal
 * string for cross-language pinning.
 */
export const KEY_COMMIT_DOMAIN: bigint = (() => {
  const digest = keccak_256(new TextEncoder().encode(KEY_COMMIT_DOMAIN_LITERAL));
  let v = 0n;
  for (const b of digest) v = (v << 8n) | BigInt(b);
  return v % P_BN254;
})();

const CHUNK = 31;
const RATE = 5;
export const MAX_LEAF_SPKI = 600;

/**
 * V5.5 chunk-hash variant. Sponge-T7 (RATE=5, CAPACITY=1).
 *
 * Returns the field-domain Poseidon hash of `data`'s byte sequence,
 * using the chunk packing convention shared with V5.4 (big-endian,
 * 31 bytes per chunk, last chunk packed at natural magnitude with no
 * right-padding, length appended as final field element).
 *
 * `data.length` must be ≤ MAX_LEAF_SPKI; throws otherwise.
 */
export async function poseidonChunkHashVarT7(data: Uint8Array): Promise<bigint> {
  if (data.length > MAX_LEAF_SPKI) {
    throw new Error(
      `poseidonChunkHashVarT7: input length ${data.length} exceeds MAX_LEAF_SPKI ${MAX_LEAF_SPKI}`,
    );
  }
  const p = await getPoseidon();
  const F = p.F;
  const chunks: bigint[] = [];
  for (let i = 0; i < data.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, data.length);
    let v = 0n;
    for (let j = i; j < end; j++) v = (v << 8n) | BigInt(data[j]!);
    chunks.push(v);
  }
  chunks.push(BigInt(data.length));
  let state: unknown = F.e(0n);
  for (let i = 0; i < chunks.length; i += RATE) {
    const window: unknown[] = new Array(RATE + 1);
    window[0] = state;
    for (let j = 0; j < RATE; j++) {
      const c = chunks[i + j];
      window[j + 1] = F.e(c === undefined ? 0n : c);
    }
    state = p(window);
  }
  return F.toObject(state);
}

/**
 * V5.5 KeyCommit — algorithm-agnostic SPKI commitment.
 *
 * `keyCommit = Poseidon2(KEY_COMMIT_DOMAIN, PoseidonChunkHashVarT7(spkiDer))`.
 *
 * Argument is canonical DER bytes of a `SubjectPublicKeyInfo` structure
 * (RFC 5280 §4.1.2.7). Algorithm is determined by the caller by parsing
 * the SPKI's `algorithm.algorithm` OID; this function commits the bytes
 * verbatim and is intentionally algorithm-blind.
 */
export async function keyCommit(spkiDer: Uint8Array): Promise<bigint> {
  const p = await getPoseidon();
  const F = p.F;
  const inner = await poseidonChunkHashVarT7(spkiDer);
  const out = p([F.e(KEY_COMMIT_DOMAIN), F.e(inner)]);
  return F.toObject(out);
}
