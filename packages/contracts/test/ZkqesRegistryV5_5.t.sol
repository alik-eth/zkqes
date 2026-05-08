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
    address internal poseidonT3;
    address internal poseidonT7;

    bytes32 internal constant TRUSTED_ROOT = bytes32(uint256(1));
    bytes32 internal constant POLICY_ROOT = bytes32(uint256(2));

    function setUp() public {
        verifierAccept = new Groth16VerifierV5_5Stub(true);
        verifierReject = new Groth16VerifierV5_5Stub(false);
        // V5.4 pre-deploy pattern: deploy Poseidon once, reuse across
        // every registry instance in this test contract.
        poseidonT3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
        poseidonT7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
        reg = new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierAccept)),
            address(this),
            TRUSTED_ROOT,
            POLICY_ROOT,
            poseidonT3,
            poseidonT7
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
            POLICY_ROOT,
            poseidonT3,
            poseidonT7
        );
    }

    function test_constructor_revertsOnZeroAdmin() public {
        vm.expectRevert(ZkqesRegistryV5_5.ZeroAddress.selector);
        new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierAccept)),
            address(0),
            TRUSTED_ROOT,
            POLICY_ROOT,
            poseidonT3,
            poseidonT7
        );
    }

    function test_constructor_revertsOnZeroPoseidonT3() public {
        vm.expectRevert(ZkqesRegistryV5_5.ZeroAddress.selector);
        new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierAccept)),
            address(this),
            TRUSTED_ROOT,
            POLICY_ROOT,
            address(0),
            poseidonT7
        );
    }

    function test_constructor_revertsOnZeroPoseidonT7() public {
        vm.expectRevert(ZkqesRegistryV5_5.ZeroAddress.selector);
        new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(address(verifierAccept)),
            address(this),
            TRUSTED_ROOT,
            POLICY_ROOT,
            poseidonT3,
            address(0)
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
            POLICY_ROOT,
            poseidonT3,
            poseidonT7
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

    /* ============ rotateWallet revert paths ============ */

    // Distinct privkeys for vm.sign-derived rotation auth signatures.
    uint256 internal constant ALICE_PK = uint256(0xA11CE);
    uint256 internal constant BOB_PK   = uint256(0xB0B);

    /// @dev V5.5 rotateWallet happy-path tests are deferred — they need a
    ///      real secp256k1 fixture for the OLD wallet (so the keccak
    ///      derivation from bindingPk* limbs hits a known-privkey address,
    ///      enabling vm.sign of the rotation auth payload). The REVERT
    ///      paths below all run BEFORE the auth ECDSA check or operate on
    ///      degenerate state (no prior identity), so they don't require
    ///      the privkey alignment.

    function test_rotateWallet_revertsWrongMode_whenMode0() public {
        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.rotationMode = 0; // register-mode signal hits rotateWallet entry
        bytes memory authSig = new bytes(65); // unused — revert fires first
        vm.expectRevert(Errors_V5_5.WrongMode.selector);
        reg.rotateWallet(_emptyProof(), sig, authSig);
    }

    function test_rotateWallet_revertsInvalidNewWallet_when160bitsExceeded() public {
        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.rotationMode = 1;
        sig.rotationNewWallet = uint256(type(uint128).max) << 128 | 1;
        // Range-check fires before Groth16, so the rejecting verifier
        // wouldn't even matter here.
        bytes memory authSig = new bytes(65);
        vm.expectRevert(Errors_V5_5.InvalidNewWallet.selector);
        reg.rotateWallet(_emptyProof(), sig, authSig);
    }

    function test_rotateWallet_revertsUnknownIdentity_whenFingerprintNotClaimed() public {
        // No prior register → identityWallets[fp] == address(0).
        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.rotationMode = 1;
        sig.identityFingerprint = uint256(0xDEADBEEF);
        sig.rotationNewWallet = uint256(uint160(vm.addr(BOB_PK)));
        bytes memory authSig = _rotateAuthSig(ALICE_PK, bytes32(sig.identityFingerprint), vm.addr(BOB_PK));
        vm.prank(vm.addr(BOB_PK));
        vm.expectRevert(Errors_V5_5.UnknownIdentity.selector);
        reg.rotateWallet(_emptyProof(), sig, authSig);
    }

    function test_rotateWallet_revertsInvalidRotationAuth_whenSigByWrongKey() public {
        // Establish a registered identity at a known address via direct
        // storage write — simulates a prior register() without needing
        // privkey alignment for the keccak-derived old wallet.
        bytes32 fingerprint = bytes32(uint256(0xC0FFEE));
        bytes32 oldCommitment = bytes32(uint256(0xFEEDBEEF));
        address oldWallet = vm.addr(ALICE_PK);
        // identityWallets is a public mapping. Slot for ZkqesRegistryV5_5
        // determined by Solidity layout: storage slot for `identityWallets`
        // mapping = its declaration index. We don't compute it manually
        // here; instead we mock via vm.store at the deterministic slot.
        // Simpler path: use forge's `stdStorage` to find the slot.
        bytes32 wSlot = keccak256(abi.encode(fingerprint, _slot_identityWallets()));
        vm.store(address(reg), wSlot, bytes32(uint256(uint160(oldWallet))));
        bytes32 cSlot = keccak256(abi.encode(fingerprint, _slot_identityCommitments()));
        vm.store(address(reg), cSlot, oldCommitment);

        ZkqesRegistryV5_5.PublicSignals memory sig = _emptySignals();
        sig.rotationMode = 1;
        sig.identityFingerprint = uint256(fingerprint);
        sig.rotationOldCommitment = uint256(oldCommitment);
        sig.identityCommitment = uint256(0xFACE); // new commit
        sig.rotationNewWallet = uint256(uint160(vm.addr(BOB_PK)));
        // Sign with BOB_PK instead of ALICE_PK — recovered won't match oldWallet.
        bytes memory authSig = _rotateAuthSig(BOB_PK, fingerprint, vm.addr(BOB_PK));
        vm.prank(vm.addr(BOB_PK));
        vm.expectRevert(Errors_V5_5.InvalidRotationAuth.selector);
        reg.rotateWallet(_emptyProof(), sig, authSig);
    }

    function _rotateAuthSig(uint256 pk, bytes32 fingerprint, address newWallet)
        internal view returns (bytes memory)
    {
        bytes32 authPayload = keccak256(
            abi.encodePacked(
                "qkb-rotate-auth-v1",
                block.chainid,
                address(reg),
                fingerprint,
                newWallet
            )
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", authPayload)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    // Storage slot calculations for direct vm.store. Matches the V5.5
    // contract's storage declaration order. `admin` is slot 0,
    // `trustedListRoot` is slot 1, `policyRoot` is slot 2,
    // `nullifierOf` is slot 3, `identityCommitments` is slot 4,
    // `identityWallets` is slot 5, `usedCtx` is slot 6.
    function _slot_identityCommitments() internal pure returns (uint256) { return 4; }
    function _slot_identityWallets() internal pure returns (uint256) { return 5; }

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
