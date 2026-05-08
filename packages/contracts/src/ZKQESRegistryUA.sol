// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

import {IZKQESRegistry} from "./IZKQESRegistry.sol";
import {IGroth16AgeVerifier} from "./Groth16AgeVerifierUAStub.sol";
import {Poseidon} from "./libs/Poseidon.sol";
import {P256Verify} from "./libs/P256Verify.sol";
import {PoseidonMerkle} from "./libs/PoseidonMerkle.sol";

/// @notice V5.3 22-input leaf+chain identity verifier ABI. Matches the
///         existing `Groth16VerifierV5_2{Placeholder,Stub}` interface
///         since V5.3 amended V5.2 in-place without changing the
///         public-signal vector size (still 22). Phase A unit tests
///         use `Groth16VerifierV5_2Placeholder.sol` (always-true);
///         Phase C swaps in the post-ceremony real verifier per
///         orchestration §1.7.
interface IGroth16VerifierV5_3 {
    function verifyProof(
        uint256[2]    calldata a,
        uint256[2][2] calldata b,
        uint256[2]    calldata c,
        uint256[22]   calldata input
    ) external view returns (bool);
}

/// @title  ZKQESRegistryUA — Ukrainian per-country ZKQES registry (V5.4).
/// @notice Implements the frozen `IZKQESRegistry` interface. Per-country
///         deploy: one registry instance per supported eIDAS country.
///         UA = first instance; V5.5+ adds country #2 against the same
///         interface.
///
/// @dev    Architecture (per spec §2.1):
///           - `identityVerifier` (immutable) — V5.3 22-input Groth16
///             verifier (chain+leaf unified circuit, country-agnostic).
///           - `ageVerifier` (immutable) — V5.4 3-input AgeDiiaUA
///             verifier (UA-specific Tier-2 Diia DOB encoding).
///           - On-chain chain verification (P-256 verify of intermediate
///             cert + Poseidon Merkle climb of trust-list membership),
///             ported verbatim from `ZkqesRegistryV5_2` — the V5.4
///             interface revision dropped the brainstorm-draft "ChainProof
///             Groth16 tuple" and reverted to V5.2's on-chain pattern.
///
/// @dev    Schema migration from V5.2 (per spec §3.2):
///           - V5.2 `identityWallets[fp] => address`
///             + `identityCommitments[fp] => bytes32`
///             + `nullifierOf[wallet] => bytes32`
///             COLLAPSE INTO
///           - V5.4 `bindings[bindingId] => Binding` (single struct,
///             keyed by `bindingId = keccak256(abi.encode("UA",
///             leafProof.identityFingerprint))`).
///           - V5.2 `usedCtx[fp][ctxKey] => bool`
///             COLLAPSE INTO
///           - V5.4 `usedNullifiers[nullifier] => bool` — V5.1 nullifier
///             is `Poseidon₂(walletSecret, ctxHash)`, so per-nullifier
///             uniqueness is a tighter guarantee than per-(fp, ctxKey)
///             uniqueness (binds the wallet secret too).
///         Two V5.2-only invariants are RELAXED in V5.4 because the
///         backing storage isn't carried forward:
///           - V5.1 invariant 5 (wallet uniqueness across rotation —
///             no wallet holds two distinct identities) is dropped:
///             V5.4 has no wallet→bindingId reverse mapping. Lifting
///             the invariant is acceptable because the rotation
///             ECDSA-auth gate already binds rotateWallet to the
///             previously-bound wallet's privkey.
///           - V5.2 `CommitmentMismatch` rotateWallet stale-state check
///             (`identityCommitments[fp] == sig.rotationOldCommitment`)
///             is dropped: V5.4 has no commitment slot. Stale-state risk
///             is bounded by the rotation auth sig's domain-bound
///             payload (chainid + registry addr + bindingId + newWallet)
///             and the in-circuit `rotationOldCommitment ===
///             identityCommitment` no-op (per V5.1 ForceEqualIfEnabled).
///
/// @dev    Both verifier slots are `immutable`. Verifier rotation =
///         fresh registry redeploy + new `fixtures/contracts/<chain>.json`
///         pump (no in-place setter exists). Same posture as
///         `ZkqesRegistryV5_2`.
contract ZKQESRegistryUA is IZKQESRegistry {
    /* ---------- constants ---------- */

    /// @notice ISO 3166-1 alpha-2 country code. Lifecycle-frozen at
    ///         deploy; baked into `bindingId` derivation so per-country
    ///         registries can never collide on the same identity
    ///         fingerprint.
    string public constant override country = "UA";

    /// @notice Source-version tag for off-chain inspection.
    string public constant VERSION = "ZKQES/V5.6";

    /// @notice Maximum acceptable proof-binding age. Proofs whose
    ///         `leafProof.timestamp` is older than `block.timestamp -
    ///         MAX_BINDING_AGE` revert `StaleBinding`. Mirrors V5.2.
    uint256 public constant MAX_BINDING_AGE = 1 hours;

    /* ---------- immutables ---------- */

    IGroth16VerifierV5_3 public immutable identityVerifierImpl;
    IGroth16AgeVerifier  public immutable ageVerifierImpl;

    /// @notice Pre-deployed Poseidon contract addresses, passed to the
    ///         constructor. V5.4 deviation from V5.2: V5.2 CREATE-deployed
    ///         T3 + T7 inside its constructor by inlining their initcodes
    ///         as `PoseidonBytecode` library constants. That added ~33 KB
    ///         to the registry's own initcode and tipped V5.4 over Base
    ///         Sepolia's effective `MAX_INITCODE_SIZE` ceiling at deploy
    ///         time (V5.2 squeaked under at 40,157 bytes; V5.4's +1.5 KB
    ///         of new surface-area pushed it to 41,630 bytes which the
    ///         public Base Sepolia RPC rejected with
    ///         `error code -32000: max initcode size exceeded`).
    ///         Pre-deploy + pass-as-args keeps the registry's own
    ///         initcode under ~9 KB and is the canonical Solidity
    ///         library-deploy pattern.
    address public immutable poseidonT3;
    address public immutable poseidonT7;

    /* ---------- mutable admin state ---------- */

    bytes32 public override trustedRoot;
    bytes32 public override policyRoot;
    address public admin;

    /* ---------- mappings ---------- */

    mapping(bytes32 => Binding) public bindings;
    mapping(uint256 => bool)    public usedNullifiers;
    mapping(bytes32 => mapping(uint256 => bool)) public override ageProvenCutoffs;

    /* ---------- errors (V5.4-NEW + V5.2-port + admin) ---------- */

    /* register — V5.2 port + V5.6 unified-register */
    error WrongMode();
    error WalletDerivationMismatch();
    error WrongRegisterModeNoOp();
    error BindingPkLimbOutOfRange();
    error BadProof();
    error BadSignedAttrsHi();
    error BadSignedAttrsLo();
    error BadLeafSpki();
    error BadIntSpki();
    error BadLeafSig();
    error BadIntSig();
    error BadTrustList();
    error BadPolicy();
    error StaleBinding();
    error FutureBinding();
    error NullifierUsed();          // V5.6: cross-identity nullifier reuse on first-claim

    /* proveAge — V5.4 NEW (silent reverts; no string interpolation —
       eliminates revert-string side-channel risk per spec §3.3) */
    error BindingNotFound();
    error BindingRevoked();
    error DobNotAvailable();
    error InvalidAgeCutoff();
    error AgeNotQualified();
    error AgeCutoffMismatch();
    error AgeNullifierContextMismatch();
    error InvalidAgeProof();

    /* admin */
    error OnlyAdmin();
    error ZeroAddress();
    error PoseidonDeployFailed();

    /* ---------- events (admin-only; user-facing events declared in interface) ---------- */

    event TrustedRootRotated(bytes32 indexed prev, bytes32 indexed next, address rotatedBy);
    event PolicyRootRotated (bytes32 indexed prev, bytes32 indexed next, address rotatedBy);
    event BindingRevoke     (bytes32 indexed bindingId, bool revoked, address rotatedBy);
    event AdminTransferred  (address indexed prev, address indexed next);

    /* ---------- modifiers ---------- */

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    /* ---------- constructor ---------- */

    /// @param _trustedRoot       Initial eIDAS trust-list Poseidon root.
    /// @param _policyRoot        Initial policy-list Poseidon root.
    /// @param _identityVerifier  V5.3 22-input identity verifier address.
    /// @param _ageVerifier       V5.4 UA age verifier address.
    /// @param _admin             Initial admin (rotateRoots + setRevoked + transferAdmin).
    /// @param _poseidonT3        Pre-deployed circomlibjs PoseidonT3 contract.
    ///                            Caller (deploy script) deploys via
    ///                            `Poseidon.deploy(PoseidonBytecode.t3Initcode())`
    ///                            BEFORE invoking this constructor.
    /// @param _poseidonT7        Pre-deployed circomlibjs PoseidonT7 contract.
    constructor(
        bytes32 _trustedRoot,
        bytes32 _policyRoot,
        address _identityVerifier,
        address _ageVerifier,
        address _admin,
        address _poseidonT3,
        address _poseidonT7
    ) {
        if (_identityVerifier == address(0)) revert ZeroAddress();
        if (_ageVerifier      == address(0)) revert ZeroAddress();
        if (_admin            == address(0)) revert ZeroAddress();
        if (_poseidonT3       == address(0)) revert ZeroAddress();
        if (_poseidonT7       == address(0)) revert ZeroAddress();

        trustedRoot = _trustedRoot;
        policyRoot  = _policyRoot;
        identityVerifierImpl = IGroth16VerifierV5_3(_identityVerifier);
        ageVerifierImpl      = IGroth16AgeVerifier(_ageVerifier);
        admin = _admin;
        poseidonT3 = _poseidonT3;
        poseidonT7 = _poseidonT7;
    }

    /* ---------- IZKQESRegistry view fns ---------- */

    /// @inheritdoc IZKQESRegistry
    function identityVerifier() external view override returns (address) {
        return address(identityVerifierImpl);
    }

    /// @inheritdoc IZKQESRegistry
    function ageVerifier() external view override returns (address) {
        return address(ageVerifierImpl);
    }

    /// @inheritdoc IZKQESRegistry
    function getBinding(bytes32 id) external view override returns (Binding memory) {
        return bindings[id];
    }

    /* ---------- admin ---------- */

    function setTrustedRoot(bytes32 newRoot) external onlyAdmin {
        emit TrustedRootRotated(trustedRoot, newRoot, msg.sender);
        trustedRoot = newRoot;
    }

    function setPolicyRoot(bytes32 newRoot) external onlyAdmin {
        emit PolicyRootRotated(policyRoot, newRoot, msg.sender);
        policyRoot = newRoot;
    }

    /// @notice Admin-only revocation. Sets `Binding.revoked`; subsequent
    ///         `proveAge` calls revert `BindingRevoked`. The binding's
    ///         other slots (pk, nullifier, ctxHash, etc.) are preserved
    ///         so off-chain consumers can still cross-reference the
    ///         revoked binding.
    function setRevoked(bytes32 bindingId, bool revoked_) external onlyAdmin {
        bindings[bindingId].revoked = revoked_;
        emit BindingRevoke(bindingId, revoked_, msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /* ---------- register() — V5.2 port + V5.4 schema ---------- */

    /// @inheritdoc IZKQESRegistry
    function register(
        ChainProof  calldata chainProof,
        LeafProof   calldata leafProof,
        bytes       calldata leafSpki,
        bytes       calldata intSpki,
        bytes       calldata signedAttrs,
        bytes32[2]  calldata leafSig,
        bytes32[2]  calldata intSig,
        bytes32[16] calldata trustMerklePath,
        uint256              trustMerklePathBits,
        bytes32[16] calldata policyMerklePath,
        uint256              policyMerklePathBits
    ) external override returns (bytes32 bindingId) {
        return _register(
            msg.sender,
            chainProof, leafProof,
            leafSpki, intSpki, signedAttrs,
            leafSig, intSig,
            trustMerklePath, trustMerklePathBits,
            policyMerklePath, policyMerklePathBits
        );
    }

    /// @dev Internal register entry point — takes the caller as an
    ///      explicit argument so `registerWithAge` can call it without
    ///      bouncing through an external `this.register(...)` (which
    ///      would re-set msg.sender to address(this) and break the
    ///      WalletDerivationMismatch gate).
    function _register(
        address              caller,
        ChainProof  calldata chainProof,
        LeafProof   calldata leafProof,
        bytes       calldata leafSpki,
        bytes       calldata intSpki,
        bytes       calldata signedAttrs,
        bytes32[2]  calldata leafSig,
        bytes32[2]  calldata intSig,
        bytes32[16] calldata trustMerklePath,
        uint256              trustMerklePathBits,
        bytes32[16] calldata policyMerklePath,
        uint256              policyMerklePathBits
    ) internal returns (bytes32 bindingId) {
        /* ===== Gate 0: mode gate ===== */
        if (leafProof.rotationMode != 0) revert WrongMode();

        /* ===== Gate 2a-prime: keccak-derive caller from binding-pk limbs ===== */
        // V5.2 keccak-on-chain port. Reconstructs the 64-byte uncompressed
        // secp256k1 wallet pubkey from the 4×128-bit limbs (slots 18..21,
        // big-endian), runs keccak256[12:32] to derive an Ethereum address.
        address derivedAddr = _deriveAddrFromBindingLimbs(leafProof);
        if (derivedAddr != caller) revert WalletDerivationMismatch();

        // V5.2 register-mode rotation no-op gate.
        if (leafProof.rotationNewWallet != uint256(uint160(caller))) {
            revert WrongRegisterModeNoOp();
        }

        /* ===== Gate 0b: ChainProof bind-values cross-check ===== */
        // V5.4 NEW (vs V5.2): the caller-supplied ChainProof claims a
        // (rTL, leafSpkiCommit) tuple that MUST match the registry's
        // current state + the leaf proof's slot-11 leafSpkiCommit.
        // `algorithmTag` is forward-compat for V5.5+ leaf-algorithm
        // pluggability — bind it to `0` for now (single algorithm in
        // V5.4) so a future proof carrying a non-zero tag fails fast.
        if (chainProof.rTL            != uint256(trustedRoot))     revert BadTrustList();
        if (chainProof.leafSpkiCommit != leafProof.leafSpkiCommit) revert BadLeafSpki();
        if (chainProof.algorithmTag   != 0)                        revert BadProof();

        /* ===== Gate 1: Groth16 verify ===== */
        uint256[22] memory input = _packPublicSignals(leafProof);
        if (!identityVerifierImpl.verifyProof(leafProof.a, leafProof.b, leafProof.c, input)) {
            revert BadProof();
        }

        /* ===== Gate 2a: bind public-input commits to calldata ===== */
        {
            bytes32 saHash = sha256(signedAttrs);
            uint256 saHi = uint256(saHash) >> 128;
            uint256 saLo = uint256(saHash) & ((uint256(1) << 128) - 1);
            if (saHi != leafProof.signedAttrsHashHi) revert BadSignedAttrsHi();
            if (saLo != leafProof.signedAttrsHashLo) revert BadSignedAttrsLo();
        }

        if (P256Verify.spkiCommit(leafSpki, poseidonT3, poseidonT7) != leafProof.leafSpkiCommit) {
            revert BadLeafSpki();
        }
        if (P256Verify.spkiCommit(intSpki, poseidonT3, poseidonT7) != leafProof.intSpkiCommit) {
            revert BadIntSpki();
        }

        /* ===== Gate 2b: 2× P256Verify (leaf + intermediate) ===== */
        if (!P256Verify.verifyWithSpki(leafSpki, sha256(signedAttrs), leafSig)) {
            revert BadLeafSig();
        }
        bytes32 leafTbsHash = bytes32(
            (leafProof.leafTbsHashHi << 128) | leafProof.leafTbsHashLo
        );
        if (!P256Verify.verifyWithSpki(intSpki, leafTbsHash, intSig)) {
            revert BadIntSig();
        }

        /* ===== Gate 3: trust-list Merkle membership ===== */
        if (!PoseidonMerkle.verify(
            poseidonT3,
            bytes32(leafProof.intSpkiCommit),
            trustMerklePath,
            trustMerklePathBits,
            trustedRoot
        )) {
            revert BadTrustList();
        }

        /* ===== Gate 4: policy-list Merkle membership ===== */
        if (!PoseidonMerkle.verify(
            poseidonT3,
            bytes32(leafProof.policyLeafHash),
            policyMerklePath,
            policyMerklePathBits,
            policyRoot
        )) {
            revert BadPolicy();
        }

        /* ===== Gate 5: timing ===== */
        if (leafProof.timestamp > block.timestamp) revert FutureBinding();
        if (block.timestamp - leafProof.timestamp > MAX_BINDING_AGE) revert StaleBinding();

        /* ===== Gate 6/7: binding-write — first-claim or rebind ===== */
        // V5.6 unified-register: bindingId = keccak(country,
        // identityFingerprint), stable across wallet swaps. A valid
        // proof for the same fingerprint authorizes rebinding to the
        // current msg.sender — no separate rotateWallet entry point.
        bindingId = keccak256(abi.encode(country, leafProof.identityFingerprint));

        Binding storage b = bindings[bindingId];

        uint256 ctxHash = (leafProof.ctxHashHi << 128) | leafProof.ctxHashLo;
        uint256 nullifier = leafProof.nullifier;
        address oldPk = b.pk;

        if (oldPk == address(0)) {
            // ----- First-claim path -----
            // Cross-identity nullifier reuse guard: each binding's
            // first-claim nullifier must be globally unique. Subsequent
            // rebinds intentionally reuse the same first-claim
            // nullifier (V5.1 write-once invariant), so the
            // usedNullifiers check is gated on the first-claim branch.
            if (usedNullifiers[nullifier]) revert NullifierUsed();

            b.pk             = caller;
            b.ctxHash        = ctxHash;
            b.policyLeafHash = leafProof.policyLeafHash;
            b.timestamp      = block.timestamp;
            b.dobCommit      = 0;             // spec §3.4 — default-private posture
            b.dobSupported   = 1;             // UA: Diia carries DOB
            b.revoked        = false;
            b.nullifier      = nullifier;     // first-claim write-once

            usedNullifiers[nullifier] = true;

            emit BindingRegistered(bindingId, caller, ctxHash);
        } else {
            // ----- Rebind path (V5.6 unified-register) -----
            // Authorization is the proof itself: same identityFingerprint
            // means same QES-anchored identity, and the proof's
            // structural validity was already verified above.
            if (b.revoked) revert BindingRevoked();

            // Refresh wallet-and-context fields. Nullifier and the
            // first-claim write-once invariant are preserved — the
            // identity's anti-Sybil anchor doesn't change on rebind.
            b.pk             = caller;
            b.ctxHash        = ctxHash;
            b.policyLeafHash = leafProof.policyLeafHash;
            b.timestamp      = block.timestamp;
            // ageProvenCutoffs[bindingId][*] persists across rebinds —
            // proven cutoffs are properties of the QES-anchored
            // identity, not of any wallet that proved them.

            if (oldPk != caller) {
                emit BindingRebound(bindingId, oldPk, caller);
            }
        }
    }

    /* ---------- registerWithAge() — V5.6 atomic register + proveAge ---------- */

    /// @inheritdoc IZKQESRegistry
    function registerWithAge(
        ChainProof  calldata chainProof,
        LeafProof   calldata leafProof,
        bytes       calldata leafSpki,
        bytes       calldata intSpki,
        bytes       calldata signedAttrs,
        bytes32[2]  calldata leafSig,
        bytes32[2]  calldata intSig,
        bytes32[16] calldata trustMerklePath,
        uint256              trustMerklePathBits,
        bytes32[16] calldata policyMerklePath,
        uint256              policyMerklePathBits,
        uint256              ageCutoffDate,
        AgeProof    calldata ageProof
    ) external override returns (bytes32 bindingId, bool ageOk) {
        bindingId = _register(
            msg.sender,
            chainProof, leafProof,
            leafSpki, intSpki, signedAttrs,
            leafSig, intSig,
            trustMerklePath, trustMerklePathBits,
            policyMerklePath, policyMerklePathBits
        );
        ageOk = _proveAge(msg.sender, bindingId, ageCutoffDate, ageProof);
    }

    /* ---------- proveAge() — V5.4 NEW ---------- */

    /// @inheritdoc IZKQESRegistry
    /// @dev Verbatim from spec §3.3, with `ageVerifier.verifyProof`
    ///      adapted to the snarkjs-style ABI (the spec snippet's
    ///      `ageVerifier.verifyProof(proof)` is shorthand for the
    ///      4-arg call below). Silent reverts (no string interpolation)
    ///      eliminate the revert-string side-channel risk.
    function proveAge(
        bytes32          bindingId,
        uint256          ageCutoffDate,
        AgeProof  calldata proof
    ) external override returns (bool) {
        return _proveAge(msg.sender, bindingId, ageCutoffDate, proof);
    }

    /// @dev Internal proveAge entry point — takes the prover address as
    ///      an explicit argument so `registerWithAge` can call it
    ///      without the AgeProven event recording address(this) as the
    ///      prover.
    function _proveAge(
        address          prover,
        bytes32          bindingId,
        uint256          ageCutoffDate,
        AgeProof  calldata proof
    ) internal returns (bool) {
        Binding memory b = bindings[bindingId];
        if (b.pk == address(0))   revert BindingNotFound();
        if (b.revoked)            revert BindingRevoked();
        if (b.dobSupported != 1)  revert DobNotAvailable();

        // Range-check cutoff to plausible birth-window — policy-abuse
        // mitigation (orchestration §1.3 frozen contract). Without
        // this, a malicious dApp could binary-search the underlying
        // `dobYmd` via try-multiple-cutoffs.
        if (ageCutoffDate < 19000101 || ageCutoffDate > 99991231) {
            revert InvalidAgeCutoff();
        }

        // Public-signal binding.
        if (proof.ageQualified  != 1)             revert AgeNotQualified();
        if (proof.ageCutoffDate != ageCutoffDate) revert AgeCutoffMismatch();

        // V5.1 nullifier_ctx anti-replay derivation (orchestration §1.4
        // FROZEN ProtocolBytes literal — three sites compute this same
        // hash: circuit (private witness + passthrough public signal),
        // SDK (consumer-supplied via `nullifierCtxKeccak`), this contract).
        uint256 expectedCtx = uint256(keccak256(abi.encodePacked(
            "zkqes-age-ctx-v1", bindingId, ageCutoffDate
        )));
        if (proof.nullifierCtx != expectedCtx) revert AgeNullifierContextMismatch();

        // Pack the 3-input array for the snarkjs verifier ABI. Order
        // MUST match the `AgeDiiaUA` circuit's frozen public-output
        // slot order (orchestration §1.3): [0] ageQualified, [1]
        // ageCutoffDate, [2] nullifierCtx.
        uint256[3] memory input = [proof.ageQualified, proof.ageCutoffDate, proof.nullifierCtx];
        if (!ageVerifierImpl.verifyProof(proof.a, proof.b, proof.c, input)) {
            revert InvalidAgeProof();
        }

        ageProvenCutoffs[bindingId][ageCutoffDate] = true;
        emit AgeProven(bindingId, ageCutoffDate, prover);
        return true;
    }

    /* ---------- helpers ---------- */

    /// @dev Reconstruct the holder's Ethereum address from the V5.2
    ///      keccak-on-chain bindingPk* limbs (slots 18..21, big-endian).
    ///      Verbatim port from `ZkqesRegistryV5_2._deriveAddrFromBindingLimbs`.
    function _deriveAddrFromBindingLimbs(LeafProof calldata leafProof)
        internal pure returns (address)
    {
        uint256 maxLimb = type(uint128).max;
        if (leafProof.bindingPkXHi > maxLimb) revert BindingPkLimbOutOfRange();
        if (leafProof.bindingPkXLo > maxLimb) revert BindingPkLimbOutOfRange();
        if (leafProof.bindingPkYHi > maxLimb) revert BindingPkLimbOutOfRange();
        if (leafProof.bindingPkYLo > maxLimb) revert BindingPkLimbOutOfRange();

        bytes memory pk = abi.encodePacked(
            bytes16(uint128(leafProof.bindingPkXHi)),
            bytes16(uint128(leafProof.bindingPkXLo)),
            bytes16(uint128(leafProof.bindingPkYHi)),
            bytes16(uint128(leafProof.bindingPkYLo))
        );
        return address(uint160(uint256(keccak256(pk))));
    }

    /// @dev Pack `LeafProof`'s 22 named public-signal fields into the
    ///      `uint256[22]` array the V5.3 verifier consumes. Field-by-
    ///      field (vs struct-literal) assignment avoids the Yul-IR
    ///      stack-too-deep that struck V5.1 at uint[19] (`04b4a71`).
    ///      Slot order MUST match the V5.3 frozen public-signal layout.
    function _packPublicSignals(LeafProof calldata leafProof)
        internal pure returns (uint256[22] memory input)
    {
        input[ 0] = leafProof.timestamp;
        input[ 1] = leafProof.nullifier;
        input[ 2] = leafProof.ctxHashHi;
        input[ 3] = leafProof.ctxHashLo;
        input[ 4] = leafProof.bindingHashHi;
        input[ 5] = leafProof.bindingHashLo;
        input[ 6] = leafProof.signedAttrsHashHi;
        input[ 7] = leafProof.signedAttrsHashLo;
        input[ 8] = leafProof.leafTbsHashHi;
        input[ 9] = leafProof.leafTbsHashLo;
        input[10] = leafProof.policyLeafHash;
        input[11] = leafProof.leafSpkiCommit;
        input[12] = leafProof.intSpkiCommit;
        input[13] = leafProof.identityFingerprint;
        input[14] = leafProof.identityCommitment;
        input[15] = leafProof.rotationMode;
        input[16] = leafProof.rotationOldCommitment;
        input[17] = leafProof.rotationNewWallet;
        input[18] = leafProof.bindingPkXHi;
        input[19] = leafProof.bindingPkXLo;
        input[20] = leafProof.bindingPkYHi;
        input[21] = leafProof.bindingPkYLo;
    }

}
