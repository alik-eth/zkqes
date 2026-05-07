// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IZKQESRegistryUA } from "./IZKQESRegistryUA.sol";

/// @title VerifiedUkrainian — V5.4 base contract gating callers on a UA binding.
/// @notice Inherit and apply `onlyVerifiedUkrainian(bindingId)` to any
///         external function that should only fire for a verified
///         Ukrainian holder. For age-gated calls, use
///         `onlyAgeQualified(bindingId, cutoffYmd)` — the cutoff is a
///         fixed YYYYMMDD chosen at dApp design time.
///
/// @dev    Caller passes their own `bindingId` because V5.4's registry
///         dropped the wallet→bindingId reverse mapping. UI computes
///         the id off-chain via
///         `keccak256(abi.encode("UA", identityFingerprint))`. The
///         modifier asserts `binding.pk == msg.sender`, so a caller
///         can't ride someone else's verification by reading their
///         bindingId off-chain.
abstract contract VerifiedUkrainian {
    IZKQESRegistryUA public immutable zkqesRegistryUa;

    error BindingNotFound(bytes32 bindingId);
    error BindingNotOwned(bytes32 bindingId, address caller);
    error BindingRevokedErr(bytes32 bindingId);
    error AgeNotProven(bytes32 bindingId, uint256 cutoffYmd);

    constructor(IZKQESRegistryUA _registry) {
        zkqesRegistryUa = _registry;
    }

    /// @notice Gate: caller has an active V5.4 binding under
    ///         `bindingId` and is its owner.
    modifier onlyVerifiedUkrainian(bytes32 bindingId) {
        IZKQESRegistryUA.Binding memory b = zkqesRegistryUa.getBinding(bindingId);
        if (b.pk == address(0)) revert BindingNotFound(bindingId);
        if (b.pk != msg.sender) revert BindingNotOwned(bindingId, msg.sender);
        if (b.revoked)          revert BindingRevokedErr(bindingId);
        _;
    }

    /// @notice Gate: caller is verified AND has previously proven
    ///         `age >= cutoffYmd` against this binding via
    ///         `ZKQESRegistryUA.proveAge(bindingId, cutoffYmd, ...)`.
    ///
    ///         Cutoff is a YYYYMMDD integer. Pick a STATIC value at
    ///         dApp design time (e.g. 20070101 for an "18 years old
    ///         on 2025-01-01" gate). Different callers must hit the
    ///         same `ageProvenCutoffs` slot, so don't compute "today
    ///         minus 18 years" — pin a date.
    modifier onlyAgeQualified(bytes32 bindingId, uint256 cutoffYmd) {
        IZKQESRegistryUA.Binding memory b = zkqesRegistryUa.getBinding(bindingId);
        if (b.pk == address(0)) revert BindingNotFound(bindingId);
        if (b.pk != msg.sender) revert BindingNotOwned(bindingId, msg.sender);
        if (b.revoked)          revert BindingRevokedErr(bindingId);
        if (!zkqesRegistryUa.ageProvenCutoffs(bindingId, cutoffYmd)) {
            revert AgeNotProven(bindingId, cutoffYmd);
        }
        _;
    }
}
