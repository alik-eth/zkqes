// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IZKQESRegistryUA — minimal V5.4 read surface for binding gates.
/// @notice The V5.4 ZKQESRegistryUA registry dropped V5.2's
///         `isVerified(address)` + `nullifierOf(address)` reverse views
///         (V5.1 invariant 5 relaxed). Bindings are keyed by `bindingId`
///         which third-party contracts MUST receive from the caller —
///         compute off-chain via
///         `keccak256(abi.encode(country, identityFingerprint))` where
///         `identityFingerprint` is public-signal slot 13 of the V5.4
///         leaf proof.
///
/// @dev    Stable across V5.4 → V5.5+ amendments. The Binding struct is
///         additive-compatible with future amendments; new fields
///         append to the tail. Consumers reading via this interface
///         must accept that future fields beyond `nullifier` may exist
///         on-chain even when this interface doesn't enumerate them
///         (they simply aren't in the returned tuple's typed shape).
interface IZKQESRegistryUA {
    /// @dev V5.4 binding storage — see ZKQESRegistryUA.sol.
    struct Binding {
        address pk;
        uint256 ctxHash;
        uint256 policyLeafHash;
        uint256 timestamp;
        uint256 dobCommit;
        uint8   dobSupported;
        bool    revoked;
        uint256 nullifier;
    }

    /// @notice Read a binding by its V5.4-derived `bindingId`.
    ///         Returns the zero-struct (`pk == address(0)`) when no
    ///         binding has ever been registered under this id.
    function getBinding(bytes32 bindingId) external view returns (Binding memory);

    /// @notice True iff the V5.4 binding `bindingId` has previously
    ///         proven `age >= cutoffYmd`. Mirrors the contract's
    ///         `ageProvenCutoffs` mapping. Verifiers query this flag
    ///         without ever seeing the underlying DOB.
    function ageProvenCutoffs(bytes32 bindingId, uint256 cutoffYmd)
        external view returns (bool);
}
