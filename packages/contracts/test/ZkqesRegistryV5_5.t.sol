// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZkqesRegistryV5_5, Errors_V5_5} from "../src/ZkqesRegistryV5_5.sol";
import {Groth16VerifierV5_5Stub, IGroth16VerifierV5_5} from "../src/Groth16VerifierV5_5Stub.sol";
import {KeyCommit} from "../src/libs/KeyCommit.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";
import {PoseidonBytecode} from "../src/libs/PoseidonBytecode.sol";

/// @title  ZkqesRegistryV5_5 smoke tests.
///
/// Covers v0.1 register() shape:
///   - Constructor + admin/state initialization.
///   - Mode-gate revert on rotation-mode proof at register() entry.
///   - WrongRegisterModeNoOp revert when rotationNewWallet != msg.sender.
///   - BadProof revert with stub verifier set to reject.
///
/// End-to-end happy-path register() requires real signature fixtures
/// (P-256 and RSA) + a real ceremony zkey; deferred until Phase B/C.
/// The smoke tests here lock the structural ABI + early-gate ordering.
contract ZkqesRegistryV5_5SmokeTest is Test {
    ZkqesRegistryV5_5 internal reg;
    Groth16VerifierV5_5Stub internal verifierAccept;
    Groth16VerifierV5_5Stub internal verifierReject;

    bytes32 internal constant TRUSTED_ROOT = bytes32(uint256(1));
    bytes32 internal constant POLICY_ROOT = bytes32(uint256(2));

    function setUp() public {
        verifierAccept = new Groth16VerifierV5_5Stub(true);
        verifierReject = new Groth16VerifierV5_5Stub(false);
        reg = new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierAccept)),
            address(this),
            TRUSTED_ROOT,
            POLICY_ROOT
        );
    }

    function test_constructor_initializesState() public view {
        assertEq(reg.admin(), address(this));
        assertEq(reg.trustedListRoot(), TRUSTED_ROOT);
        assertEq(reg.policyRoot(), POLICY_ROOT);
        assertEq(address(reg.groth16Verifier()), address(verifierAccept));
        assertTrue(reg.poseidonT3() != address(0));
        assertTrue(reg.poseidonT7() != address(0));
        assertEq(reg.MAX_BINDING_AGE(), 1 hours);
    }

    function test_constructor_revertsOnZeroVerifier() public {
        vm.expectRevert(ZkqesRegistryV5_5.ZeroAddress.selector);
        new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(0)),
            address(this),
            TRUSTED_ROOT,
            POLICY_ROOT
        );
    }

    function test_constructor_revertsOnZeroAdmin() public {
        vm.expectRevert(ZkqesRegistryV5_5.ZeroAddress.selector);
        new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierAccept)),
            address(0),
            TRUSTED_ROOT,
            POLICY_ROOT
        );
    }

    function test_admin_setTrustedListRoot() public {
        bytes32 newRoot = bytes32(uint256(99));
        reg.setTrustedListRoot(newRoot);
        assertEq(reg.trustedListRoot(), newRoot);
    }

    function test_admin_revertsOnNonAdmin() public {
        address eve = address(0xdead);
        vm.prank(eve);
        vm.expectRevert(ZkqesRegistryV5_5.OnlyAdmin.selector);
        reg.setTrustedListRoot(bytes32(uint256(99)));
    }

    function test_register_revertsOnRotationMode() public {
        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.rotationMode = 1; // rotate-mode proof at register() entry → WrongMode
        vm.expectRevert(Errors_V5_5.WrongMode.selector);
        reg.register(
            _emptyProof(), sig, "", "", "", "", "",
            _emptyMerklePath(), 0, _emptyMerklePath(), 0
        );
    }

    function test_register_revertsOnWalletDerivationMismatch() public {
        // PublicSignals has all-zero bindingPk limbs — derivedAddr is
        // keccak256(0...0)[12..32] = 0xfffffffe…, not msg.sender.
        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        vm.expectRevert(Errors_V5_5.WalletDerivationMismatch.selector);
        reg.register(
            _emptyProof(), sig, "", "", "", "", "",
            _emptyMerklePath(), 0, _emptyMerklePath(), 0
        );
    }

    function test_register_revertsOnBadProofWithRejectingVerifier() public {
        // Swap in the rejecting verifier to surface BadProof at Gate 1.
        ZkqesRegistryV5_5 regReject = new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierReject)),
            address(this),
            TRUSTED_ROOT,
            POLICY_ROOT
        );
        // Build sig with bindingPk limbs that derive to msg.sender so
        // Gate 2a-prime passes. The keccak of an all-zero 64-byte buffer
        // is 0x290decd9548b62a8d603451ee...c0fe48 — last 20 bytes is the
        // resulting derivedAddr. Use vm.startPrank to act as that addr.
        bytes32 zeroPkHash = keccak256(abi.encodePacked(bytes32(0), bytes32(0)));
        address derivedAddr = address(uint160(uint256(zeroPkHash)));

        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.rotationNewWallet = uint256(uint160(derivedAddr)); // pass register-mode no-op gate

        vm.prank(derivedAddr);
        vm.expectRevert(Errors_V5_5.BadProof.selector);
        regReject.register(
            _emptyProof(), sig, "", "", "", "", "",
            _emptyMerklePath(), 0, _emptyMerklePath(), 0
        );
    }

    function test_register_revertsOnLimbOutOfRange() public {
        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.bindingPkXHi = uint256(type(uint128).max) + 1;
        vm.expectRevert(Errors_V5_5.BindingPkLimbOutOfRange.selector);
        reg.register(
            _emptyProof(), sig, "", "", "", "", "",
            _emptyMerklePath(), 0, _emptyMerklePath(), 0
        );
    }

    function test_isVerified_falseInitially() public view {
        assertFalse(reg.isVerified(address(this)));
    }

    // ----- helpers -----

    function _emptySignals() internal pure returns (ZkqesRegistryV5_5.PublicSignals memory sig) {
        // All-zero PublicSignals; tests override fields as needed.
    }

    function _emptyProof() internal pure returns (ZkqesRegistryV5_5.Groth16Proof memory p) {
        // All-zero proof; stub verifier ignores.
    }

    function _emptyMerklePath() internal pure returns (bytes32[16] memory) {
        bytes32[16] memory p;
        return p;
    }
}
