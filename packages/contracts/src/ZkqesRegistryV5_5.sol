// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {IGroth16VerifierV5_5} from "./Groth16VerifierV5_5Stub.sol";
import {KeyCommit} from "./libs/KeyCommit.sol";
import {HostSig} from "./libs/HostSig.sol";
import {Poseidon} from "./libs/Poseidon.sol";
import {PoseidonMerkle} from "./libs/PoseidonMerkle.sol";

/// @title  ZkqesRegistryV5_5 — multi-algorithm signature extension.
///
/// @notice V5.5 fresh registry per
///         docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md.
///         Forks from V5.2's single-registry architecture (NOT V5.4's
///         per-country pattern). Adds:
///           - algorithm-agnostic leaf-key commitment via KeyCommit lib;
///           - host-side signature dispatch via HostSig lib (P-256 +
///             RSA-2048+);
///           - variable-length signature calldata (`bytes` in lieu of
///             `bytes32[2]`);
///           - 21-element public-signal layout (drops V5.4's
///             intSpkiCommit — contract recomputes at Gate 5).
///
/// @dev    Limitations of the v0.1 skeleton (this commit):
///           - register() only. rotateWallet + proveAge are valid V5.5
///             surface (rotationMode signal exists, slot [14]) but
///             defer to a follow-up commit. The fold-in circuit's
///             rotation no-op gates already pass through unchanged.
///           - Stub Groth16 verifier. Ceremony output replaces it
///             post-Phase-B per spec §13.2 step 6.
///           - No country-binding (V5.5 deliberately decouples; V5.4's
///             ZKQESRegistryUA stays in place for the country-bound
///             flows).
library Errors_V5_5 {
    error BadProof();              // Gate 1
    error BadSignedAttrsHi();      // Gate 2a
    error BadSignedAttrsLo();      // Gate 2a
    error BadLeafKeyCommit();      // Gate 2 (V5.5 — replaces V5.4 BadLeafSpki)
    error BadLeafSig();            // Gate 3
    error BadIntSig();             // Gate 4
    error BadTrustList();          // Gate 5
    error BadPolicy();             // Gate 6
    error StaleBinding();          // Gate 7
    error FutureBinding();         // Gate 7
    error AlreadyRegistered();     // Gate 7
    error WalletDerivationMismatch();
    error WrongRegisterModeNoOp();
    error WrongMode();
    error CommitmentMismatch();
    error WalletNotBound();
    error CtxAlreadyUsed();
    error BindingPkLimbOutOfRange();
    // rotateWallet errors
    error UnknownIdentity();       // rotateWallet: identityWallets[fp] == 0
    error InvalidNewWallet();      // rotateWallet: newWallet == 0 || == oldWallet || != msg.sender || >= 2^160
    error InvalidRotationAuth();   // rotateWallet: ECDSA recovery ≠ oldWallet
}

