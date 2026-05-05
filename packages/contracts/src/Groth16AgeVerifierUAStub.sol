// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

/// @title  IGroth16AgeVerifier — V5.4 age-verifier ABI.
/// @notice Concrete implementations consume the AgeProof's `(a, b, c)`
///         tuple + 3 public signals (`ageQualified, ageCutoffDate,
///         nullifierCtx`). Slot order MUST match the AgeDiiaUA circuit's
///         frozen public-output layout per orchestration §1.3.
interface IGroth16AgeVerifier {
    function verifyProof(
        uint256[2]    calldata a,
        uint256[2][2] calldata b,
        uint256[2]    calldata c,
        uint256[3]    calldata input
    ) external view returns (bool);
}

/// @title  Groth16AgeVerifierUAStub — Phase A unit-test stub.
/// @notice DO NOT use in production. Phase A tests use this to exercise
///         `ZKQESRegistryUA.proveAge`'s contract-side gates without
///         needing a real Groth16 ceremony output. Phase C swaps this
///         file out for the real `Groth16AgeVerifierUA.sol` from
///         circuits-eng's V5.4 ceremony output (orchestration §1.7).
///
/// @dev    Stub returns `stubReturn` (default true). Tests can flip it
///         via `setStubReturn(false)` to exercise the
///         `InvalidAgeProof` revert path without touching `vm.mockCall`
///         (which is fragile across forge versions). Pattern mirrors
///         the V5.2 placeholder verifier role (`Groth16VerifierV5_2Placeholder`)
///         but adds the setter for negative-test convenience.
///
/// @dev    `verifyProof`'s inputs are deliberately ignored — the stub
///         doesn't simulate any pairing math. The contract-side gates
///         (`ageQualified == 1`, cutoff bind, nullifierCtx bind, range
///         check) fire BEFORE this verifier call in `proveAge`, so the
///         stub's accept-all behavior is the right default.
contract Groth16AgeVerifierUAStub is IGroth16AgeVerifier {
    bool public stubReturn = true;

    function setStubReturn(bool v) external {
        stubReturn = v;
    }

    function verifyProof(
        uint256[2]    calldata,
        uint256[2][2] calldata,
        uint256[2]    calldata,
        uint256[3]    calldata
    ) external view returns (bool) {
        return stubReturn;
    }
}
