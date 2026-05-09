// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

/// @title  IZKQESRegistry — frozen interface for per-country ZKQES registries (V7).
/// @notice Spec `docs/superpowers/specs/2026-05-09-v7-merged-amendment.md`.
///         V7 = V5.5 wire format (21-signal Groth16, KeyCommit leaves,
///         HostSig dispatch, `bytes` signature calldata) + V5.6 features
///         (unified register with rebind branch, atomic registerWithAge,
///         per-country age verifier slot).
///
/// @dev    `LeafProof` carries the V5.5 frozen 21-signal layout (see spec
///         §3.1). `ChainProof` carries only on-chain bind-values (no Groth16
///         tuple). `AgeProof` carries the per-country age circuit's three
///         public signals.
///
///         The `nullifierCtx` field of `AgeProof` is bound to a frozen
///         keccak256 derivation per orchestration §1.4:
///
///           nullifierCtx = keccak256(abi.encodePacked(
///             "zkqes-age-ctx-v1",  // ProtocolBytes literal — NEVER rename
///             bindingId,           // bytes32
///             ageCutoffDate        // uint256
///           ))
///
///         Three sites compute the same hash: circuit (private witness +
///         passthrough public signal), web SDK (consumer-supplied via
///         `nullifierCtxKeccak`), contract (`proveAge` recomputes +
///         asserts equality). Drift = silent proveAge breakage.
///
///         Both verifier slots in concrete implementations are
///         `immutable` — any verifier swap requires a fresh registry
///         redeploy + new `fixtures/contracts/<chain>.json` pump.
interface IZKQESRegistry {

    /* ---------- stored record ---------- */

    /// @dev `dobCommit` = 0 in V7 (default-private posture per V5.4 spec
    ///      §3.4); slot retained for future delegated-prover use cases.
    /// @dev `dobSupported` = 0 (no DOB) or 1 (DOB-aware QTSP). UA = 1.
    struct Binding {
        address pk;
        uint256 ctxHash;
        uint256 policyLeafHash;
        uint256 timestamp;
        uint256 dobCommit;       // 0 if dobSupported == 0
        uint8   dobSupported;    // 0 = no DOB, 1 = DOB-aware QTSP
        bool    revoked;
        uint256 nullifier;
    }

    /* ---------- proof tuples ---------- */

    /// @dev Chain-level public-signal commitments. **NOT a Groth16 proof.**
    ///      Chain (intermediate-cert) verification happens ON-CHAIN inside
    ///      `register()` via `HostSig.verify` (intermediate signs leafTbsHash)
    ///      + Poseidon Merkle climb (`KeyCommit(intSpki) ∈ trustedRoot`).
    ///      The fields below are caller-supplied bind-values cross-checked
    ///      against on-chain state + `LeafProof`'s public signals:
    ///
    ///        - `rTL`            must equal the registry's current
    ///                           `trustedRoot()` (snapshot binding,
    ///                           closes a TOCTOU race when admin
    ///                           rotates the root mid-tx).
    ///        - `leafKeyCommit`  must equal `LeafProof.leafKeyCommit`
    ///                           (slot 11) — cross-binds this chain
    ///                           assertion to the matching leaf proof.
    ///
    /// @dev V7 drop vs V5.6: `algorithmTag` is gone. V5.5 `HostSig`
    ///      dispatches per SPKI algorithm-OID at verify time; the leaf
    ///      algorithm tag is redundant.
    struct ChainProof {
        uint256 rTL;
        uint256 leafKeyCommit;
    }

