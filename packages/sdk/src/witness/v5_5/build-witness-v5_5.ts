// V5.5 witness builder — multi-algorithm signature extension.
//
// Spec: docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md
//   §5  (parser-centric circuit boundary)
//   §6  (21-signal public layout)
//   §7  (circuit changes — drop P-256 limbs, add SPKI slice)
//   §8  (witness builder changes — this file)
//
// Strategy: layer on `buildWitnessV5_2` (V5.4 — 22 signals, P-256-specific).
//   - Drop the four P-256 affine-coord limb arrays (leafXLimbs, leafYLimbs,
//     intXLimbs, intYLimbs) — V5.5 circuit no longer declares them.
//   - Drop the two `*SpkiCommit` public signals (V5.4 slot [11]/[12]).
//   - Add `leafSpkiBytes` (padded to MAX_LEAF_SPKI=600), `leafSpkiLength`,
//     `leafSpkiOffsetInTbs` as private inputs — circuit asserts byte
//     equality between the witness slice and `leafTbsBytes[off..off+len]`.
//   - Add `leafKeyCommit` as the new public signal at slot [11]. Computed
//     via `keyCommit(spkiDer)` from `packages/sdk/src/witness/v5_5/key-commit.ts`
//     so circuit + contract + builder hash the same SPKI bytes byte-for-byte.
//   - Intermediate-key commitment is NOT emitted from the proof in V5.5.
//     The contract computes `KeyCommit.commitSpki(intSpki)` at register
//     time (Gate 5 trust-list Merkle membership). Drops the requirement
//     that the prover witness the int-SPKI parsing.
//
// Public-signal layout V5.5 (FROZEN per spec §6, 21 entries):
//
//   [0]  timestamp
//   [1]  nullifier
//   [2]  ctxHashHi
//   [3]  ctxHashLo
//   [4]  bindingHashHi
//   [5]  bindingHashLo
//   [6]  signedAttrsHashHi
//   [7]  signedAttrsHashLo
//   [8]  leafTbsHashHi
//   [9]  leafTbsHashLo
//   [10] policyLeafHash
//   [11] leafKeyCommit         ← V5.5 NEW (replaces leafSpkiCommit)
//   [12] identityFingerprint
//   [13] identityCommitment
//   [14] rotationMode
//   [15] rotationOldCommitment
//   [16] rotationNewWallet
//   [17] bindingPkXHi
//   [18] bindingPkXLo
//   [19] bindingPkYHi
//   [20] bindingPkYLo
//
// V5.4 slot 12 (intSpkiCommit) is gone. All higher slots shift down by 1.
// V5.5 verifier ABI: `verifyProof(uint[21])`.

import { buildWitnessV5_2, type BuildWitnessV5_2Input } from '../v5/build-witness-v5_2';
import { findLeafSpkiInTbs, findTbsInCert } from '../v5/leaf-cert-walk';
import { keyCommit, MAX_LEAF_SPKI } from './key-commit';

/**
 * V5.5 witness — V5.4 minus P-256-specific fields, plus generic
 * SPKI slice + keyCommit.
 *
 * snarkjs witness JSON contract: every property name MUST exactly
 * match a `signal input` declaration in `ZkqesPresentationV5_5.circom`.
 * Drift triggers "Signal X not found" or "Too many values" errors at
 * witness-calc time. The 21-public-signal layout is asserted at
 * verifyProof time by the on-chain Groth16 verifier.
 */
export interface WitnessV5_5 {
  // ----- public signals (in slot order, 21 total) -----
  timestamp: string;
  nullifier: string;
  ctxHashHi: string;
  ctxHashLo: string;
  bindingHashHi: string;
  bindingHashLo: string;
  signedAttrsHashHi: string;
  signedAttrsHashLo: string;
  leafTbsHashHi: string;
  leafTbsHashLo: string;
  policyLeafHash: string;
  leafKeyCommit: string;
  identityFingerprint: string;
  identityCommitment: string;
  rotationMode: string;
  rotationOldCommitment: string;
  rotationNewWallet: string;
  bindingPkXHi: string;
  bindingPkXLo: string;
  bindingPkYHi: string;
  bindingPkYLo: string;
  // ----- private inputs (subset; full list mirrors V5.4 minus the
  //       four P-256 limb arrays plus the three SPKI slice fields) -----
  leafSpkiBytes: number[];      // padded to MAX_LEAF_SPKI
  leafSpkiLength: string;
  leafSpkiOffsetInTbs: string;
  // V5.4 inherited private inputs flow through unchanged via the
  // `...rest` spread at build time. They include bindingBytes,
  // signedAttrs, leafTbsBytes, identity-extraction offsets, the V5.3
  // OID anchor, etc. Type intentionally loose ([key: string]) below to
  // avoid duplicating the V5.4 type surface.
  [key: string]: string | number[] | unknown;
}

