/**
 * V5.4 — `buildAgeWitness`.
 *
 * Spec: `docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md` §6.1.
 * Orchestration: `docs/superpowers/plans/2026-05-05-zkqes-v5_4-orchestration.md` §1.3, §1.4, §1.6.
 *
 * Assembles the snarkjs witness JSON for the `AgeDiiaUA` circuit and
 * computes the off-circuit `ageQualified` answer that the on-chain
 * `IZKQESRegistry::proveAge(...)` will re-derive in zero knowledge.
 *
 * Cross-worker invariants honored here:
 *
 *   §1.3 — Public-signal layout FROZEN at 3 slots, in order:
 *     0 ageQualified, 1 ageCutoffDate, 2 nullifierCtx.
 *
 *   §1.4 — `nullifierCtx = keccak256(abi.encodePacked("zkqes-age-ctx-v1",
 *          bindingId, ageCutoffDate))`. The `"zkqes-age-ctx-v1"` literal
 *          is a frozen ProtocolBytes string, NEVER renamed.
 *
 *   §1.6 — `nullifierCtxKeccak` is **passed in by the consumer**, NOT
 *          derived inside the witness builder. Keeps the keccak primitive
 *          consistent across web (UI), contracts (verification), and
 *          circuits (witness). This module receives it pre-computed.
 *
 * Diia-UA-specific extraction: walks the leaf certificate's
 * SubjectDirectoryAttributes (OID 2.5.29.9) to find the Diia DOB
 * AttributeTypeAndValue (OID 1.2.804.2.1.1.1.11.1.4.11.1) and decodes
 * the first 8 ASCII PrintableString digits as YYYYMMDD. The byte-level
 * scanner mirrors the AgeDiiaUA circuit's M2.3b extractor template; SDK
 * and circuit MUST stay in lock-step. See the JSDoc on
 * `extractDobFromDiiaUA` in `src/dob/index.ts` for the byte sequence
 * pinning.
 */

// `Buffer` is referenced only in the type position of
// `BuildAgeWitnessArgs.signedCades`. A value import of `'buffer'` would
// trigger `vite-plugin-node-polyfills` to rewrite the path to
// `vite-plugin-node-polyfills/shims/buffer`, which under strict-pnpm
// fails to resolve from @zkqes/sdk's compiled JS (the plugin is a dep
// of @zkqes/web, not @zkqes/sdk). A pure `import type` is stripped by
// TS at compile time so the runtime bundle never sees it. Internally
// the function works with `Uint8Array` (Buffer is a Uint8Array
// subclass; structurally compatible).
import type { Buffer } from 'buffer';

import { extractDobFromDiiaUA } from '../../dob/index.js';
import { ZkqesError } from '../../errors/index.js';
import { parseP7s } from '../v5/parse-p7s.js';

/**
 * Inputs to the V5.4 age-witness builder.
 *
 * - `signedCades` — the user's CAdES-BES `.p7s` envelope (same input
 *   shape the V5.x identity flow consumes).
 * - `bindingId` — 32-byte hex of the existing binding's commit (returned
 *   by `IZKQESRegistry::getBinding`); used by the consumer to derive
 *   `nullifierCtxKeccak`.
 * - `ageCutoffDate` — YYYYMMDD integer the consumer wants to prove
 *   the holder's DOB is on-or-before (typically `today − 18y`).
 * - `nullifierCtxKeccak` — the consumer-computed §1.4 keccak. SDK does
 *   NOT derive this; passed in to keep three-site keccak consistency.
 */
export interface BuildAgeWitnessArgs {
  readonly signedCades: Buffer;
  readonly bindingId: `0x${string}`;
  readonly ageCutoffDate: number;
  readonly nullifierCtxKeccak: `0x${string}`;
}

/**
 * Public-signal triple emitted by the AgeDiiaUA circuit (§1.3 FROZEN
 * slot order). The witness builder mirrors them off-circuit so the
 * caller can:
 *   - render `ageQualified` in the UI before posting to chain
 *   - derive the calldata struct via `packAgeProof` (cert/age-proof.ts)
 */
export interface AgePublicSignals {
  readonly ageQualified: 0 | 1;
  readonly ageCutoffDate: number;
  /** Decimal-string form (matches snarkjs public-signal serialization). */
  readonly nullifierCtx: string;
}

/**
 * Output of the V5.4 age-witness builder.
 *
 * - `witness` — the snarkjs witness JSON (Record<string, ...>) the
 *   in-Worker prover consumes. The shape's frozen field names track
 *   the AgeDiiaUA circuit's `signal input` declarations; circuits-eng
 *   ships the .circom in parallel and may extend the witness in-flight
 *   (additive only — frozen names stay).
 * - `publicSignals` — typed off-circuit mirror of the circuit publics,
 *   in the §1.3 slot order.
 * - `dobYmd` — the YYYYMMDD value extracted from the leaf cert. Surfaced
 *   to support pre-flight UX (e.g., "ineligible" copy when the user's
 *   DOB is post-cutoff) without re-parsing the cert at the UI layer.
 */
export interface BuildAgeWitnessOutput {
  readonly witness: Record<string, string | number | readonly number[]>;
  readonly publicSignals: AgePublicSignals;
  readonly dobYmd: number;
}

export async function buildAgeWitness(
  args: BuildAgeWitnessArgs,
): Promise<BuildAgeWitnessOutput> {
  // Step 1 — extract the leaf cert from the CAdES envelope. parseP7s
  // throws on structurally-broken input; we let that propagate (the
  // UI will surface a generic "QES envelope rejected" error).
  const cms = parseP7s(args.signedCades);

  // Step 2 — Diia-UA DOB extraction. The byte-level scanner expects
  // the leaf cert DER (NOT signedAttrs); subjectDirectoryAttributes
  // lives in the leaf cert's TBS extensions.
  const extraction = extractDobFromDiiaUA(new Uint8Array(cms.leafCertDer));
  if (!extraction.supported) {
    throw new ZkqesError('binding.field', {
      field: 'dobYmd',
      reason: 'diia-ua-extraction-failed',
      raw: 'leaf cert lacks the Diia SubjectDirectoryAttributes DOB frame',
    });
  }

  // Step 3 — off-circuit ageQualified. Mirrors the AgeDiiaUA circuit's
  // comparator; the on-chain verifier re-validates this in zero
  // knowledge against the same witness inputs, but having it
  // off-circuit lets the UI render "eligible / ineligible" pre-tx
  // without round-tripping a proof.
  const ageQualified: 0 | 1 = extraction.ymd <= args.ageCutoffDate ? 1 : 0;

  // Step 4 — assemble the witness. Field names track the AgeDiiaUA
  // circuit's `signal input` declarations as of the spec; circuits-eng
  // may extend additively (Phase A is skeleton — Phase C swaps in the
  // real .r1cs and any field-rename will be cross-broadcast first).
  const witness: Record<string, string | number | readonly number[]> = {
    leafCertBytes: Array.from(new Uint8Array(cms.leafCertDer)),
    sdaFrameOffsetInTbs: extraction.sdaFrameOffsetInTbs,
    ageCutoffDateIn: args.ageCutoffDate,
    nullifierCtxInput: BigInt(args.nullifierCtxKeccak).toString(),
  };

  return {
    witness,
    publicSignals: {
      ageQualified,
      ageCutoffDate: args.ageCutoffDate,
      nullifierCtx: BigInt(args.nullifierCtxKeccak).toString(),
    },
    dobYmd: extraction.ymd,
  };
}
