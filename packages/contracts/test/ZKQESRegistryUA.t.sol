// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IZKQESRegistry} from "../src/IZKQESRegistry.sol";
import {ZKQESRegistryUA} from "../src/ZKQESRegistryUA.sol";
import {Groth16VerifierV5_2Placeholder} from "../src/Groth16VerifierV5_2Placeholder.sol";
import {Groth16AgeVerifierUAStub} from "../src/Groth16AgeVerifierUAStub.sol";
import {P256Verify} from "../src/libs/P256Verify.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";

/// @notice V5.4 ZKQESRegistryUA tests. Scope (per plan §Task 3 +
///         lead-confirmed scope narrowing): V5.4-NEW gates only.
///
///         V5.2-ported gate semantics (BadProof / BadSignedAttrs /
///         BadLeaf|IntSpki / BadLeaf|IntSig / BadTrustList / BadPolicy /
///         StaleBinding / FutureBinding / WalletDerivationMismatch /
///         WrongRegisterModeNoOp / BindingPkLimbOutOfRange) are NOT
///         re-tested here — they are exercised by V5.2's own suite at
///         `ZkqesRegistryV5_2.t.sol`, and the V5.4 port is mechanical.
///         Phase B integration tests in T4/T5 smoke them end-to-end
///         against real ceremonied verifiers.
///
///         V5.4-NEW gates this file covers:
///           - register: bindingId derivation
///                       (`keccak256(abi.encode("UA", identityFingerprint))`),
///                       `dobSupported = 1` write, `dobCommit = 0` write,
///                       `algorithmTag != 0 → BadProof` early-fire gate.
///           - proveAge: happy path + 8 reject paths per plan.
contract ZKQESRegistryUATest is Test {
    ZKQESRegistryUA internal registry;
    Groth16VerifierV5_2Placeholder internal idVerifier;
    Groth16AgeVerifierUAStub internal ageStub;

    address internal admin = address(0xA1);
    address internal holder;

    bytes32 internal initialTrustRoot  = bytes32(uint256(0xA));
    bytes32 internal initialPolicyRoot = bytes32(uint256(0xB));

    bytes internal leafSpki;
    bytes internal intSpki;
    uint256 internal baselineLeafSpkiCommit;
    uint256 internal baselineIntSpkiCommit;

    bytes internal constant BASELINE_SIGNED_ATTRS = "";

    bytes32[16] internal emptyZ;
    bytes32[16] internal baselineTrustPath;
    bytes32     internal baselineTrustRoot;
    bytes32[16] internal baselinePolicyPath;
    bytes32     internal baselinePolicyRoot;
    uint256 internal constant BASELINE_POLICY_LEAF_HASH = uint256(0xC0FFEE);

    /// V5.4 reuses V5.2's baseline pk-limb pattern. The derived `holder`
    /// address is computed in setUp via the same keccak path the
    /// contract uses (`_deriveAddrFromBindingLimbs`).
    uint256 internal constant BASELINE_PKX_HI = 0x10000000000000000000000000000001;
    uint256 internal constant BASELINE_PKX_LO = 0x20000000000000000000000000000002;
    uint256 internal constant BASELINE_PKY_HI = 0x30000000000000000000000000000003;
    uint256 internal constant BASELINE_PKY_LO = 0x40000000000000000000000000000004;

    /// Stable per-test identity fingerprint (slot 13 of LeafProof).
    /// `keccak("v54-test-fp")` keeps this deterministic across runs.
    uint256 internal constant BASELINE_FP = uint256(
        0x4ddc8e98e8a2bba0d1b41cbe9aa11d6dba0b900027316a4cd1d0bf76b88c0bdc
    );
    /// keccak256("v54-test-fp") computed off-line; pinned here so tests
    /// don't recompute. If you change the seed string, update this too.
    bytes32 internal constant BASELINE_FP_SEED = keccak256("v54-test-fp");

    address internal constant P256_PRECOMPILE = address(0x0000000000000000000000000000000000000100);

    function _mockP256AcceptAll() internal {
        vm.mockCall(P256_PRECOMPILE, "", abi.encode(uint256(1)));
    }

    function setUp() public {
        vm.warp(2_000_000_000);

        idVerifier = new Groth16VerifierV5_2Placeholder();
        ageStub    = new Groth16AgeVerifierUAStub();
        registry = new ZKQESRegistryUA(
            initialTrustRoot,
            initialPolicyRoot,
            address(idVerifier),
            address(ageStub),
            admin
        );

        holder = _addrFromLimbs(BASELINE_PKX_HI, BASELINE_PKX_LO, BASELINE_PKY_HI, BASELINE_PKY_LO);

        leafSpki = vm.readFileBinary(
            "./packages/contracts/test/fixtures/v5/admin-ecdsa/leaf-spki.bin"
        );
        require(leafSpki.length == 91, "leafSpki fixture length");
        intSpki = leafSpki;

        baselineLeafSpkiCommit = P256Verify.spkiCommit(
            leafSpki, registry.poseidonT3(), registry.poseidonT7()
        );
        baselineIntSpkiCommit = baselineLeafSpkiCommit;

        emptyZ = _readEmptySubtreeRoots();

        for (uint256 i = 0; i < 16; i++) baselineTrustPath[i] = emptyZ[i];
        uint256 cur = baselineIntSpkiCommit;
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

    /// @dev Mirror of `ZKQESRegistryUA._deriveAddrFromBindingLimbs`.
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

    /// @dev Build a baseline `LeafProof` for `sender`. The derived address
    ///      from the constant baseline pk limbs MUST equal `sender` for
    ///      register() to pass — callers should use `holder` (the derived
    ///      baseline address) unless explicitly testing a mismatch.
    ///      Field-by-field assignment avoids the Yul-IR stack-too-deep
    ///      that struck V5.1 at uint[19] (commit `04b4a71`).
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
        p.leafSpkiCommit        = baselineLeafSpkiCommit;
        p.intSpkiCommit         = baselineIntSpkiCommit;
        p.identityFingerprint   = uint256(BASELINE_FP_SEED);
        p.identityCommitment    = uint256(keccak256("v54-test-commit"));
        p.rotationMode          = 0;                              // register mode
        p.rotationOldCommitment = p.identityCommitment;            // no-op bind
        p.rotationNewWallet     = uint256(uint160(sender));       // V5.2 register-mode no-op
        p.bindingPkXHi          = BASELINE_PKX_HI;
        p.bindingPkXLo          = BASELINE_PKX_LO;
        p.bindingPkYHi          = BASELINE_PKY_HI;
        p.bindingPkYLo          = BASELINE_PKY_LO;
    }

    function _baselineChainProof(IZKQESRegistry.LeafProof memory leafProof)
        internal view returns (IZKQESRegistry.ChainProof memory c)
    {
        c.rTL            = uint256(baselineTrustRoot);
        c.algorithmTag   = 0;
        c.leafSpkiCommit = leafProof.leafSpkiCommit;
    }

    /// @dev Compute the canonical bindingId for the test fingerprint (=
    ///      what register() will derive on success). Mirrors the contract
    ///      formula `keccak256(abi.encode("UA", identityFingerprint))`.
    function _expectedBindingId(uint256 identityFingerprint)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode("UA", identityFingerprint));
    }

    function _callRegister(
        IZKQESRegistry.ChainProof memory chainProof,
        IZKQESRegistry.LeafProof  memory leafProof
    ) internal returns (bytes32 bindingId) {
        bytes32[2] memory leafSig;
        bytes32[2] memory intSig;
        vm.prank(holder);
        bindingId = registry.register(
            chainProof, leafProof,
            leafSpki, intSpki, BASELINE_SIGNED_ATTRS,
            leafSig, intSig,
            baselineTrustPath, 0,
            baselinePolicyPath, 0
        );
    }

    /// @dev Standard sample-binding setup for proveAge tests. Returns
    ///      the bindingId of the produced binding.
    function _registerSampleBinding() internal returns (bytes32 bindingId) {
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        bindingId = _callRegister(cp, lp);
    }

    /// @dev Build a baseline proveAge proof against `bindingId` and `cutoff`.
    ///      `nullifierCtx` is computed exactly the same way the contract
    ///      cross-checks it (orchestration §1.4 frozen ProtocolBytes
    ///      literal).
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
        )));
    }

    /* ================ Constructor ================ */

    function test_constructor_reverts_onZeroIdentityVerifier() public {
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(0), address(ageStub), admin
        );
    }

    function test_constructor_reverts_onZeroAgeVerifier() public {
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(idVerifier), address(0), admin
        );
    }

    function test_constructor_reverts_onZeroAdmin() public {
        vm.expectRevert(ZKQESRegistryUA.ZeroAddress.selector);
        new ZKQESRegistryUA(
            initialTrustRoot, initialPolicyRoot,
            address(idVerifier), address(ageStub), address(0)
        );
    }

    function test_constructor_setsImmutables() public view {
        assertEq(address(registry.identityVerifierImpl()), address(idVerifier), "identityVerifier");
        assertEq(address(registry.ageVerifierImpl()),      address(ageStub),    "ageVerifier");
        assertEq(registry.admin(),                         admin,               "admin");
        assertEq(registry.trustedRoot(),                   baselineTrustRoot,   "trustedRoot post setTrustedRoot");
        assertEq(registry.policyRoot(),                    baselinePolicyRoot,  "policyRoot post setPolicyRoot");
        assertEq(registry.country(),                       "UA",                "country");
    }

    /* ================ register — V5.4-specific ================ */

    function test_register_happyPath_writesV54Binding() public {
        bytes32 bindingId = _registerSampleBinding();

        // bindingId derivation: keccak(abi.encode("UA", identityFingerprint))
        assertEq(
            bindingId,
            _expectedBindingId(uint256(BASELINE_FP_SEED)),
            "bindingId derivation"
        );

        IZKQESRegistry.Binding memory b = registry.getBinding(bindingId);
        assertEq(b.pk,             holder,                          "binding.pk");
        assertEq(b.dobSupported,   1,                               "dobSupported = 1 (UA / Diia carries DOB)");
        assertEq(b.dobCommit,      0,                               "dobCommit = 0 (V5.4 default-private posture)");
        assertEq(b.revoked,        false,                           "revoked = false");
        assertEq(b.nullifier,      0xDEADBEEF,                      "nullifier (first-claim write-once)");
        assertEq(b.timestamp,      block.timestamp,                 "registration timestamp");
        assertEq(b.policyLeafHash, BASELINE_POLICY_LEAF_HASH,       "policyLeafHash mirrored");

        // ageProvenCutoffs not yet populated.
        assertFalse(registry.ageProvenCutoffs(bindingId, 20070101), "ageProvenCutoffs starts empty");
    }

    function test_register_revertsBadProof_whenAlgorithmTagNotZero() public {
        // V5.4 single-algorithm: ChainProof.algorithmTag MUST be 0.
        // Forward-compat slot for V5.5+ pluggability — non-zero tag
        // should revert BadProof early (Gate 0b).
        IZKQESRegistry.LeafProof  memory lp = _baselineLeafProof(holder);
        IZKQESRegistry.ChainProof memory cp = _baselineChainProof(lp);
        cp.algorithmTag = 1;  // simulate a V5.5+ tag

        bytes32[2] memory leafSig;
        bytes32[2] memory intSig;
        vm.expectRevert(ZKQESRegistryUA.BadProof.selector);
        vm.prank(holder);
        registry.register(
            cp, lp,
            leafSpki, intSpki, BASELINE_SIGNED_ATTRS,
            leafSig, intSig,
            baselineTrustPath, 0,
            baselinePolicyPath, 0
        );
    }

    /* ================ proveAge happy ================ */

    function test_proveAge_happyPath_setsCutoffSeen() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        // Pre: not seen yet.
        assertFalse(registry.ageProvenCutoffs(bindingId, cutoff));

        bool ok = registry.proveAge(bindingId, cutoff, p);

        assertTrue(ok, "proveAge returns true");
        assertTrue(registry.ageProvenCutoffs(bindingId, cutoff), "ageProvenCutoffs[id][cutoff] set");
    }

    /* ================ proveAge — 8 reject paths ================ */

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

        // Admin revokes via setRevoked (preserves all binding slots).
        vm.prank(admin);
        registry.setRevoked(bindingId, true);

        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        vm.expectRevert(ZKQESRegistryUA.BindingRevoked.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsDobNotAvailable() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;

        // Force `dobSupported = 0` directly via storage. UA's register()
        // always sets dobSupported = 1 (Diia carries DOB), so to exercise
        // the DobNotAvailable path we vm.store a 0 into the packed slot.
        // This simulates a V5.5+ non-DOB country binding, exercising the
        // contract gate per spec §3.4.
        _setDobSupportedZero(bindingId);

        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        vm.expectRevert(ZKQESRegistryUA.DobNotAvailable.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsInvalidAgeCutoff_belowMin() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 18000101;  // below 19000101 floor
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        vm.expectRevert(ZKQESRegistryUA.InvalidAgeCutoff.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsInvalidAgeCutoff_aboveMax() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 100000101;  // above 99991231 ceiling
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        vm.expectRevert(ZKQESRegistryUA.InvalidAgeCutoff.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsAgeNotQualified() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        p.ageQualified = 0;  // proof says NOT qualified

        vm.expectRevert(ZKQESRegistryUA.AgeNotQualified.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsAgeCutoffMismatch() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoffArg = 20070101;
        // Build proof against a DIFFERENT cutoff; arg vs proof mismatch.
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, 20060101);

        vm.expectRevert(ZKQESRegistryUA.AgeCutoffMismatch.selector);
        registry.proveAge(bindingId, cutoffArg, p);
    }

    function test_proveAge_revertsAgeNullifierContextMismatch() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);
        // Tamper the nullifierCtx — derivation no longer matches contract
        // recompute (orchestration §1.4 frozen formula).
        unchecked { p.nullifierCtx = p.nullifierCtx + 1; }

        vm.expectRevert(ZKQESRegistryUA.AgeNullifierContextMismatch.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    function test_proveAge_revertsInvalidAgeProof_whenStubRejects() public {
        bytes32 bindingId = _registerSampleBinding();
        uint256 cutoff = 20070101;
        IZKQESRegistry.AgeProof memory p = _baselineAgeProof(bindingId, cutoff);

        // Flip the stub's internal flag so verifyProof returns false —
        // exercises the InvalidAgeProof path WITHOUT vm.mockCall.
        ageStub.setStubReturn(false);

        vm.expectRevert(ZKQESRegistryUA.InvalidAgeProof.selector);
        registry.proveAge(bindingId, cutoff, p);
    }

    /* ================ Internal storage helpers ================ */

    /// @dev Force `bindings[bindingId].dobSupported = 0` via direct
    ///      storage write. Used by the `revertsDobNotAvailable` test
    ///      because UA's register() always writes `dobSupported = 1`.
    ///      Computes the storage slot per Solidity layout: `bindings`
    ///      mapping is at slot 3 (after `trustedRoot, policyRoot, admin`).
    ///      Within `Binding`, `dobSupported` (uint8) + `revoked` (bool)
    ///      pack into slot offset 5 (pk=0, ctxHash=1, policyLeafHash=2,
    ///      timestamp=3, dobCommit=4). dobSupported is at byte 0 of that
    ///      slot, revoked at byte 1.
    function _setDobSupportedZero(bytes32 bindingId) internal {
        // Slot of bindings[bindingId] base = keccak(abi.encode(key, slot)).
        // `bindings` is the FIRST mapping (slot index = 3, after trustedRoot
        // + policyRoot + admin which take slots 0-2).
        bytes32 base    = keccak256(abi.encode(bindingId, uint256(3)));
        bytes32 packSlot = bytes32(uint256(base) + 5);
        bytes32 cur      = vm.load(address(registry), packSlot);
        // Clear the low byte (dobSupported); preserve byte 1 (revoked).
        bytes32 next     = bytes32(uint256(cur) & ~uint256(0xff));
        vm.store(address(registry), packSlot, next);
    }

    /// Mirror of ZkqesRegistryV5_2's _readEmptySubtreeRoots — keeps tests
    /// self-contained without bleeding internal fixture loaders across
    /// files. (Identical implementation; merkle.json is V5-static.)
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