/** V5.5 builder input. Identical shape to V5.4 — divergence is on
 *  the OUTPUT side (witness JSON layout), not on the input artifacts. */
export type BuildWitnessV5_5Input = BuildWitnessV5_2Input;

/**
 * Build a V5.5 witness from pre-extracted CMS + fixture artifacts.
 *
 * Implementation strategy: delegate to `buildWitnessV5_2` for the
 * shared computation (binding parse, SHA chains, identity extraction,
 * wallet pk packing, V5.3 OID anchor), then reshape:
 *   1. Strip the four P-256-specific limb arrays + leafSpkiCommit +
 *      intSpkiCommit fields.
 *   2. Walk leafTbsBytes to locate the leaf SPKI sub-DER.
 *   3. Compute leafKeyCommit via the shared TS reference.
 *   4. Emit leafSpkiBytes (padded), leafSpkiLength, leafSpkiOffsetInTbs
 *      as private inputs.
 *
 * Pre-V5.5 stub artifacts (qkb-v5_2-stub.zkey etc.) cannot consume
 * V5.5 witnesses — they declare a different signal set. Caller must
 * pump the V5.5 stub from circuits-eng before round-tripping.
 */
export async function buildWitnessV5_5(
  input: BuildWitnessV5_5Input,
): Promise<WitnessV5_5> {
  // 1. V5.4 witness (22 signals, P-256-specific).
  const v54 = await buildWitnessV5_2(input);

  // 2. Locate leaf SPKI inside leafTbsBytes (TBS-relative offset).
  //
  // Note: we pass the LEAF CERT here, not pre-extracted leafTbsBytes,
  // because the walker computes TBS-internal offsets and the
  // V5.4-emitted leafTbsBytes is already the inner SEQUENCE content
  // (no outer SEQUENCE tag). Re-extract to keep alignment unambiguous.
  const tbsRange = findTbsInCert(input.leafCertDer);
  const tbsBuf = input.leafCertDer.subarray(
    tbsRange.offset,
    tbsRange.offset + tbsRange.length,
  );
  const spkiRange = findLeafSpkiInTbs(tbsBuf);
  if (spkiRange.length > MAX_LEAF_SPKI) {
    throw new Error(
      `V5.5 witness: leafSpki length ${spkiRange.length} exceeds MAX_LEAF_SPKI ` +
        `${MAX_LEAF_SPKI}. Update spec §5.3 sizing if a real QTSP issues ` +
        `larger SPKIs (e.g. RSA-8192 ~ 1100 bytes).`,
    );
  }

  // 3. Extract canonical SPKI bytes + compute keyCommit.
  const spkiBytes = tbsBuf.subarray(spkiRange.offset, spkiRange.offset + spkiRange.length);
  const spkiBytesU8 = new Uint8Array(spkiBytes);
  const keyCommitVal = await keyCommit(spkiBytesU8);

  // 4. Pad spkiBytes to MAX_LEAF_SPKI for the circuit's fixed-length
  //    `signal input bytes[MAX_LEAF_SPKI]`. Tail bytes set to 0.
  //    The KeyCommitVar template ignores tail bytes via the
  //    activeByte mask, but they MUST be in-range (0..255) to satisfy
  //    the byte-range constraint check inside SHA gates that consume
  //    leafTbsBytes adjacent to this slice.
  const paddedSpki = new Array<number>(MAX_LEAF_SPKI).fill(0);
  for (let i = 0; i < spkiBytes.length; i++) paddedSpki[i] = spkiBytes[i]!;

  // 5. Reshape: drop V5.4-only fields, add V5.5-only fields.
  //
  // V5.4 fields removed (per spec §7.2):
  //   leafXLimbs[6], leafYLimbs[6], intXLimbs[6], intYLimbs[6] —
  //     P-256 affine-coord limbs (private inputs to V5.4 SpkiCommit).
  //   leafSpkiCommit, intSpkiCommit — public signals at slots [11]/[12].
  const {
    // P-256 limbs (private inputs)
    leafXLimbs: _lx,
    leafYLimbs: _ly,
    intXLimbs: _ix,
    intYLimbs: _iy,
    // V5.4 public signals replaced/dropped
    leafSpkiCommit: _lsc,
    intSpkiCommit: _isc,
    ...rest
  } = v54 as Record<string, unknown>;
  void _lx; void _ly; void _ix; void _iy; void _lsc; void _isc;

  return {
    ...(rest as Record<string, unknown>),
    leafKeyCommit: keyCommitVal.toString(),
    leafSpkiBytes: paddedSpki,
    leafSpkiLength: spkiRange.length.toString(),
    leafSpkiOffsetInTbs: spkiRange.offset.toString(),
  } as WitnessV5_5;
}
