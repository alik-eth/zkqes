// V5 witness builder — entry barrel.
//
// As of Task 8 (this commit) the real witness builder lives under
// `./v5/` (vendored from arch-circuits f0d5a73 with browser patches —
// see `./v5/build-witness-v5.ts` header). Earlier versions of this
// module exposed a stub `buildV5Witness` + a different
// `BuildV5WitnessInput` shape; both were removed when the real impl
// landed since no consumer depended on them yet.

export {
  buildWitnessV5_2,
  type WitnessV5_2,
  type BuildWitnessV5_2Input,
} from './v5/index.js';

// V5.5 witness builder — algorithm-agnostic 21-signal output (the
// shape V7 consumes). Layered on `buildWitnessV5_2` (drops P-256
// limbs + leafSpkiCommit/intSpkiCommit, adds leafKeyCommit + raw
// SPKI slice). Spec:
//   docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md
export {
  buildWitnessV5_5,
  type WitnessV5_5,
  type BuildWitnessV5_5Input,
} from './v5_5/build-witness-v5_5.js';

export {
  buildWitnessV5,
  computeIdentityFingerprint,
  parseP7s,
  extractBindingOffsets,
  findTbsInCert,
  findSubjectSerial,
  pkCoordToLimbs,
  subjectSerialBytesToLimbs,
  decomposeTo643Limbs,
  parseP256Spki,
  spkiCommit,
  decodeEcdsaSigSequence,
  bytes32ToHex,
  MAX_BCANON,
  MAX_CERT,
  MAX_CTX,
  MAX_CTX_PADDED,
  MAX_LEAF_TBS,
  MAX_POLICY_ID,
  MAX_SA,
} from './v5/index.js';

export type {
  BuildWitnessV5Input,
  CmsExtraction,
  V2CoreBindingOffsets,
  WitnessV5,
  ParsedSpki,
  EcdsaRS,
} from './v5/index.js';
