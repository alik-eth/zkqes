pragma circom 2.1.9;

include "circomlib/circuits/comparators.circom";

// AgeQualifyParameterized — emits 1 iff `dobYmd <= ageCutoffDate`, else 0.
//
// Both inputs are YYYYMMDD integers (e.g., 20060101 for 2006-01-01); the
// numeric ordering of YYYYMMDD coincides with calendar ordering, so a
// single LessEqThan comparator covers the predicate without per-component
// year/month/day decomposition.
//
// Width: 32 bits is sufficient for any realistic YYYYMMDD value
// (max plausible = 99991231 < 2^32 ≈ 4.29e9). LessEqThan(N) requires both
// inputs to fit in N bits — caller MUST ensure the witness builder constrains
// dobYmd and ageCutoffDate to the YYYYMMDD shape (8-decimal-digit ASCII →
// integer in [00000000, 99991231]). Out-of-range inputs (e.g., a malicious
// witness setting dobYmd = 2^33) silently pass the LessEqThan check but
// would have already failed the cert-extraction soundness chain in
// AgeDiiaUA's top-level (T3 wires dobYmd from DobExtractorDiiaUA's verified
// 8-digit packing).
//
// Reusable across Tier-1 (RFC-3739) and Tier-2 (Diia-UA, CF-Italy, etc.)
// age circuits — the cutoff comparison is country-agnostic. Per-country
// circuits diverge only in the DOB-extraction phase upstream of this
// template.
//
// Spec ref: 2026-05-05-zkqes-v5_4-per-country-age-design.md §4.1.
template AgeQualifyParameterized() {
    signal input dobYmd;            // YYYYMMDD as field element
    signal input ageCutoffDate;     // YYYYMMDD as field element
    signal output ageQualified;

    component leq = LessEqThan(32);
    leq.in[0] <== dobYmd;
    leq.in[1] <== ageCutoffDate;
    ageQualified <== leq.out;
}
