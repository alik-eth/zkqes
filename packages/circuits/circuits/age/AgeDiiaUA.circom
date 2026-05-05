pragma circom 2.1.9;

include "../dob/DobExtractorDiiaUA.circom";
include "AgeQualifyParameterized.circom";
include "NullifierCtxAge.circom";

// AgeDiiaUA — Tier-2 age-qualification circuit for V5.4 per-country
// registry pattern (UA only in V5.4 scope; the per-country contract
// `ZKQESRegistryUA` wires this circuit's verifier as
// `Groth16AgeVerifierUA.sol`).
//
// Public-signal layout (FROZEN by orchestration §1.3):
//
//   slot 0: ageQualified   uint (0/1)        — 1 iff dobYmd <= ageCutoffDate
//   slot 1: ageCutoffDate  uint (YYYYMMDD)   — policy-bound cutoff
//   slot 2: nullifierCtx   uint              — V5.1 anti-replay context
//
// `Groth16AgeVerifierUA.sol`'s public-input array MUST match this slot
// ordering byte-for-byte. Drift across slots silently breaks calldata
// integration with `ZKQESRegistryUA.proveAge`.
//
// V5.10 isomorphism pattern (per packages/circuits/CLAUDE.md invariant
// #8): snarkjs orders public.json as [outputs..., public_inputs...],
// not by declaration order. To pin the FROZEN slot order under the
// `component main { public [...] }` shape, the three public signals
// MUST be declared as `signal input` (not `signal output`) — the
// circuit then constrains each to its computed value via internal
// equality. A `signal output` would land in public.json BEFORE the
// public_inputs in canonical snarkjs order, breaking the slot
// alignment with the verifier.
//
// Private-witness layout (spec §4.1, amended per option-A T3 dispatch):
//
//   leafTbsBytes[MAX_DER]     leaf cert TBS sub-DER bytes, right-padded with 0
//   leafTbsLen                actual content length (≤ MAX_DER)
//   nullifierCtxInput         off-circuit-derived keccak (orchestration §1.4)
//
// Note on spec §4.1 doc-fix: the spec's private-witness table named
// `signedAttrsBytes` + `sdaFrameOffset`, sketched ahead of audit. The
// existing `DobExtractor(MAX_DER)` (committed pre-V5.4) is scan-based,
// not offset-based — it walks every position in `leafDER` looking for
// the 5-byte ext-OID `06 03 55 1D 09` and asserts the inner-OID + tag
// + length bytes at matched-position+offset. That's functionally
// equivalent to V5.31 OID-anchoring (byte-equality at matched position
// vs at pre-located offset; the witness just doesn't need to declare
// the offset because the scan finds it). Reusing the existing tested
// extractor avoids a new circuit + new test surface for a ~7K
// constraint diff. The spec §4.1 private-witness table will be
// backported by lead post-merge to match this actual interface.
//
// MAX_DER = 1536 mirrors the existing `DobExtractorDiiaUATest.circom`
// (which compile-validated DobExtractor at this size for the V4-era
// leaf cert sizing). Diia leaf certs are ~1400-1500 bytes; 1536 has
// comfortable headroom. NOT 1408 (V5's MAX_LEAF_TBS) because TBS sizes
// can vary; using the proven extractor parameter keeps compile costs
// known-good.
//
// Soundness chain:
//
//   1. leafTbsBytes is supplied as private witness — un-constrained
//      by THIS circuit. The contract-side `proveAge` flow MUST bind
//      this to the holder's registered identity (e.g., by hashing
//      and asserting the resulting commit matches a stored
//      bindings[bindingId].leafCommit, or by re-running V5.3
//      identity verification in the same tx). That binding is OUT
//      OF SCOPE for the AgeDiiaUA circuit — we just prove
//      "the supplied leaf cert is Diia-shaped AND has dobYmd <=
//      cutoff." Pairing with V5.3 identity is the contract's job.
//
//   2. `dobSupported === 1` assertion: a non-Diia leaf (e.g., one
//      lacking the SDA OID 2.5.29.9 entirely, or a CF-Italy cert
//      whose attr OID is different) makes DobExtractor emit
//      `dobSupported = 0`. The hard-fail prevents a malicious prover
//      from supplying a cert without DOB metadata + claiming
//      ageQualified=1 trivially. This is THE soundness gate that
//      makes AgeDiiaUA a Tier-2 (Diia-only) circuit; future Tier-2
//      circuits for other countries follow the same pattern with
//      their respective extractor.
//
//   3. `ageQualified === qual.ageQualified`: the V5.10 isomorphism
//      equality. Witness gen fails if the prover supplies a wrong
//      ageQualified value — e.g., setting ageQualified=1 when their
//      true dobYmd > cutoff would fail this constraint.
//
//   4. `nullifierCtx === ctx.nullifierCtx`: passthrough equality
//      forcing the public slot 2 value to match the off-circuit
//      keccak. Contract-side recomputation in `ZKQESRegistryUA.proveAge`
//      asserts byte-equality with the expected ctx, anchoring the
//      proof to the (bindingId, ageCutoffDate) pair the contract
//      chose.
//
// `extractor.sourceTag` is hard-coded to 1 inside DobExtractor for
// Diia (per IDobExtractor.circom). NOT consumed here — the circuit's
// per-country identity (this is AgeDiiaUA, deployed by the UA registry
// against `Groth16AgeVerifierUA.sol`) implicitly fixes the sourceTag.
// No need to emit as a public signal or assert it; the verifier-binding
// at the contract layer does the same job.

