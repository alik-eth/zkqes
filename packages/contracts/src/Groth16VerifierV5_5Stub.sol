// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

/// @title  Groth16VerifierV5_5Stub — test-only always-true verifier.
///
/// @notice 21-public-signal verifyProof shape matching the V5.5 frozen
///         layout (spec §6). Returns `true` for any (proof, input) tuple
///         where ANY of: any input is non-zero, OR the proof has a non-
///         zero `c[0]`. Pinned at always-true via constructor flag for
///         pre-ceremony unit tests; production deploys MUST swap in the
///         real ceremony-output verifier.
///
/// @dev    Mirrors the API of snarkjs-emitted Groth16 verifiers
///         (function signature byte-identical, can be substituted at
///         construction time with no calldata changes). Real verifier
///         arrives post-V5.5 ceremony per spec §13.2 step 6.
contract Groth16VerifierV5_5Stub {
    /// If `true`, every verifyProof returns `true` regardless of inputs.
    /// If `false`, every verifyProof returns `false`. Set at construction.
    bool public immutable accepts;

    constructor(bool _accepts) {
        accepts = _accepts;
    }

    /// 21-element public-signal verifyProof matching V5.5 spec §6 layout.
    /// Calldata-shape compatible with snarkjs-generated verifiers.
    function verifyProof(
        uint256[2] calldata, // proof.a — unused in stub
        uint256[2][2] calldata, // proof.b — unused
        uint256[2] calldata, // proof.c — unused
        uint256[21] calldata // public input vector
    ) external view returns (bool) {
        return accepts;
    }
}

interface IGroth16VerifierV5_5 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[21] calldata input
    ) external view returns (bool);
}