contract ZkqesRegistryV5_5 {
    /* ---------- immutables ---------- */

    IGroth16VerifierV5_5 public immutable groth16Verifier;
    address public immutable poseidonT3;
    address public immutable poseidonT7;

    /* ---------- state ---------- */

    address public admin;
    bytes32 public trustedListRoot;
    bytes32 public policyRoot;
    uint256 public constant MAX_BINDING_AGE = 1 hours;

    mapping(address => bytes32) public nullifierOf;
    mapping(bytes32 => bytes32) public identityCommitments;
    mapping(bytes32 => address) public identityWallets;
    mapping(bytes32 => mapping(bytes32 => bool)) public usedCtx;

    /* ---------- events ---------- */

    event Registered(address indexed holder, bytes32 indexed nullifier, uint256 timestamp);
    event TrustedListRootRotated(bytes32 indexed previous, bytes32 indexed current, address admin);
    event PolicyRootRotated(bytes32 indexed previous, bytes32 indexed current, address admin);
    event AdminTransferred(address indexed previous, address indexed current);
    /// @notice Emitted on successful rotateWallet. `fingerprint` is the
    ///         identity-stable key (lookup index for indexers), `oldWallet`
    ///         and `newWallet` watched by wallet-rotation UX. `newCommitment`
    ///         is the post-rotation `identityCommitment[fp]` slot value.
    event WalletRotated(
        bytes32 indexed fingerprint,
        address indexed oldWallet,
        address indexed newWallet,
        bytes32 newCommitment
    );

    /* ---------- common errors ---------- */

    error OnlyAdmin();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    /* ---------- constructor ---------- */

    /// @dev Poseidon T3/T7 are pre-deployed by the deploy script and
    ///      passed in (V5.4 pattern, post-2026-05-05 Base Sepolia
    ///      MAX_INITCODE_SIZE failure). Embedding the ~33 KB Poseidon
    ///      initcodes inside the registry's own constructor pushes total
    ///      registry initcode over the EIP-3860 ~24.5 KB cap on Base
    ///      Sepolia. Pre-deploy + pass keeps the registry's own initcode
    ///      compact.
    constructor(
        IGroth16VerifierV5_5 _verifier,
        address _admin,
        bytes32 _initialTrustedListRoot,
        bytes32 _initialPolicyRoot,
        address _poseidonT3,
        address _poseidonT7
    ) {
        if (address(_verifier) == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_poseidonT3 == address(0)) revert ZeroAddress();
        if (_poseidonT7 == address(0)) revert ZeroAddress();
        groth16Verifier = _verifier;
        admin = _admin;
        trustedListRoot = _initialTrustedListRoot;
        policyRoot = _initialPolicyRoot;
        poseidonT3 = _poseidonT3;
        poseidonT7 = _poseidonT7;
    }

    /* ---------- views ---------- */

    function isVerified(address holder) external view returns (bool) {
        return nullifierOf[holder] != bytes32(0);
    }

    /* ---------- admin ---------- */

    function setTrustedListRoot(bytes32 newRoot) external onlyAdmin {
        emit TrustedListRootRotated(trustedListRoot, newRoot, msg.sender);
        trustedListRoot = newRoot;
    }

    function setPolicyRoot(bytes32 newRoot) external onlyAdmin {
        emit PolicyRootRotated(policyRoot, newRoot, msg.sender);
        policyRoot = newRoot;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /* ---------- register() — V5.5 21-signal frozen ABI ---------- */

    /// @dev V5.5 public-signal layout (FROZEN per spec §6, 21 entries):
    ///   [0]  timestamp
    ///   [1]  nullifier
    ///   [2]  ctxHashHi
    ///   [3]  ctxHashLo
    ///   [4]  bindingHashHi
    ///   [5]  bindingHashLo
    ///   [6]  signedAttrsHashHi
    ///   [7]  signedAttrsHashLo
    ///   [8]  leafTbsHashHi
    ///   [9]  leafTbsHashLo
    ///   [10] policyLeafHash
    ///   [11] leafKeyCommit       ← V5.5 (replaces V5.4 leafSpkiCommit)
    ///                             V5.4 [12] intSpkiCommit DROPPED
    ///   [12] identityFingerprint
    ///   [13] identityCommitment
    ///   [14] rotationMode
    ///   [15] rotationOldCommitment
    ///   [16] rotationNewWallet
    ///   [17] bindingPkXHi
    ///   [18] bindingPkXLo
    ///   [19] bindingPkYHi
    ///   [20] bindingPkYLo
    struct PublicSignals {
        uint256 timestamp;
        uint256 nullifier;
        uint256 ctxHashHi;
        uint256 ctxHashLo;
        uint256 bindingHashHi;
        uint256 bindingHashLo;
        uint256 signedAttrsHashHi;
        uint256 signedAttrsHashLo;
        uint256 leafTbsHashHi;
        uint256 leafTbsHashLo;
        uint256 policyLeafHash;
        uint256 leafKeyCommit;
        uint256 identityFingerprint;
        uint256 identityCommitment;
        uint256 rotationMode;
        uint256 rotationOldCommitment;
        uint256 rotationNewWallet;
        uint256 bindingPkXHi;
        uint256 bindingPkXLo;
        uint256 bindingPkYHi;
        uint256 bindingPkYLo;
    }

    struct Groth16Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    /// @notice 7-gate registration:
    ///   Gate 0:        mode gate (rotationMode == 0).
    ///   Gate 1:        Groth16 verify (21 publics).
    ///   Gate 2a-prime: keccak-derive msg.sender from bindingPk limbs +
    ///                  register-mode rotation no-op (V5.2 carry-over).
    ///   Gate 2:        sha256(signedAttrs) hi/lo bind +
    ///                  KeyCommit(leafSpki) == sig.leafKeyCommit (V5.5 NEW).
    ///   Gate 3:        HostSig.verify(leafSpki, sha256(signedAttrs), leafSig)
    ///                  — algorithm-dispatched (V5.5 NEW).
    ///   Gate 4:        HostSig.verify(intSpki, leafTbsHash, intSig).
    ///   Gate 5:        PoseidonMerkle.verify(KeyCommit(intSpki), trustedListRoot)
    ///                  — int-key commit recomputed on-chain (V5.5 NEW;
    ///                  replaces V5.4's witness-supplied intSpkiCommit).
    ///   Gate 6:        PoseidonMerkle.verify(policyLeafHash, policyRoot).
    ///   Gate 7:        timing + identity escrow + per-(identity, ctx) anti-Sybil.
    function register(
        Groth16Proof  calldata proof,
        PublicSignals calldata sig,
        bytes         calldata leafSpki,
        bytes         calldata intSpki,
        bytes         calldata signedAttrs,
        bytes         calldata leafSig,
        bytes         calldata intSig,
        bytes32[16]   calldata trustMerklePath,
        uint256                trustMerklePathBits,
        bytes32[16]   calldata policyMerklePath,
        uint256                policyMerklePathBits
    ) external {
        /* ===== Gate 0: mode gate ===== */
        if (sig.rotationMode != 0) revert Errors_V5_5.WrongMode();

        /* ===== Gate 2a-prime: keccak-derive msg.sender ===== */
        address derivedAddr = _deriveAddrFromBindingLimbs(sig);
        if (derivedAddr != msg.sender) revert Errors_V5_5.WalletDerivationMismatch();
        if (sig.rotationNewWallet != uint256(uint160(msg.sender))) {
            revert Errors_V5_5.WrongRegisterModeNoOp();
        }

        /* ===== Gate 1: Groth16 verify ===== */
        uint256[21] memory input = _packPublicSignals(sig);
        if (!groth16Verifier.verifyProof(proof.a, proof.b, proof.c, input)) {
            revert Errors_V5_5.BadProof();
        }

        /* ===== Gate 2: signedAttrs hash + leafKeyCommit ===== */
        bytes32 saHash = sha256(signedAttrs);
        {
            uint256 saHi = uint256(saHash) >> 128;
            uint256 saLo = uint256(saHash) & ((uint256(1) << 128) - 1);
            if (saHi != sig.signedAttrsHashHi) revert Errors_V5_5.BadSignedAttrsHi();
            if (saLo != sig.signedAttrsHashLo) revert Errors_V5_5.BadSignedAttrsLo();
        }
        if (KeyCommit.commitSpki(poseidonT3, poseidonT7, leafSpki) != sig.leafKeyCommit) {
            revert Errors_V5_5.BadLeafKeyCommit();
        }

        /* ===== Gate 3: leaf signature (algorithm-dispatched) ===== */
        if (!HostSig.verify(leafSpki, saHash, leafSig)) {
            revert Errors_V5_5.BadLeafSig();
        }

        /* ===== Gate 4: intermediate signature ===== */
        bytes32 leafTbsHash = bytes32(
            (sig.leafTbsHashHi << 128) | sig.leafTbsHashLo
        );
        if (!HostSig.verify(intSpki, leafTbsHash, intSig)) {
            revert Errors_V5_5.BadIntSig();
        }

        /* ===== Gate 5: trust-list Merkle (int-key commit recomputed) ===== */
        // V5.5 delta vs V5.4: intSpkiCommit is no longer a public signal;
        // contract computes KeyCommit.commitSpki(intSpki) inline and uses
        // that as the Merkle leaf. Trusted-list flattener emits roots
        // over the same algorithm-agnostic surface.
        uint256 intKeyCommit = KeyCommit.commitSpki(poseidonT3, poseidonT7, intSpki);
        if (!PoseidonMerkle.verify(
            poseidonT3,
            bytes32(intKeyCommit),
            trustMerklePath,
            trustMerklePathBits,
            trustedListRoot
        )) {
            revert Errors_V5_5.BadTrustList();
        }

        /* ===== Gate 6: policy-list Merkle ===== */
        if (!PoseidonMerkle.verify(
            poseidonT3,
            bytes32(sig.policyLeafHash),
            policyMerklePath,
            policyMerklePathBits,
            policyRoot
        )) {
            revert Errors_V5_5.BadPolicy();
        }

        /* ===== Gate 7: timing + identity escrow + per-(identity, ctx) ===== */
        if (sig.timestamp > block.timestamp) revert Errors_V5_5.FutureBinding();
        if (block.timestamp - sig.timestamp > MAX_BINDING_AGE) revert Errors_V5_5.StaleBinding();

        bytes32 ctxKey = bytes32((uint256(sig.ctxHashHi) << 128) | uint256(sig.ctxHashLo));
        bytes32 fingerprint = bytes32(sig.identityFingerprint);
        bytes32 commitment  = bytes32(sig.identityCommitment);
        bytes32 nullifierBytes = bytes32(sig.nullifier);

        if (identityWallets[fingerprint] == address(0)) {
            // First-claim path.
            if (nullifierOf[msg.sender] != bytes32(0)) revert Errors_V5_5.AlreadyRegistered();
            identityCommitments[fingerprint] = commitment;
            identityWallets[fingerprint] = msg.sender;
            usedCtx[fingerprint][ctxKey] = true;
            nullifierOf[msg.sender] = nullifierBytes;
        } else {
            // Repeat-claim path (same wallet, same identity, fresh ctx).
            if (identityCommitments[fingerprint] != commitment) revert Errors_V5_5.CommitmentMismatch();
            if (identityWallets[fingerprint] != msg.sender) revert Errors_V5_5.WalletNotBound();
            if (usedCtx[fingerprint][ctxKey]) revert Errors_V5_5.CtxAlreadyUsed();
            usedCtx[fingerprint][ctxKey] = true;
        }

        emit Registered(msg.sender, nullifierBytes, sig.timestamp);
    }

    /* ---------- rotateWallet — V5.2 carry-over with V5.5 21-signal pack ---------- */

    /// @notice Atomically rotate a registered identity from oldWallet to
    ///         newWallet. Caller MUST be newWallet; `oldWalletAuthSig`
    ///         MUST be a 65-byte ECDSA signature from oldWallet over the
    ///         canonical rotation payload (chainid + registry-bound).
    ///
    /// @dev    Mode gate enforces rotationMode == 1; the dual entry-point
    ///         register() rejects mode == 1 via Gate 0. The Groth16 verify
    ///         consumes the same 21-signal pack (rotationMode at slot [14]).
    ///
    /// @dev    Frozen ProtocolBytes literal "qkb-rotate-auth-v1" is REUSED
    ///         from V5.2 (CLAUDE.md ProtocolBytes invariant — never renamed
    ///         across versions; V5.6 / V6 must keep the same byte string).
    function rotateWallet(
        Groth16Proof  calldata proof,
        PublicSignals calldata sig,
        bytes         calldata oldWalletAuthSig
    ) external {
        if (sig.rotationMode != 1) revert Errors_V5_5.WrongMode();

        // V5.3 F2 carry-over: 160-bit range check on rotationNewWallet to
        // close the silent-truncation vector at the address(uint160(...))
        // cast below.
        if (sig.rotationNewWallet != uint256(uint160(sig.rotationNewWallet))) {
            revert Errors_V5_5.InvalidNewWallet();
        }

        uint256[21] memory input = _packPublicSignals(sig);
        if (!groth16Verifier.verifyProof(proof.a, proof.b, proof.c, input)) {
            revert Errors_V5_5.BadProof();
        }

        bytes32 fingerprint   = bytes32(sig.identityFingerprint);
        bytes32 newCommitment = bytes32(sig.identityCommitment);
        bytes32 oldCommitment = bytes32(sig.rotationOldCommitment);
        address newWallet     = address(uint160(sig.rotationNewWallet));

        address oldWallet = identityWallets[fingerprint];
        if (oldWallet == address(0))                   revert Errors_V5_5.UnknownIdentity();
        if (identityCommitments[fingerprint] != oldCommitment) {
            revert Errors_V5_5.CommitmentMismatch();
        }
        if (newWallet != msg.sender)                   revert Errors_V5_5.InvalidNewWallet();
        if (newWallet == oldWallet)                    revert Errors_V5_5.InvalidNewWallet();
        if (nullifierOf[newWallet] != bytes32(0))      revert Errors_V5_5.AlreadyRegistered();

        // ----- ECDSA auth payload (chainid + registry-bound) -----
        // frozen protocol byte string; see specs/2026-05-03-zkqes-rename-design.md §3
        bytes32 authPayload = keccak256(
            abi.encodePacked(
                "qkb-rotate-auth-v1",
                block.chainid,
                address(this),
                fingerprint,
                newWallet
            )
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", authPayload)
        );
        address recovered = _recoverSigner(ethSignedHash, oldWalletAuthSig);
        if (recovered != oldWallet) revert Errors_V5_5.InvalidRotationAuth();

        // ----- atomic state update -----
        identityCommitments[fingerprint] = newCommitment;
        identityWallets[fingerprint]     = newWallet;
        nullifierOf[newWallet] = nullifierOf[oldWallet];
        delete nullifierOf[oldWallet];

        emit WalletRotated(fingerprint, oldWallet, newWallet, newCommitment);
    }

    /* ---------- helpers ---------- */

    /// @dev Reconstruct holder's Ethereum address from V5.2-style
    ///      bindingPk* limbs (slots [17..20]). Same algebra as
    ///      ZkqesRegistryV5_2._deriveAddrFromBindingLimbs.
    function _deriveAddrFromBindingLimbs(PublicSignals calldata sig)
        internal
        pure
        returns (address)
    {
        uint256 maxLimb = type(uint128).max;
        if (sig.bindingPkXHi > maxLimb) revert Errors_V5_5.BindingPkLimbOutOfRange();
        if (sig.bindingPkXLo > maxLimb) revert Errors_V5_5.BindingPkLimbOutOfRange();
        if (sig.bindingPkYHi > maxLimb) revert Errors_V5_5.BindingPkLimbOutOfRange();
        if (sig.bindingPkYLo > maxLimb) revert Errors_V5_5.BindingPkLimbOutOfRange();
        bytes32 pkX = bytes32(
            (sig.bindingPkXHi << 128) | sig.bindingPkXLo
        );
        bytes32 pkY = bytes32(
            (sig.bindingPkYHi << 128) | sig.bindingPkYLo
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(pkX, pkY)))));
    }

    /// @dev Recover ECDSA signer from a 65-byte (r||s||v) signature over
    ///      `hash`. EIP-2 / SEC 1 high-s rejection. Returns address(0)
    ///      on malformed input — caller's downstream comparison (e.g.
    ///      `recovered != oldWallet`) surfaces that as InvalidRotationAuth.
    function _recoverSigner(bytes32 hash, bytes calldata signature)
        internal pure returns (address)
    {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }

    /// @dev Pack 21-signal public input array per V5.5 spec §6 layout.
    ///      Order MUST match the snarkjs verifier's `uint[21]` ABI.
    function _packPublicSignals(PublicSignals calldata sig)
        internal
        pure
        returns (uint256[21] memory input)
    {
        input[0]  = sig.timestamp;
        input[1]  = sig.nullifier;
        input[2]  = sig.ctxHashHi;
        input[3]  = sig.ctxHashLo;
        input[4]  = sig.bindingHashHi;
        input[5]  = sig.bindingHashLo;
        input[6]  = sig.signedAttrsHashHi;
        input[7]  = sig.signedAttrsHashLo;
        input[8]  = sig.leafTbsHashHi;
        input[9]  = sig.leafTbsHashLo;
        input[10] = sig.policyLeafHash;
        input[11] = sig.leafKeyCommit;
        input[12] = sig.identityFingerprint;
        input[13] = sig.identityCommitment;
        input[14] = sig.rotationMode;
        input[15] = sig.rotationOldCommitment;
        input[16] = sig.rotationNewWallet;
        input[17] = sig.bindingPkXHi;
        input[18] = sig.bindingPkXLo;
        input[19] = sig.bindingPkYHi;
        input[20] = sig.bindingPkYLo;
    }
}