template AgeDiiaUA() {
    var MAX_DER = 1536;

    // Public signals (V5.10 isomorphism — all signal input, declaration
    // order matches FROZEN orchestration §1.3 slot order [0, 1, 2]).
    signal input ageQualified;        // slot 0
    signal input ageCutoffDate;       // slot 1
    signal input nullifierCtx;        // slot 2

    // Private witness.
    signal input leafTbsBytes[MAX_DER];
    signal input leafTbsLen;
    signal input nullifierCtxInput;

    // 1. Extract dobYmd from Diia SDA via existing scan-based extractor.
    // V5.31 anchoring (audit 2026-05-05): scan finds outer ext OID
    // 2.5.29.9, asserts inner UA-arc OID + PrintableString tag +
    // length byte at matched-position+offset. Bounds the YYYYMMDD
    // read window to leading 8 digits; the trailing -NNNNN partial
    // Ukrainian taxpayer INN is identity material the SDA carries
    // beyond DOB but is intentionally NOT extracted.
    component extractor = DobExtractor(MAX_DER);
    for (var i = 0; i < MAX_DER; i++) {
        extractor.leafDER[i] <== leafTbsBytes[i];
    }
    extractor.leafDerLen <== leafTbsLen;

    // Soundness gate: hard-fail if the leaf cert doesn't carry the Diia
    // SDA DOB attribute. AgeDiiaUA is Diia-only by design.
    extractor.dobSupported === 1;

    // 2. Age qualification predicate.
    component qual = AgeQualifyParameterized();
    qual.dobYmd <== extractor.dobYmd;
    qual.ageCutoffDate <== ageCutoffDate;

    // V5.10 isomorphism equality: bind public-input slot 0 to computed
    // value. A prover claiming ageQualified=1 when dobYmd > cutoff
    // fails witness generation here.
    ageQualified === qual.ageQualified;

    // 3. nullifierCtx passthrough — circuit doesn't validate the
    // keccak preimage (off-circuit by design per orchestration §1.4);
    // contract-side recomputation in ZKQESRegistryUA.proveAge enforces
    // (bindingId, ageCutoffDate) binding.
    component ctx = NullifierCtxAge();
    ctx.nullifierCtxInput <== nullifierCtxInput;
    nullifierCtx === ctx.nullifierCtx;
}

component main { public [ageQualified, ageCutoffDate, nullifierCtx] } = AgeDiiaUA();