    /// @dev Output of the leaf-cert Groth16 verifier (V5.5 frozen
    ///      21-signal layout). Public signals are inlined as named
    ///      fields; concrete `register()` implementations pack them
    ///      into `uint256[21]` for the verifier call. Order
    ///      MUST match the circuit's public-output slot order
    ///      byte-for-byte (slot N below = circuit public output N).
    ///
    /// @dev V7 deltas vs V5.6:
    ///        - slot [11]: `leafSpkiCommit` renamed to `leafKeyCommit`
    ///                     (algorithm-agnostic via KeyCommit lib).
    ///        - V5.4 slot [12] `intSpkiCommit` DROPPED — registry
    ///          recomputes `KeyCommit(intSpki)` on-chain at Gate 4.
    ///        - all slots after the dropped one renumbered −1.
    struct LeafProof {
        uint256[2]    a;
        uint256[2][2] b;
        uint256[2]    c;
        // V5.5 21-signal layout (country-agnostic):
        uint256 timestamp;             // [0]
        uint256 nullifier;             // [1]   Poseidon₂(walletSecret, ctxHash)
        uint256 ctxHashHi;             // [2]
        uint256 ctxHashLo;             // [3]
        uint256 bindingHashHi;         // [4]
        uint256 bindingHashLo;         // [5]
        uint256 signedAttrsHashHi;     // [6]
        uint256 signedAttrsHashLo;     // [7]
        uint256 leafTbsHashHi;         // [8]
        uint256 leafTbsHashLo;         // [9]
        uint256 policyLeafHash;        // [10]
        uint256 leafKeyCommit;         // [11]  must == ChainProof.leafKeyCommit
        uint256 identityFingerprint;   // [12]  Poseidon₂(subjectSerialPacked, FINGERPRINT_DOMAIN)
        uint256 identityCommitment;    // [13]  Poseidon₂(subjectSerialPacked, walletSecret)
        uint256 rotationMode;          // [14]  V7: pinned to 0 (Gate 0)
        uint256 rotationOldCommitment; // [15]  V7: must equal identityCommitment
        uint256 rotationNewWallet;     // [16]  V7: must equal uint160(msg.sender)
        uint256 bindingPkXHi;          // [17]  V5.2 keccak-on-chain limbs
        uint256 bindingPkXLo;          // [18]
        uint256 bindingPkYHi;          // [19]
        uint256 bindingPkYLo;          // [20]
    }

    /// @dev Bundle of `register()` calldata fields. V7 packs the 11 fields
    ///      into a struct because `bytes calldata` widens each pointer to
    ///      2 stack slots, and the flat 11-arg shape (plus a return slot)
    ///      tips Solidity's via_ir over its stack limit on
    ///      `registerWithAge`. Splitting into a struct keeps the external
    ///      ABI compact (single calldata-tuple) and is the lighter option
    ///      vs duplicating the full register body inside registerWithAge.
    struct RegisterCall {
        ChainProof  chainProof;
        LeafProof   leafProof;
        bytes       leafSpki;
        bytes       intSpki;
        bytes       signedAttrs;
        bytes       leafSig;
        bytes       intSig;
        bytes32[16] trustMerklePath;
        uint256     trustMerklePathBits;
        bytes32[16] policyMerklePath;
        uint256     policyMerklePathBits;
    }

    /// @dev Output of the per-country age Groth16 verifier. Three
    ///      public signals only: `(ageQualified, ageCutoffDate,
    ///      nullifierCtx)`. Concrete `proveAge()` packs them into
    ///      `uint256[3]` for the verifier call.
    struct AgeProof {
        uint256[2]    a;
        uint256[2][2] b;
        uint256[2]    c;
        uint256       ageQualified;    // must == 1
        uint256       ageCutoffDate;   // must == argument; YYYYMMDD
        uint256       nullifierCtx;    // == keccak("zkqes-age-ctx-v1", bindingId, cutoff)
    }

    /* ---------- views ---------- */

    /// @notice ISO 3166-1 alpha-2 country code (e.g. "UA").
    function country() external view returns (string memory);

    /// @notice Current eIDAS trusted-list Merkle root for this country's
    ///         chain anchor.
    function trustedRoot() external view returns (bytes32);

    /// @notice Current policy-list Merkle root.
    function policyRoot() external view returns (bytes32);

    /// @notice Address of the V5.5 21-signal identity Groth16 verifier.
    ///         Immutable in concrete implementations.
    function identityVerifier() external view returns (address);

    /// @notice Address of the per-country age Groth16 verifier
    ///         (3-signal layout). Immutable in concrete implementations;
    ///         country-specific (UA = AgeDiiaUA).
    function ageVerifier() external view returns (address);

    /// @notice Lookup a binding by id. Returns the zero-struct if not
    ///         found (caller checks `pk == address(0)`).
    function getBinding(bytes32 id) external view returns (Binding memory);

    /// @notice True iff `proveAge(id, cutoff, ...)` has previously
    ///         succeeded for this binding+cutoff pair.
    function ageProvenCutoffs(bytes32 id, uint256 cutoff)
        external view returns (bool);

    /* ---------- mutating ---------- */

