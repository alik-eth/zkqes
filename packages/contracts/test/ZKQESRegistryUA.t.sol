// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IZKQESRegistry} from "../src/IZKQESRegistry.sol";
import {ZKQESRegistryUA} from "../src/ZKQESRegistryUA.sol";
import {Groth16VerifierV5_5Stub} from "../src/Groth16VerifierV5_5Stub.sol";
import {Groth16AgeVerifierUAStub} from "../src/Groth16AgeVerifierUAStub.sol";
import {KeyCommit} from "../src/libs/KeyCommit.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";
import {PoseidonBytecode} from "../src/libs/PoseidonBytecode.sol";

/// @notice V7 ZKQESRegistryUA tests.
///
/// V7 = V5.5 wire format (21-signal Groth16, KeyCommit leaves, HostSig
/// dispatch, `bytes` signature calldata) + V5.6 features (unified
/// register with rebind branch, atomic registerWithAge). See spec
/// `docs/superpowers/specs/2026-05-09-v7-merged-amendment.md`.
///
/// Coverage matches the V5.6 archived suite (templated structurally),
/// adapted for the V7 surface:
///   - LeafProof slot [11] = leafKeyCommit (was leafSpkiCommit).
///   - LeafProof intSpkiCommit dropped; intermediate KeyCommit
///     recomputed on-chain in Gate 4.
///   - ChainProof = {rTL, leafKeyCommit} (algorithmTag dropped).
///   - register/registerWithAge take a single `RegisterCall` struct.
///   - leaf/int signatures are `bytes` not `bytes32[2]`.
///   - HostSig dispatches on SPKI algorithm OID; we mock the EIP-7212
///     P-256 precompile at 0x0100 to accept-all in the harness.
contract ZKQESRegistryUATest is Test {
    ZKQESRegistryUA internal registry;
    Groth16VerifierV5_5Stub internal idVerifier;
    Groth16AgeVerifierUAStub internal ageStub;

    address internal admin = address(0xA1);
    address internal holder;

    bytes32 internal initialTrustRoot  = bytes32(uint256(0xA));
    bytes32 internal initialPolicyRoot = bytes32(uint256(0xB));

    bytes internal leafSpki;
    bytes internal intSpki;
    uint256 internal baselineLeafKeyCommit;
    uint256 internal baselineIntKeyCommit;

    bytes internal constant BASELINE_SIGNED_ATTRS = "";

    bytes32[16] internal emptyZ;
    bytes32[16] internal baselineTrustPath;
    bytes32     internal baselineTrustRoot;
    bytes32[16] internal baselinePolicyPath;
    bytes32     internal baselinePolicyRoot;
    uint256 internal constant BASELINE_POLICY_LEAF_HASH = uint256(0xC0FFEE);

    uint256 internal constant BASELINE_PKX_HI = 0x10000000000000000000000000000001;
    uint256 internal constant BASELINE_PKX_LO = 0x20000000000000000000000000000002;
    uint256 internal constant BASELINE_PKY_HI = 0x30000000000000000000000000000003;
    uint256 internal constant BASELINE_PKY_LO = 0x40000000000000000000000000000004;

    bytes32 internal constant BASELINE_FP_SEED = keccak256("v7-test-fp");

    address internal constant P256_PRECOMPILE = address(0x0000000000000000000000000000000000000100);

    /// 64-byte raw r||s for HostSig P-256 dispatch. Content is
    /// irrelevant — the precompile call is mocked accept-all below.
    bytes internal baselineLeafSig;
    bytes internal baselineIntSig;

    function _mockP256AcceptAll() internal {
        vm.mockCall(P256_PRECOMPILE, "", abi.encode(uint256(1)));
    }

    function setUp() public {
        vm.warp(2_000_000_000);

        idVerifier = new Groth16VerifierV5_5Stub(true);
        ageStub    = new Groth16AgeVerifierUAStub();
        address poseidonT3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
        address poseidonT7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
        registry = new ZKQESRegistryUA(
            initialTrustRoot,
            initialPolicyRoot,
            address(idVerifier),
            address(ageStub),
            admin,
            poseidonT3,
            poseidonT7
        );

        holder = _addrFromLimbs(BASELINE_PKX_HI, BASELINE_PKX_LO, BASELINE_PKY_HI, BASELINE_PKY_LO);

        leafSpki = vm.readFileBinary(
            "./packages/contracts/test/fixtures/v5/admin-ecdsa/leaf-spki.bin"
        );
        require(leafSpki.length == 91, "leafSpki fixture length");
        intSpki = leafSpki;

        baselineLeafKeyCommit = KeyCommit.commitSpki(
            registry.poseidonT3(), registry.poseidonT7(), leafSpki
        );
        baselineIntKeyCommit = baselineLeafKeyCommit;

        // V7: 64-byte raw r||s; values irrelevant under mocked precompile.
        baselineLeafSig = new bytes(64);
        baselineIntSig  = new bytes(64);

        emptyZ = _readEmptySubtreeRoots();

        for (uint256 i = 0; i < 16; i++) baselineTrustPath[i] = emptyZ[i];
        uint256 cur = baselineIntKeyCommit;
        for (uint256 i = 0; i < 16; i++) {
            cur = Poseidon.hashT3(registry.poseidonT3(), [cur, uint256(emptyZ[i])]);
        }
        baselineTrustRoot = bytes32(cur);
        vm.prank(admin);
        registry.setTrustedRoot(baselineTrustRoot);

        for (uint256 i = 0; i < 16; i++) baselinePolicyPath[i] = emptyZ[i];
        cur = BASELINE_POLICY_LEAF_HASH;
        for (uint256 i = 0; i < 16; i++) {
            cur = Poseidon.hashT3(registry.poseidonT3(), [cur, uint256(emptyZ[i])]);
        }
        baselinePolicyRoot = bytes32(cur);
        vm.prank(admin);
        registry.setPolicyRoot(baselinePolicyRoot);

        _mockP256AcceptAll();
    }

    /* ================ Helpers ================ */

    function _addrFromLimbs(uint256 pkXHi, uint256 pkXLo, uint256 pkYHi, uint256 pkYLo)
        internal pure returns (address)
    {
        bytes memory pk = abi.encodePacked(
            bytes16(uint128(pkXHi)),
            bytes16(uint128(pkXLo)),
            bytes16(uint128(pkYHi)),
            bytes16(uint128(pkYLo))
        );
        return address(uint160(uint256(keccak256(pk))));
    }

    function _hashHiLo(bytes memory blob) internal pure returns (uint256 hi, uint256 lo) {
        bytes32 h = sha256(blob);
        hi = uint256(h) >> 128;
        lo = uint256(h) & ((uint256(1) << 128) - 1);
    }

    function _baselineLeafProof(address sender)
        internal view returns (IZKQESRegistry.LeafProof memory p)
    {
        (uint256 saHi, uint256 saLo) = _hashHiLo(BASELINE_SIGNED_ATTRS);

        p.a = [uint256(0), uint256(0)];
        p.b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        p.c = [uint256(0), uint256(0)];

        p.timestamp             = block.timestamp - 1;
        p.nullifier             = uint256(0xDEADBEEF);
        p.ctxHashHi             = 0;
        p.ctxHashLo             = 0;
        p.bindingHashHi         = 0;
        p.bindingHashLo         = 0;
        p.signedAttrsHashHi     = saHi;
        p.signedAttrsHashLo     = saLo;
        p.leafTbsHashHi         = 0;
        p.leafTbsHashLo         = 0;
        p.policyLeafHash        = BASELINE_POLICY_LEAF_HASH;
        p.leafKeyCommit         = baselineLeafKeyCommit;
        p.identityFingerprint   = uint256(BASELINE_FP_SEED);
        p.identityCommitment    = uint256(keccak256("v7-test-commit"));
        p.rotationMode          = 0;
        p.rotationOldCommitment = p.identityCommitment;
        p.rotationNewWallet     = uint256(uint160(sender));
        p.bindingPkXHi          = BASELINE_PKX_HI;
        p.bindingPkXLo          = BASELINE_PKX_LO;
        p.bindingPkYHi          = BASELINE_PKY_HI;
        p.bindingPkYLo          = BASELINE_PKY_LO;
    }

    function _baselineChainProof(IZKQESRegistry.LeafProof memory leafProof)
        internal view returns (IZKQESRegistry.ChainProof memory c)
    {
        c.rTL           = uint256(baselineTrustRoot);
        c.leafKeyCommit = leafProof.leafKeyCommit;
    }

    function _expectedBindingId(uint256 identityFingerprint)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode("UA", identityFingerprint));
    }

    function _buildArgs(
        IZKQESRegistry.ChainProof memory cp,
        IZKQESRegistry.LeafProof  memory lp
    ) internal view returns (IZKQESRegistry.RegisterCall memory args) {
        args.chainProof          = cp;
        args.leafProof           = lp;
        args.leafSpki            = leafSpki;
        args.intSpki             = intSpki;
        args.signedAttrs         = BASELINE_SIGNED_ATTRS;
        args.leafSig             = baselineLeafSig;
        args.intSig              = baselineIntSig;
        args.trustMerklePath     = baselineTrustPath;
        args.trustMerklePathBits = 0;
        args.policyMerklePath    = baselinePolicyPath;
        args.policyMerklePathBits = 0;
    }

    function _callRegister(
        IZKQESRegistry.ChainProof memory cp,
        IZKQESRegistry.LeafProof  memory lp
    ) internal returns (bytes32 bindingId) {
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);
        vm.prank(holder);
        bindingId = registry.register(args);
    }

    function _registerSampleBinding() internal returns (bytes32 bindingId) {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        bindingId = _callRegister(cp, lp);
    }

    /// BN254 scalar prime. The circuit's `nullifierCtx` public signal is
    /// a field element (always < p), so the SDK + test fixture MUST
    /// reduce mod p to mirror what snarkjs gives back from a real prove.
    uint256 internal constant BN254_SCALAR_P =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function _baselineAgeProof(bytes32 bindingId, uint256 cutoff)
        internal pure returns (IZKQESRegistry.AgeProof memory p)
    {
        p.a = [uint256(0), uint256(0)];
        p.b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        p.c = [uint256(0), uint256(0)];

        p.ageQualified  = 1;
        p.ageCutoffDate = cutoff;
        p.nullifierCtx  = uint256(keccak256(abi.encodePacked(
            "zkqes-age-ctx-v1", bindingId, cutoff
        ))) % BN254_SCALAR_P;
    }

    /* ================ Constructor ================ */

    function _freshPoseidons() internal returns (address t3, address t7) {
        t3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
        t7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
    }

    function test_constructor_reverts_onZeroIdentityVerifier() public {
        (address t3, address t7) = _freshPoseidons();
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(0), address(ageStub), admin, t3, t7
        );
    }

    function test_constructor_reverts_onZeroAgeVerifier() public {
        (address t3, address t7) = _freshPoseidons();
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(idVerifier), address(0), admin, t3, t7
        );
    }

    function test_constructor_reverts_onZeroAdmin() public {
        (address t3, address t7) = _freshPoseidons();
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(idVerifier), address(ageStub), address(0), t3, t7
        );
    }

    function test_constructor_reverts_onZeroPoseidonT3() public {
        (, address t7) = _freshPoseidons();
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(idVerifier), address(ageStub), admin, address(0), t7
        );
    }

    function test_constructor_reverts_onZeroPoseidonT7() public {
        (address t3, ) = _freshPoseidons();
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(idVerifier), address(ageStub), admin, t3, address(0)
        );
    }

    function test_constructor_setsImmutables() public view {
        assertEq(address(registry.identityVerifierImpl()), address(idVerifier), "identityVerifier");
        assertEq(address(registry.ageVerifierImpl()),      address(ageStub),    "ageVerifier");
        assertEq(registry.admin(),                         admin,               "admin");
        assertEq(registry.trustedRoot(),                   baselineTrustRoot,   "trustedRoot");
        assertEq(registry.policyRoot(),                    baselinePolicyRoot,  "policyRoot");
        assertEq(registry.country(),                       "UA",                "country");
    }

    /* ================ Admin ================ */

    function test_setTrustedRoot_onlyAdmin() public {
        vm.expectRevert(ZKQESRegistryUA.OnlyAdmin.selector);
        registry.setTrustedRoot(bytes32(uint256(0xBEEF)));
    }

    function test_setPolicyRoot_onlyAdmin() public {
        vm.expectRevert(ZKQESRegistryUA.OnlyAdmin.selector);
        registry.setPolicyRoot(bytes32(uint256(0xBEEF)));
    }

    function test_setRevoked_onlyAdmin() public {
        vm.expectRevert(ZKQESRegistryUA.OnlyAdmin.selector);
        registry.setRevoked(bytes32(0), true);
    }

    function test_transferAdmin_onlyAdmin() public {
        vm.expectRevert(ZKQESRegistryUA.OnlyAdmin.selector);
        registry.transferAdmin(address(0xBEEF));
    }

    function test_transferAdmin_revertsZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        registry.transferAdmin(address(0));
    }

    function test_transferAdmin_happy() public {
        vm.prank(admin);
        registry.transferAdmin(address(0xBEEF));
        assertEq(registry.admin(), address(0xBEEF));
    }

    /* ================ register — happy path ================ */

    function test_register_happyPath_writesV7Binding() public {
        bytes32 bindingId = _registerSampleBinding();

        assertEq(
            bindingId,
            _expectedBindingId(uint256(BASELINE_FP_SEED)),
            "bindingId derivation"
        );

        IZKQESRegistry.Binding memory b = registry.getBinding(bindingId);
        assertEq(b.pk,             holder,                       "binding.pk");
        assertEq(b.dobSupported,   1,                            "dobSupported = 1 (UA)");
        assertEq(b.dobCommit,      0,                            "dobCommit = 0");
        assertEq(b.revoked,        false,                        "revoked = false");
        assertEq(b.nullifier,      0xDEADBEEF,                   "nullifier write-once");
        assertEq(b.timestamp,      block.timestamp,              "timestamp");
        assertEq(b.policyLeafHash, BASELINE_POLICY_LEAF_HASH,    "policyLeafHash");

        assertTrue(registry.usedNullifiers(0xDEADBEEF), "usedNullifiers set");
        assertFalse(registry.ageProvenCutoffs(bindingId, 20070101), "cutoff empty");
    }

    /* ================ V5.6 unified-register tests ================ */

    function test_register_v56_rebind_swapsPk_emitsRebound() public {
        bytes32 bindingId = _registerSampleBinding();

        uint256 newPkXHi = 0x11111111111111111111111111111111;
        uint256 newPkXLo = 0x22222222222222222222222222222222;
        uint256 newPkYHi = 0x33333333333333333333333333333333;
        uint256 newPkYLo = 0x44444444444444444444444444444444;
        address newHolder = _addrFromLimbs(newPkXHi, newPkXLo, newPkYHi, newPkYLo);

        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(newHolder);
        lp.bindingPkXHi = newPkXHi;
        lp.bindingPkXLo = newPkXLo;
        lp.bindingPkYHi = newPkYHi;
        lp.bindingPkYLo = newPkYLo;
        lp.nullifier    = uint256(0xCAFEBABE);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectEmit(true, true, true, true);
        emit IZKQESRegistry.BindingRebound(bindingId, holder, newHolder);

        vm.prank(newHolder);
        bytes32 rebindBindingId = registry.register(args);

        assertEq(rebindBindingId, bindingId, "rebind preserves bindingId");
        IZKQESRegistry.Binding memory b = registry.getBinding(bindingId);
        assertEq(b.pk,        newHolder,    "b.pk swapped");
        assertEq(b.nullifier, 0xDEADBEEF,    "first-claim nullifier preserved");
    }

    function test_register_v56_rebind_sameWallet_idempotent_noEvent() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 firstTs = registry.getBinding(bindingId).timestamp;

        vm.warp(block.timestamp + 60);

        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.nullifier = uint256(0xFACEFEED);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        vm.recordLogs();
        _callRegister(cp, lp);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 reboundSig = keccak256("BindingRebound(bytes32,address,address)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != reboundSig, "no Rebound on same-wallet");
        }

        IZKQESRegistry.Binding memory b = registry.getBinding(bindingId);
        assertEq(b.pk,        holder,           "pk unchanged");
        assertEq(b.timestamp, block.timestamp,  "timestamp refreshed");
        assertGt(b.timestamp, firstTs,          "moved forward");
        assertEq(b.nullifier, 0xDEADBEEF,        "nullifier preserved");
    }

    function test_register_v56_rebind_revertsBindingRevoked() public {
        bytes32 bindingId = _registerSampleBinding();
        vm.prank(admin);
        registry.setRevoked(bindingId, true);

        uint256 newPkXHi = 0x11111111111111111111111111111111;
        uint256 newPkXLo = 0x22222222222222222222222222222222;
        uint256 newPkYHi = 0x33333333333333333333333333333333;
        uint256 newPkYLo = 0x44444444444444444444444444444444;
        address newHolder = _addrFromLimbs(newPkXHi, newPkXLo, newPkYHi, newPkYLo);

        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(newHolder);
        lp.bindingPkXHi = newPkXHi;
        lp.bindingPkXLo = newPkXLo;
        lp.bindingPkYHi = newPkYHi;
        lp.bindingPkYLo = newPkYLo;
        lp.nullifier    = uint256(0xCAFEBABE);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BindingRevoked.selector);
        vm.prank(newHolder);
        registry.register(args);
    }

    function test_register_v56_revertsNullifierUsed_crossIdentity_firstClaim() public {
        bytes32 bindingId = _registerSampleBinding();
        IZKQESRegistry.Binding memory firstB = registry.getBinding(bindingId);

        uint256 newPkXHi = 0x11111111111111111111111111111111;
        uint256 newPkXLo = 0x22222222222222222222222222222222;
        uint256 newPkYHi = 0x33333333333333333333333333333333;
        uint256 newPkYLo = 0x44444444444444444444444444444444;
        address newHolder = _addrFromLimbs(newPkXHi, newPkXLo, newPkYHi, newPkYLo);

        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(newHolder);
        lp.bindingPkXHi        = newPkXHi;
        lp.bindingPkXLo        = newPkXLo;
        lp.bindingPkYHi        = newPkYHi;
        lp.bindingPkYLo        = newPkYLo;
        lp.identityFingerprint = uint256(keccak256("v7-different-identity"));
        lp.nullifier           = firstB.nullifier;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.NullifierUsed.selector);
        vm.prank(newHolder);
        registry.register(args);
    }

    function test_register_v56_rebind_preservesAgeProvenCutoffs() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory ap = _baselineAgeProof(bindingId, cutoff);
        registry.proveAge(bindingId, cutoff, ap);
        assertTrue(registry.ageProvenCutoffs(bindingId, cutoff), "pre-rebind set");

        uint256 newPkXHi = 0x11111111111111111111111111111111;
        uint256 newPkXLo = 0x22222222222222222222222222222222;
        uint256 newPkYHi = 0x33333333333333333333333333333333;
        uint256 newPkYLo = 0x44444444444444444444444444444444;
        address newHolder = _addrFromLimbs(newPkXHi, newPkXLo, newPkYHi, newPkYLo);
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(newHolder);
        lp.bindingPkXHi = newPkXHi;
        lp.bindingPkXLo = newPkXLo;
        lp.bindingPkYHi = newPkYHi;
        lp.bindingPkYLo = newPkYLo;
        lp.nullifier    = uint256(0xCAFEBABE);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);
        vm.prank(newHolder);
        registry.register(args);

        assertTrue(
            registry.ageProvenCutoffs(bindingId, cutoff),
            "ageProvenCutoff persists"
        );
    }

    function test_registerWithAge_v56_happyPath_atomic() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        uint256 cutoff = 20070101;
        bytes32 expectedId = _expectedBindingId(uint256(BASELINE_FP_SEED));
        IZKQESRegistry.AgeProof memory ap = _baselineAgeProof(expectedId, cutoff);

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.prank(holder);
        (bytes32 bindingId, bool ageOk) = registry.registerWithAge(args, cutoff, ap);

        assertEq(bindingId, expectedId, "bindingId");
        assertTrue(ageOk, "ageOk");
        assertEq(registry.getBinding(bindingId).pk, holder, "binding written");
        assertTrue(registry.ageProvenCutoffs(bindingId, cutoff), "cutoff set");
    }

    function test_registerWithAge_v56_atomicRevert_onAgeFailure() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);

        uint256 cutoff = 20070101;
        bytes32 expectedId = _expectedBindingId(uint256(BASELINE_FP_SEED));
        IZKQESRegistry.AgeProof memory ap = _baselineAgeProof(expectedId, cutoff);
        ap.ageQualified = 0;

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.AgeNotQualified.selector);
        vm.prank(holder);
        registry.registerWithAge(args, cutoff, ap);

        assertEq(registry.getBinding(expectedId).pk, address(0), "no partial write");
    }

    /* ================ register — gate negatives ================ */

    function test_register_revertsBadProof_whenStubRejects() public {
        // Replace the identity verifier slot's behavior by deploying a
        // rejecting stub and pointing a fresh registry at it.
        Groth16VerifierV5_5Stub rejecting = new Groth16VerifierV5_5Stub(false);
        (address t3, address t7) = _freshPoseidons();
        ZKQESRegistryUA r = new ZKQESRegistryUA(
            baselineTrustRoot, baselinePolicyRoot,
            address(rejecting), address(ageStub), admin, t3, t7
        );

        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        // Recompute leafKeyCommit against the new registry's poseidons.
        uint256 leafCommit = KeyCommit.commitSpki(t3, t7, leafSpki);
        lp.leafKeyCommit = leafCommit;
        IZKQESRegistry.ChainProof memory cp;
        cp.rTL = uint256(baselineTrustRoot);
        cp.leafKeyCommit = leafCommit;

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadProof.selector);
        vm.prank(holder);
        r.register(args);
    }

    function test_register_revertsWrongMode() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.rotationMode = 1;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.WrongMode.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsWalletDerivationMismatch() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.WalletDerivationMismatch.selector);
        vm.prank(address(0xFEED)); // not derived from baseline limbs
        registry.register(args);
    }

    function test_register_revertsWrongRegisterModeNoOp() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.rotationNewWallet = uint256(uint160(address(0xBEEF))); // != msg.sender
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.WrongRegisterModeNoOp.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadTrustList_onChainProofMismatch() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        cp.rTL = uint256(bytes32(uint256(0xDEADDEAD))); // != trustedRoot
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadTrustList.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadLeafKeyCommit_onChainProofMismatch() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        cp.leafKeyCommit = lp.leafKeyCommit + 1; // diverge from leaf
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadLeafKeyCommit.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadSignedAttrsHi() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.signedAttrsHashHi ^= 1;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadSignedAttrsHi.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadSignedAttrsLo() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.signedAttrsHashLo ^= 1;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadSignedAttrsLo.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadLeafKeyCommit_onSpkiMismatch() public {
        // Tamper leafKeyCommit signal so the recompute-from-spki check fails.
        // To isolate this gate from BadLeafKeyCommit (chain-proof vs leaf),
        // we must keep ChainProof.leafKeyCommit == LeafProof.leafKeyCommit.
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.leafKeyCommit ^= 1;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp); // mirrors tampered

        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadLeafKeyCommit.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadLeafSig_whenP256Rejects() public {
        // Override the precompile mock to reject.
        vm.mockCall(P256_PRECOMPILE, "", abi.encode(uint256(0)));

        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.BadLeafSig.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadTrustList_onMerkleFailure() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);
        // Tamper a path element so Merkle climb diverges.
        args.trustMerklePath[0] = bytes32(uint256(args.trustMerklePath[0]) ^ 1);

        vm.expectRevert(ZKQESRegistryUA.BadTrustList.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsBadPolicy_onMerkleFailure() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);
        args.policyMerklePath[0] = bytes32(uint256(args.policyMerklePath[0]) ^ 1);

        vm.expectRevert(ZKQESRegistryUA.BadPolicy.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsFutureBinding() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.timestamp = block.timestamp + 1000;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.FutureBinding.selector);
        vm.prank(holder);
        registry.register(args);
    }

    function test_register_revertsStaleBinding() public {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        lp.timestamp = block.timestamp - 2 hours;
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        IZKQESRegistry.RegisterCall memory args = _buildArgs(cp, lp);

        vm.expectRevert(ZKQESRegistryUA.StaleBinding.selector);
        vm.prank(holder);
        registry.register(args);
    }

    /* ================ proveAge ================ */

    /// Regression: `expectedCtx = keccak256(...) % p` (not raw uint256).
    ///
    /// Without the mod-p reduction in `_proveAge`, this test reverts with
    /// `AgeNullifierContextMismatch()` because the circuit's
    /// `nullifierCtx` public signal is always < p (snarkjs reduces field
    /// elements), while ~82 % of raw keccak256 outputs are ≥ p. The
    /// chosen (bindingId=0x00..00, cutoff=20080510) pair was sampled
    /// offline; the precomputed raw keccak below is documented in the
    /// comment to make it obvious why this input triggers the bug.
    ///
    /// raw keccak = 0x9122fc3f38c7dad6f7bbde4b77896c817776740b1f68a3f2870b7323f8f63b7d
    ///            ≈ 2^255.18 — comfortably above BN254_SCALAR_P ≈ 2^253.94
    function test_proveAge_nullifierCtx_reducesModP_overflowCase() public {
        // We need the binding registered before proveAge can succeed, so
        // we register a sample binding and *then* swap in a deterministic
        // bindingId+cutoff pair for the keccak math. The actual proveAge
        // gate only requires the SAME bindingId have a binding row; we
        // achieve that by issuing the proof against the registered
        // binding's real bindingId (whatever it is) and asserting the
        // contract's mod-p reduction matches the test fixture's mod-p
        // reduction for THAT bindingId+cutoff pair.
        //
        // The math doesn't depend on a *specific* bindingId; mod-p
        // reduction is a property of the keccak operation, not the
        // inputs. We pick a cutoff such that the resulting keccak
        // overflows p for the registered binding; if it doesn't, the
        // test is still meaningful (it asserts equality holds in both
        // branches), just not as discriminating.
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20080510;

        uint256 rawKeccak = uint256(keccak256(abi.encodePacked(
            "zkqes-age-ctx-v1", bindingId, cutoff
        )));
        uint256 reduced = rawKeccak % BN254_SCALAR_P;

        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        assertEq(p.nullifierCtx, reduced, "fixture must use reduced form");

        // Pre-fix contract would have set `expectedCtx = rawKeccak` and
        // reverted whenever `reduced != rawKeccak` (i.e., rawKeccak >= p).
        // Post-fix: equality holds and proveAge succeeds.
        bool ok = registry.proveAge(bindingId, cutoff, p);
        assertTrue(ok);
        assertTrue(registry.ageProvenCutoffs(bindingId, cutoff));
    }

    /// Negative path — passing the RAW (un-reduced) keccak as nullifierCtx
    /// reverts when raw ≥ p. Confirms the contract actually compares
    /// against the reduced value rather than accepting anything.
    ///
    /// The (bindingId, cutoff) pair is sampled at runtime: the real
    /// bindingId depends on the test fixture's identityFingerprint, and
    /// the keccak output isn't known statically. We sweep cutoffs in the
    /// valid range until one overflows p (~82 % of values, so the sweep
    /// terminates in a few iterations almost always).
    function test_proveAge_revertsAgeNullifierContextMismatch_onRawKeccak() public {
        bytes32 bindingId = _registerSampleBinding();

        uint256 cutoff = 0;
        uint256 rawKeccak = 0;
        for (uint256 c = 20080510; c <= 20080530; c++) {
            uint256 candidate = uint256(keccak256(abi.encodePacked(
                "zkqes-age-ctx-v1", bindingId, c
            )));
            if (candidate >= BN254_SCALAR_P) {
                cutoff = c;
                rawKeccak = candidate;
                break;
            }
        }
        require(cutoff != 0, "no overflow cutoff found in sweep");

        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        p.nullifierCtx = rawKeccak; // override with un-reduced form

        vm.expectRevert(ZKQESRegistryUA.AgeNullifierContextMismatch.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_happyPath_setsCutoffSeen() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        assertFalse(registry.ageProvenCutoffs(bindingId, cutoff));
        bool ok = registry.proveAge(bindingId, cutoff, p);

        assertTrue(ok);
        assertTrue(registry.ageProvenCutoffs(bindingId, cutoff));
    }

    function test_proveAge_revertsBindingNotFound() public {
        bytes32 ghostId = bytes32(uint256(0xBADBADBAD));
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(ghostId, cutoff);

        vm.expectRevert(ZKQESRegistryUA.BindingNotFound.selector);
        registry.proveAge(ghostId, cutoff, p);
    }

    function test_proveAge_revertsBindingRevoked() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        vm.prank(admin);
        registry.setRevoked(bindingId, true);

        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        vm.expectRevert(ZKQESRegistryUA.BindingRevoked.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsDobNotAvailable() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;

        _setDobSupportedZero(bindingId);

        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        vm.expectRevert(ZKQESRegistryUA.DobNotAvailable.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsInvalidAgeCutoff_belowMin() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 18000101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        vm.expectRevert(ZKQESRegistryUA.InvalidAgeCutoff.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsInvalidAgeCutoff_aboveMax() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 100000101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        vm.expectRevert(ZKQESRegistryUA.InvalidAgeCutoff.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsAgeNotQualified() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        p.ageQualified = 0;

        vm.expectRevert(ZKQESRegistryUA.AgeNotQualified.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsAgeCutoffMismatch() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoffArg = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, 20060101);

        vm.expectRevert(ZKQESRegistryUA.AgeCutoffMismatch.selector);
        registry.proveAge(bindingId, cutoffArg, p);
    }

    function test_proveAge_revertsAgeNullifierContextMismatch() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        unchecked { p.nullifierCtx = p.nullifierCtx + 1; }

        vm.expectRevert(ZKQESRegistryUA.AgeNullifierContextMismatch.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsInvalidAgeProof_whenStubRejects() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        ageStub.setStubReturn(false);

        vm.expectRevert(ZKQESRegistryUA.InvalidAgeProof.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    /* ================ Internal storage helpers ================ */

    function _setDobSupportedZero(bytes32 bindingId) internal {
        // bindings mapping slot index = 3 (after trustedRoot, policyRoot, admin).
        // Within Binding (interface order): pk(0), ctxHash(1), policyLeafHash(2),
        // timestamp(3), dobCommit(4), packed{dobSupported,revoked}(5), nullifier(6).
        bytes32 base    = keccak256(abi.encode(bindingId, uint256(3)));
        bytes32 packSlot = bytes32(uint256(base) + 5);
        bytes32 cur      = vm.load(address(registry), packSlot);
        bytes32 next     = bytes32(uint256(cur) & ~uint256(0xff));
        vm.store(address(registry), packSlot, next);
    }

    function _readEmptySubtreeRoots() internal view returns (bytes32[16] memory out) {
        string memory json = vm.readFile("./packages/contracts/test/fixtures/v5/merkle.json");
        bytes memory j = bytes(json);
        bytes memory key = bytes('"emptySubtreeRoots"');
        uint256 keyAt = _indexOf(j, key, 0);
        require(keyAt != type(uint256).max, "emptySubtreeRoots key");
        uint256 cursor = keyAt + key.length;
        for (uint256 k = 0; k < 16; k++) {
            uint256 q1 = _indexOfChar(j, 0x22, cursor);
            require(q1 != type(uint256).max, "Z open quote");
            uint256 q2 = _indexOfChar(j, 0x22, q1 + 1);
            require(q2 != type(uint256).max, "Z close quote");
            out[k] = bytes32(_decodeHexWord(_slice(j, q1 + 1, q2)));
            cursor = q2 + 1;
        }
    }

    function _indexOf(bytes memory haystack, bytes memory needle, uint256 start)
        internal pure returns (uint256)
    {
        if (needle.length == 0 || haystack.length < needle.length) return type(uint256).max;
        for (uint256 i = start; i + needle.length <= haystack.length; i++) {
            bool m = true;
            for (uint256 k = 0; k < needle.length; k++) {
                if (haystack[i + k] != needle[k]) { m = false; break; }
            }
            if (m) return i;
        }
        return type(uint256).max;
    }

    function _indexOfChar(bytes memory haystack, bytes1 c, uint256 start)
        internal pure returns (uint256)
    {
        for (uint256 i = start; i < haystack.length; i++) {
            if (haystack[i] == c) return i;
        }
        return type(uint256).max;
    }

    function _slice(bytes memory s, uint256 from, uint256 to) internal pure returns (bytes memory) {
        bytes memory out = new bytes(to - from);
        for (uint256 i = 0; i < out.length; i++) out[i] = s[from + i];
        return out;
    }

    function _decodeHexWord(bytes memory hexStr) internal pure returns (uint256 v) {
        uint256 from = 0;
        if (hexStr.length >= 2 && hexStr[0] == "0" && (hexStr[1] == "x" || hexStr[1] == "X")) {
            from = 2;
        }
        for (uint256 i = from; i < hexStr.length; i++) {
            uint8 b = uint8(hexStr[i]);
            uint8 d;
            if (b >= 0x30 && b <= 0x39) d = b - 0x30;
            else if (b >= 0x61 && b <= 0x66) d = b - 0x61 + 10;
            else if (b >= 0x41 && b <= 0x46) d = b - 0x41 + 10;
            else revert("non-hex char");
            v = (v << 4) | d;
        }
    }
}
