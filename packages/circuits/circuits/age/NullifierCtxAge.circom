pragma circom 2.1.9;

// NullifierCtxAge — passthrough template that exposes the off-circuit
// `nullifierCtx` value as a public signal.
//
// The actual ctx derivation runs OFF-CIRCUIT, on both the SDK side and
// the contract side, using keccak256 (orchestration §1.4):
//
//   nullifierCtx = keccak256(abi.encodePacked(
//     "zkqes-age-ctx-v1",   // ProtocolBytes literal — FROZEN, never renamed
//     bindingId,            // bytes32
//     ageCutoffDate         // uint256
//   ))
//
// The SDK computes it via viem's keccak256 + same args (BuildAgeWitnessArgs
// per orchestration §1.6). The contract recomputes the same hash inside
// `proveAge` and asserts byte-equality against the proof's public-signal
// slot 2. The circuit doesn't validate the keccak preimage in-circuit
// (keccak is expensive — would dominate the constraint budget for what's
// otherwise a small predicate proof) — soundness comes from the contract
// side recomputation, not from the circuit.
//
// What the circuit DOES guarantee: the value the prover claims as
// `nullifierCtx` flows through to the public signal slot 2 unchanged. So
// once the contract recomputes the expected ctx and asserts equality, the
// proof is bound to the (bindingId, ageCutoffDate) pair the contract
// chose — not whatever the prover would have preferred.
//
// **Drift discipline (orchestration §11 risk)**: the literal string
// `"zkqes-age-ctx-v1"` MUST appear byte-identical in:
//   - SDK: `packages/sdk/src/witness/v5/age/buildAgeWitness.ts` (web-eng)
//   - Contract: `ZKQESRegistryUA.proveAge` (contracts-eng)
//   - This module's doc-comment is canonical reference for the literal.
// A drift across any one of these silently breaks `proveAge` (different
// ctx → contract-side equality fails → proof rejects).
//
// Spec ref: 2026-05-05-zkqes-v5_4-per-country-age-design.md §4.2 +
// orchestration §1.4.
template NullifierCtxAge() {
    signal input nullifierCtxInput;   // derived off-circuit by SDK
    signal output nullifierCtx;       // public signal — slot 2

    nullifierCtx <== nullifierCtxInput;
}
