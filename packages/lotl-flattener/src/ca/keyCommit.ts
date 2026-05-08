// V5.5 KeyCommit — algorithm-agnostic SPKI commitment for the
// flattener's trust-list Merkle leaves.
//
// Mirrors `packages/sdk/src/witness/v5_5/key-commit.ts` byte-for-byte.
// Three implementations MUST stay in lockstep:
//   - this file (flattener-side reference)
//   - packages/sdk/src/witness/v5_5/key-commit.ts (witness builder)
//   - packages/circuits/circuits/primitives/KeyCommitVar.circom
//   - packages/contracts/src/libs/KeyCommit.sol
// Drift between any two breaks the V5.5 trust-list / proof equality
// invariant (spec §12 invariants 5+6).
//
// Construction (frozen):
//   keyCommit = Poseidon2( KEY_COMMIT_DOMAIN,
//                          PoseidonChunkHashVarT7(spkiDerBytes) )
//
// Sponge sizing matches the SDK: RATE=5, CHUNK=31, MAX_LEAF_SPKI=600.
// Parity asserted against `fixtures/v5_5/key-commit-parity.json` in
// `tests/ca/keyCommit.test.ts`.

import { buildPoseidon } from 'circomlibjs';

interface PoseidonHasher {
  F: { e: (v: bigint) => unknown; toObject: (v: unknown) => bigint };
  (inputs: unknown[]): unknown;
}

let poseidonInstance: PoseidonHasher | null = null;
async function getPoseidon(): Promise<PoseidonHasher> {
  if (poseidonInstance === null) {
    poseidonInstance = (await buildPoseidon()) as unknown as PoseidonHasher;
  }
  return poseidonInstance;
}

/**
 * Frozen field constant for KeyCommit domain separation. Computed
 * elsewhere as `keccak256("zkqes-key-commit-v1") mod p_bn254`; hardcoded
 * here to keep the flattener's dep surface minimal (no @noble/hashes
 * pull-in needed for what is a single compile-time constant).
 *
 * The Solidity KeyCommit library, Circom KeyCommitVar template, and SDK
 * keyCommit reference all embed the same bigint. Equivalence is asserted
 * against `fixtures/v5_5/key-commit-parity.json#domainConstant` in the
 * keyCommit.test.ts parity gate — any drift fails CI before reaching a
 * trust-list rebuild.
 */
export const KEY_COMMIT_DOMAIN =
  18645781269818968495274020647839177040876380151358417993861915365514852958754n;

const CHUNK = 31;
const RATE = 5;
export const MAX_LEAF_SPKI = 600;

/**
 * V5.5 chunk-hash variant. Sponge-T7 (RATE=5, CAPACITY=1).
 *
 * Returns the Poseidon hash of `data`'s byte sequence using the chunk
 * packing convention shared with V5.4 (big-endian, 31 bytes per chunk,
 * last chunk packed at natural magnitude with no right-padding, length
 * appended as final field element).
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
 * Argument is canonical DER bytes of a SubjectPublicKeyInfo structure
 * (RFC 5280 §4.1.2.7). Algorithm is determined by the caller by parsing
 * the SPKI's algorithm OID; this function commits the bytes verbatim
 * and is intentionally algorithm-blind. Supports P-256, RSA-2048
 * through RSA-4096, and any other algorithm whose canonical SPKI fits
 * within MAX_LEAF_SPKI bytes.
 */
export async function keyCommit(spkiDer: Uint8Array): Promise<bigint> {
  const p = await getPoseidon();
  const F = p.F;
  const inner = await poseidonChunkHashVarT7(spkiDer);
  const out = p([F.e(KEY_COMMIT_DOMAIN), F.e(inner)]);
  return F.toObject(out);
}
