// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

import {IZKQESRegistry} from "./IZKQESRegistry.sol";
import {IGroth16VerifierV5_5} from "./Groth16VerifierV5_5Stub.sol";
import {IGroth16AgeVerifier} from "./Groth16AgeVerifierUAStub.sol";
import {KeyCommit} from "./libs/KeyCommit.sol";
import {HostSig} from "./libs/HostSig.sol";
import {PoseidonMerkle} from "./libs/PoseidonMerkle.sol";

/// @title  ZKQESRegistryUA — Ukrainian per-country ZKQES registry (V7).
/// @notice V7 = V5.5 wire format (21-signal Groth16, KeyCommit leaves,
///         HostSig dispatch, `bytes` signature calldata) + V5.6 features
///         (unified register with rebind branch, atomic registerWithAge,
///         per-country age verifier slot). Spec at
///         `docs/superpowers/specs/2026-05-09-v7-merged-amendment.md`.
///
/// @dev    Architecture (per V7 spec §3.3):
///           - `identityVerifier` (immutable) — V5.5 21-signal Groth16
///             verifier (algorithm-agnostic; KeyCommit leaves; HostSig
///             dispatch). Country-blind at the circuit level.
///           - `ageVerifier` (immutable) — V5.4 3-input AgeDiiaUA
///             verifier (UA-specific Tier-2 Diia DOB encoding).
///           - On-chain chain verification: HostSig.verify of intermediate
///             cert + Poseidon Merkle climb of trust-list membership over
///             KeyCommit-recomputed-on-chain leaf (V5.5 NEW vs V5.4).
///
/// @dev    Per CLAUDE.md "Country identifier privacy" §UA: V7 keeps UA
///         in Bucket A. `identityFingerprint` derivation
///         (`Poseidon₂(subjectSerialPacked, FINGERPRINT_DOMAIN)`) is
///         dictionary-attackable for TINUA-prefixed serials; this is
///         the honest characterization, not a privacy bug.
contract ZKQESRegistryUA is IZKQESRegistry {
    /* ---------- constants ---------- */

    /// @notice ISO 3166-1 alpha-2 country code. Lifecycle-frozen at
    ///         deploy; baked into `bindingId` derivation so per-country
    ///         registries can never collide on the same identity
    ///         fingerprint.
    string public constant override country = "UA";

    /// @notice Source-version tag for off-chain inspection.
    string public constant VERSION = "ZKQES/V7";

    /// @notice Maximum acceptable proof-binding age. Proofs whose
    ///         `leafProof.timestamp` is older than `block.timestamp -
    ///         MAX_BINDING_AGE` revert `StaleBinding`.
    uint256 public constant MAX_BINDING_AGE = 1 hours;

    /* ---------- immutables ---------- */

    IGroth16VerifierV5_5 public immutable identityVerifierImpl;
    IGroth16AgeVerifier  public immutable ageVerifierImpl;

    /// @notice Pre-deployed Poseidon contract addresses, passed to the
    ///         constructor. Pre-deploy + pass-as-args keeps the
    ///         registry's own initcode under the EIP-3860 cap on Base
    ///         Sepolia (V5.4 lesson: embedding ~33 KB Poseidon initcodes
    ///         in the registry constructor pushed total over the limit).
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

    /* ---------- errors ---------- */

    /* register — V5.5 wire + V5.6 unified */
    error WrongMode();
    error WalletDerivationMismatch();
    error WrongRegisterModeNoOp();
    error BindingPkLimbOutOfRange();
    error BadProof();
    error BadSignedAttrsHi();
    error BadSignedAttrsLo();
    error BadLeafKeyCommit();        // V7 (replaces V5.4 BadLeafSpki)
    error BadLeafSig();
    error BadIntSig();
    error BadTrustList();
    error BadPolicy();
    error StaleBinding();
    error FutureBinding();
    error NullifierUsed();           // V5.6 cross-identity reuse on first-claim

    /* proveAge */
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
        identityVerifierImpl = IGroth16VerifierV5_5(_identityVerifier);
        ageVerifierImpl      = IGroth16AgeVerifier(_ageVerifier);
        admin = _admin;
        poseidonT3 = _poseidonT3;
        poseidonT7 = _poseidonT7;
    }

    /* ---------- IZKQESRegistry view fns ---------- */

    function identityVerifier() external view override returns (address) {
        return address(identityVerifierImpl);
    }

    function ageVerifier() external view override returns (address) {
        return address(ageVerifierImpl);
    }

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
    ///         `proveAge` and rebind calls revert `BindingRevoked`. Other
    ///         binding fields are preserved so off-chain consumers can
    ///         still cross-reference the revoked binding.
    function setRevoked(bytes32 bindingId, bool revoked_) external onlyAdmin {
        bindings[bindingId].revoked = revoked_;
        emit BindingRevoke(bindingId, revoked_, msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /* ---------- register() — V7 unified ---------- */

    function register(RegisterCall calldata args)
        external override returns (bytes32 bindingId)
    {
        return _register(msg.sender, args);
    }

    /// @dev Internal register entry point — takes the caller as an
    ///      explicit argument so `registerWithAge` can call it without
    ///      bouncing through an external `this.register(...)` (which
    ///      would re-set msg.sender to address(this) and break the
    ///      WalletDerivationMismatch gate).
    function _register(
        address               caller,
        RegisterCall calldata args
    ) internal returns (bytes32 bindingId) {
        ChainProof calldata chainProof = args.chainProof;
        LeafProof  calldata leafProof  = args.leafProof;
        /* ===== Gate 0: mode gate ===== */
        if (leafProof.rotationMode != 0) revert WrongMode();

        /* ===== Gate 0a': keccak-derive caller from binding-pk limbs ===== */
        address derivedAddr = _deriveAddrFromBindingLimbs(leafProof);
        if (derivedAddr != caller) revert WalletDerivationMismatch();

        // V5.2 register-mode rotation no-op gate.
        if (leafProof.rotationNewWallet != uint256(uint160(caller))) {
            revert WrongRegisterModeNoOp();
        }

        /* ===== Gate 0b: ChainProof bind-values cross-check ===== */
        if (chainProof.rTL           != uint256(trustedRoot))       revert BadTrustList();
        if (chainProof.leafKeyCommit != leafProof.leafKeyCommit)    revert BadLeafKeyCommit();

        /* ===== Gate 1: Groth16 verify (21 publics) ===== */
        uint256[21] memory input = _packPublicSignals(leafProof);
        if (!identityVerifierImpl.verifyProof(leafProof.a, leafProof.b, leafProof.c, input)) {
            revert BadProof();
        }

        /* ===== Gate 2a: signedAttrs hash + leafKeyCommit ===== */
        bytes32 saHash = sha256(args.signedAttrs);
        {
            uint256 saHi = uint256(saHash) >> 128;
            uint256 saLo = uint256(saHash) & ((uint256(1) << 128) - 1);
            if (saHi != leafProof.signedAttrsHashHi) revert BadSignedAttrsHi();
            if (saLo != leafProof.signedAttrsHashLo) revert BadSignedAttrsLo();
        }
        if (KeyCommit.commitSpki(poseidonT3, poseidonT7, args.leafSpki) != leafProof.leafKeyCommit) {
            revert BadLeafKeyCommit();
        }

        /* ===== Gate 2b: leaf signature (algorithm-dispatched) ===== */
        if (!HostSig.verify(args.leafSpki, saHash, args.leafSig)) {
            revert BadLeafSig();
        }

        /* ===== Gate 3: intermediate signature ===== */
        {
            bytes32 leafTbsHash = bytes32(
                (leafProof.leafTbsHashHi << 128) | leafProof.leafTbsHashLo
            );
            if (!HostSig.verify(args.intSpki, leafTbsHash, args.intSig)) {
                revert BadIntSig();
            }
        }

        /* ===== Gate 4: trust-list Merkle (intKeyCommit recomputed) ===== */
        // V5.5 delta vs V5.4: intSpkiCommit is no longer a public signal;
        // contract computes KeyCommit.commitSpki(intSpki) inline and uses
        // that as the Merkle leaf.
        {
            uint256 intKeyCommit = KeyCommit.commitSpki(poseidonT3, poseidonT7, args.intSpki);
            if (!PoseidonMerkle.verify(
                poseidonT3,
                bytes32(intKeyCommit),
                args.trustMerklePath,
                args.trustMerklePathBits,
                trustedRoot
            )) {
                revert BadTrustList();
            }
        }

        /* ===== Gate 5: policy-list Merkle ===== */
        if (!PoseidonMerkle.verify(
            poseidonT3,
            bytes32(leafProof.policyLeafHash),
            args.policyMerklePath,
            args.policyMerklePathBits,
            policyRoot
        )) {
            revert BadPolicy();
        }

        /* ===== Gate 6: timing ===== */
        if (leafProof.timestamp > block.timestamp) revert FutureBinding();
        if (block.timestamp - leafProof.timestamp > MAX_BINDING_AGE) revert StaleBinding();

        /* ===== Gate 7: binding-write — first-claim or rebind ===== */
        bindingId = keccak256(abi.encode(country, leafProof.identityFingerprint));

        Binding storage b = bindings[bindingId];

        uint256 ctxHash = (leafProof.ctxHashHi << 128) | leafProof.ctxHashLo;
        uint256 nullifier = leafProof.nullifier;
        address oldPk = b.pk;

        if (oldPk == address(0)) {
            // ----- First-claim path -----
            if (usedNullifiers[nullifier]) revert NullifierUsed();

            b.pk             = caller;
            b.ctxHash        = ctxHash;
            b.policyLeafHash = leafProof.policyLeafHash;
            b.timestamp      = block.timestamp;
            b.dobCommit      = 0;             // default-private posture
            b.dobSupported   = 1;             // UA: Diia carries DOB
            b.revoked        = false;
            b.nullifier      = nullifier;     // first-claim write-once

            usedNullifiers[nullifier] = true;

            emit BindingRegistered(bindingId, caller, ctxHash);
        } else {
            // ----- Rebind path (V5.6 unified-register) -----
            if (b.revoked) revert BindingRevoked();

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

    /* ---------- registerWithAge() — V5.6 atomic ---------- */

    function registerWithAge(
        RegisterCall calldata args,
        uint256               ageCutoffDate,
        AgeProof     calldata ageProof
    ) external override returns (bytes32 bindingId, bool ageOk) {
        bindingId = _register(msg.sender, args);
        ageOk = _proveAge(msg.sender, bindingId, ageCutoffDate, ageProof);
    }

    /* ---------- proveAge() — V5.4 carry-over ---------- */

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
        // mitigation. Without this, a malicious dApp could binary-search
        // the underlying `dobYmd` via try-multiple-cutoffs.
        if (ageCutoffDate < 19000101 || ageCutoffDate > 99991231) {
            revert InvalidAgeCutoff();
        }

        if (proof.ageQualified  != 1)             revert AgeNotQualified();
        if (proof.ageCutoffDate != ageCutoffDate) revert AgeCutoffMismatch();

        // V5.1 nullifier_ctx anti-replay derivation. Frozen ProtocolBytes
        // literal "zkqes-age-ctx-v1" — three sites compute the same hash:
        // circuit (private witness + passthrough public signal), SDK
        // (consumer-supplied via `nullifierCtxKeccak`), this contract.
        //
        // Reduce mod BN254 scalar p before comparing: the circuit's
        // public signal is a field element (always < p), while raw
        // keccak256 is a uniform uint256 — ~82% of which exceed p.
        // Without reduction the equality check spuriously reverts on
        // most cutoffs even when the SDK supplied the right preimage.
        uint256 BN254_SCALAR_P =
            21888242871839275222246405745257275088548364400416034343698204186575808495617;
        uint256 expectedCtx = uint256(keccak256(abi.encodePacked(
            "zkqes-age-ctx-v1", bindingId, ageCutoffDate
        ))) % BN254_SCALAR_P;
        if (proof.nullifierCtx != expectedCtx) revert AgeNullifierContextMismatch();

        // Pack the 3-input array for the snarkjs verifier ABI. Order
        // MUST match the `AgeDiiaUA` circuit's frozen public-output
        // slot order: [0] ageQualified, [1] ageCutoffDate, [2] nullifierCtx.
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
    ///      keccak-on-chain bindingPk* limbs (slots 17..20 in V7's
    ///      21-signal layout, big-endian).
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

    /// @dev Pack `LeafProof`'s 21 named public-signal fields into the
    ///      `uint256[21]` array the V5.5 verifier consumes. Field-by-
    ///      field assignment avoids the Yul-IR stack-too-deep that
    ///      struck V5.1 at uint[19]. Slot order MUST match the V5.5
    ///      frozen public-signal layout (spec §3.1).
    function _packPublicSignals(LeafProof calldata leafProof)
        internal pure returns (uint256[21] memory input)
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
        input[11] = leafProof.leafKeyCommit;
        input[12] = leafProof.identityFingerprint;
        input[13] = leafProof.identityCommitment;
        input[14] = leafProof.rotationMode;
        input[15] = leafProof.rotationOldCommitment;
        input[16] = leafProof.rotationNewWallet;
        input[17] = leafProof.bindingPkXHi;
        input[18] = leafProof.bindingPkXLo;
        input[19] = leafProof.bindingPkYHi;
        input[20] = leafProof.bindingPkYLo;
    }
}