    /// @notice Verify the chain+leaf identity tuple, write a new
    ///         binding, return its id (= keccak of the canonical
    ///         per-binding fields, computed by the implementation —
    ///         e.g. UA uses `keccak256(abi.encode("UA",
    ///         leafProof.identityFingerprint))` so the same QES
    ///         holder maps to the same binding across rebinds).
    ///
    /// @dev    `register()` runs the V7 7-gate pipeline (spec §3.3):
    ///         (1) one Groth16 verify on the leaf 21-signal proof
    ///         via `identityVerifier()`; (2) `HostSig.verify` of the
    ///         leaf signature over sha256(signedAttrs) + intermediate
    ///         signature over `leafTbsHash`; (3) Poseidon Merkle climb
    ///         proving `KeyCommit(intSpki) ∈ trustedRoot` (intKeyCommit
    ///         recomputed on-chain in V7); (4) Poseidon Merkle climb
    ///         proving `policyLeafHash ∈ policyRoot`. There is NO
    ///         separate chain Groth16 proof — `ChainProof` carries only
    ///         the bind-values needed by Gate 0b.
    ///
    /// @dev    V7 unified-register: a valid proof for an existing
    ///         binding's `identityFingerprint` rebinds the binding's
    ///         wallet pointer to `msg.sender`. Nullifier and
    ///         ageProvenCutoffs persist across rebinds.
    ///
    /// @dev    For DOB-aware countries (e.g. UA) implementations set
    ///         `Binding.dobSupported = 1`; for non-DOB countries,
    ///         `dobSupported = 0`. `Binding.dobCommit` is `0` in V7
    ///         (default-private posture).
    ///
    /// @param  args                    Bundle of register calldata
    ///                                 (chainProof, leafProof, raw SPKI
    ///                                 + signedAttrs + sigs, Merkle paths
    ///                                 + bit-paths). See `RegisterCall`.
    function register(RegisterCall calldata args)
        external returns (bytes32 bindingId);

    /// @notice Verify an age proof for an existing DOB-supporting
    ///         binding. Reverts on any gate failure (silent reverts —
    ///         no string interpolation).
    /// @dev    The `ageCutoffDate` argument MUST equal
    ///         `AgeProof.ageCutoffDate` (cross-bind); valid range
    ///         19000101..99991231 (policy-abuse mitigation).
    /// @return ok `true` on success; reverts on any failure.
    function proveAge(
        bytes32         bindingId,
        uint256         ageCutoffDate,
        AgeProof calldata
    ) external returns (bool ok);

    /// @notice Atomic register + proveAge in one transaction. Internally
    ///         runs the full register() pipeline followed by the full
    ///         proveAge() pipeline; either gate failure reverts the
    ///         entire tx (no partial state). Same authorization rules
    ///         as the two functions called separately — this is a
    ///         transaction-level convenience for the common UA flow
    ///         where a user binds and proves age from one .p7s in a
    ///         single wallet prompt.
    /// @dev    V5.6 amendment, preserved in V7. `ageCutoffDate` MUST
    ///         equal `ageProof.ageCutoffDate` (cross-bind),
    ///         19000101..99991231.
    function registerWithAge(
        RegisterCall calldata args,
        uint256               ageCutoffDate,
        AgeProof     calldata ageProof
    ) external returns (bytes32 bindingId, bool ageOk);

    /* ---------- events ---------- */

    /// @notice Emitted on successful first-claim `register()`. `pk` is
    ///         the binding's new wallet pubkey-derived address;
    ///         `ctxHash` is the `Binding.ctxHash` slot value.
    event BindingRegistered(
        bytes32 indexed id,
        address indexed pk,
        uint256         ctxHash
    );

    /// @notice Emitted on a `register()` call that swaps an existing
    ///         binding's wallet pointer to a new wallet (same identity,
    ///         different msg.sender). V5.6 unified-register replaces
    ///         V5.4's separate `rotateWallet()` + `BindingRotated` event;
    ///         authorization is the proof itself (same fingerprint =
    ///         same identity).
    event BindingRebound(
        bytes32 indexed id,
        address indexed oldPk,
        address indexed newPk
    );

    /// @notice Emitted on successful `proveAge()`. `prover` is `msg.sender`
    ///         (which need not equal `Binding.pk` — proveAge is callable
    ///         by anyone holding a valid age proof, including delegated
    ///         provers per spec §3.4).
    event AgeProven(
        bytes32 indexed id,
        uint256         ageCutoffDate,
        address         prover
    );
}
