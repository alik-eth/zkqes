/**
 * V5.4 — AgeProof calldata packing.
 *
 * Spec: `docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md` §6.
 * Orchestration: `docs/superpowers/plans/2026-05-05-zkqes-v5_4-orchestration.md` §1.3.
 *
 * The AgeDiiaUA circuit emits exactly three public signals, in this
 * FROZEN order (orchestration §1.3):
 *
 *   slot 0 → ageQualified    uint (0/1)
 *   slot 1 → ageCutoffDate   uint YYYYMMDD
 *   slot 2 → nullifierCtx    uint (= keccak256 reduced)
 *
 * On-chain `IZKQESRegistry::proveAge(...)` consumes the BN254-flavored
 * `(uint[2] a, uint[2][2] b, uint[2] c)` Solidity proof tuple plus the
 * three public signals. This module assembles the calldata struct that
 * `viem`'s `writeContract` posts.
 *
 * Reuses `Groth16Proof` + `packProof` from `core/index.ts` so the b-pair
 * coordinate swap (snarkjs `[real, imag]` → BN254 verifier `[imag, real]`)
 * is single-sourced — the V5.4 helper only adds the public-signal lift.
 */

import { packProof, type Groth16Proof, type SolidityProof } from '../core/index.js';

/**
 * Calldata shape posted by the web-side `proveAge` flow. Mirrors
 * `IZKQESRegistry.proveAge(uint[2], uint[2][2], uint[2], uint, uint, uint)`
 * argument order:
 *
 *   proveAge(a, b, c, ageQualified, ageCutoffDate, nullifierCtx)
 *
 * All publics are unsigned integers in the BN254 scalar range; the SDK
 * keeps them as `bigint` so consumers can pass directly to viem's
 * `encodeFunctionData` without intermediate string coercion.
 */
export interface AgeProofCalldata {
  readonly a: readonly [bigint, bigint];
  readonly b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  readonly c: readonly [bigint, bigint];
  readonly ageQualified: bigint;
  readonly ageCutoffDate: bigint;
  readonly nullifierCtx: bigint;
}

/**
 * Pack a snarkjs Groth16 proof plus the three V5.4 age public signals
 * into the on-chain calldata struct.
 *
 * The `publicSignals` array is the raw output of `snarkjs.groth16.fullProve`
 * (decimal strings or `bigint`s, in the §1.3 FROZEN slot order).
 *
 * Throws if the public-signal array length is not exactly 3 — V5.4
 * `proveAge` is keyed off this slot count and any deviation indicates a
 * cross-worker layout drift bug, NOT a recoverable input error.
 */
export function packAgeProof(
  snarkjsProof: Groth16Proof,
  publicSignals: readonly (string | bigint)[],
): AgeProofCalldata {
  if (publicSignals.length !== 3) {
    throw new Error(
      `packAgeProof: V5.4 AgeDiiaUA public-signal layout is FROZEN at 3 slots ` +
        `(ageQualified, ageCutoffDate, nullifierCtx); got ${publicSignals.length}. ` +
        `See orchestration §1.3.`,
    );
  }

  const sol: SolidityProof = packProof(snarkjsProof);

  return {
    a: [BigInt(sol.a[0]), BigInt(sol.a[1])] as const,
    b: [
      [BigInt(sol.b[0][0]), BigInt(sol.b[0][1])],
      [BigInt(sol.b[1][0]), BigInt(sol.b[1][1])],
    ] as const,
    c: [BigInt(sol.c[0]), BigInt(sol.c[1])] as const,
    ageQualified: BigInt(publicSignals[0]!),
    ageCutoffDate: BigInt(publicSignals[1]!),
    nullifierCtx: BigInt(publicSignals[2]!),
  };
}
