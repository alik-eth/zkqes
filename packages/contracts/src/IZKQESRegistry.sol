// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

/// @title  IZKQESRegistry — frozen interface for per-country ZKQES registries.
/// @notice Spec §3.1 (`docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md`).
///         FROZEN at V5.4 — V5.5+ countries implement this exact shape.
///         Any breaking change requires a V6 amendment + cross-worker
///         broadcast per orchestration §1.
///
/// @dev    Three proof tuples (`ChainProof`, `LeafProof`, `AgeProof`) and
///         one stored record (`Binding`). All public-signal slots inside
///         the proof structs follow the V5.3 frozen layout (chain + leaf
///         circuits are country-agnostic; per-country variation lives in
///         the age verifier addressed by `ageVerifier()`).
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

    /// @dev `dobCommit` = 0 in V5.4 (default-private posture per spec
    ///      §3.4); slot retained for V5.5+ delegated-prover use cases.
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
    ///      V5.4 preserves the V5.2 architecture: chain (intermediate-
    ///      cert) verification happens ON-CHAIN inside `register()` via
    ///      P256 verify (intermediate signs leafTbsHash) + Poseidon
    ///      Merkle climb (`intSpkiCommit ∈ trustedRoot`); there is no
    ///      separate chain Groth16 circuit. The fields below are the
    ///      caller's claimed bind-values that `register()` cross-checks
    ///      against on-chain state + `LeafProof`'s public signals:
    ///
    ///        - `rTL`            must equal the registry's current
    ///                           `trustedRoot()` (snapshot binding,
    ///                           closes a TOCTOU race when admin
    ///                           rotates the root mid-tx).
    ///        - `algorithmTag`   leaf P-256 algorithm discriminant —
    ///                           identifies the leaf signature
    ///                           algorithm version (forward-compat
    ///                           with V5.5+ when leaf algorithm
    ///                           pluggability lands).
    ///        - `leafSpkiCommit` MUST equal `LeafProof.leafSpkiCommit`
    ///                           (slot 11) — cross-binds this chain
    ///                           assertion to the matching leaf proof's
    ///                           Groth16-committed leaf SPKI.
    struct ChainProof {
        uint256 rTL;
        uint256 algorithmTag;
        uint256 leafSpkiCommit;
    }

    /// @dev Output of the leaf-cert Groth16 verifier (V5.3 frozen
    ///      22-signal layout). Public signals are inlined as named
    ///      fields; concrete `register()` implementations pack them
    ///      back into `uint256[22]` for the verifier call. Order
    ///      MUST match the circuit's public-output slot order
    ///      byte-for-byte (slot N below = circuit public output N).
    struct LeafProof {
        uint256[2]    a;
        uint256[2][2] b;
        uint256[2]    c;
        // V5.3 22-signal layout (country-agnostic):
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
        uint256 leafSpkiCommit;        // [11]  must == ChainProof.leafSpkiCommit
        uint256 intSpkiCommit;         // [12]
        uint256 identityFingerprint;   // [13]  Poseidon₂(subjectSerialPacked, FINGERPRINT_DOMAIN)
        uint256 identityCommitment;    // [14]  Poseidon₂(subjectSerialPacked, walletSecret)
        uint256 rotationMode;          // [15]  0 = register, 1 = rotateWallet
        uint256 rotationOldCommitment; // [16]
        uint256 rotationNewWallet;     // [17]  ≤ 2^160 - 1 per V5.3 F2
        uint256 bindingPkXHi;          // [18]  V5.2 keccak-on-chain limbs
        uint256 bindingPkXLo;          // [19]
        uint256 bindingPkYHi;          // [20]
        uint256 bindingPkYLo;          // [21]
    }

    /// @dev Output of the per-country age Groth16 verifier. Three
    ///      public signals only: `(ageQualified, ageCutoffDate,
    ///      nullifierCtx)`. Concrete `proveAge()` packs them into
    ///      `uint256[3]` for the verifier call (orchestration §1.3).
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

    /// @notice Address of the chain+leaf identity Groth16 verifier
    ///         (V5.3 22-signal layout). Immutable in concrete
    ///         implementations.
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
    ///         holder maps to the same binding across rotations).
    ///
    /// @dev    `register()` performs the V5.2-architecture work:
    ///         (1) one Groth16 verify on the leaf 22-signal proof
    ///         via `identityVerifier()`; (2) on-chain P-256 verify of
    ///         the intermediate cert's signature over `leafTbsHash`;
    ///         (3) on-chain Poseidon Merkle climb proving
    ///         `intSpkiCommit ∈ trustedRoot`; (4) on-chain Poseidon
    ///         Merkle climb proving `policyLeafHash ∈ policyRoot`.
    ///         There is NO separate chain Groth16 proof — `ChainProof`
    ///         carries only the bind-values needed by gates 2-4.
    ///
    /// @dev    For DOB-aware countries (e.g. UA) implementations set
    ///         `Binding.dobSupported = 1`; for non-DOB countries
    ///         (V5.5+ placeholder), `dobSupported = 0`. `Binding.dobCommit`
    ///         is `0` in V5.4 across all countries (default-private
    ///         posture per spec §3.4).
    ///
    /// @dev    Calldata layout below is V5.2-port-equivalent — see
    ///         `ZkqesRegistryV5_2.sol::register` for the gate-by-gate
    ///         reference implementation. The first 2 args (proof
    ///         tuples) are V5.4-shape; the remaining 9 are calldata
    ///         extras V5.2 already used for the on-chain chain
    ///         verification path.
    ///
    /// @param  chainProof              chain-level public-signal binds
    ///                                 (no Groth16 — see ChainProof docs)
    /// @param  leafProof               leaf Groth16 proof + 22 public
    ///                                 signals (V5.3 layout)
    /// @param  leafSpki                raw 91-byte leaf cert SPKI;
    ///                                 SpkiCommit must match
    ///                                 `leafProof.leafSpkiCommit`
    /// @param  intSpki                 raw 91-byte intermediate cert
    ///                                 SPKI; SpkiCommit must match
    ///                                 `leafProof.intSpkiCommit`
    /// @param  signedAttrs             CMS SignedAttrs whose sha256
    ///                                 must match `leafProof.signedAttrsHashHi/Lo`
    /// @param  leafSig                 leaf P-256 signature over
    ///                                 sha256(signedAttrs)
    /// @param  intSig                  intermediate P-256 signature
    ///                                 over `leafProof.leafTbsHashHi/Lo`
    /// @param  trustMerklePath         16-deep Poseidon path proving
    ///                                 `leafProof.intSpkiCommit` is a
    ///                                 leaf of `trustedRoot()`
    /// @param  trustMerklePathBits     left/right bitmap for the path
    /// @param  policyMerklePath        16-deep Poseidon path proving
    ///                                 `leafProof.policyLeafHash` is a
    ///                                 leaf of `policyRoot()`
    /// @param  policyMerklePathBits    left/right bitmap for the path
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
    ) external returns (bytes32 bindingId);

    /// @notice Verify an age proof for an existing DOB-supporting
    ///         binding. Reverts on any gate failure (silent reverts —
    ///         no string interpolation).
    /// @dev    Spec §3.4 / orchestration §1.3, §1.4. The `ageCutoffDate`
    ///         argument MUST equal `AgeProof.ageCutoffDate` (cross-bind);
    ///         valid range 19000101..99991231 (policy-abuse mitigation).
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
    /// @dev    V5.6 amendment. `ageCutoffDate` MUST equal
    ///         `ageProof.ageCutoffDate` (cross-bind), 19000101..99991231.
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
    ) external returns (bytes32 bindingId, bool ageOk);

    /* ---------- events ---------- */

    /// @notice Emitted on successful `register()`. `pk` is the binding's
    ///         new wallet pubkey-derived address; `ctxHash` is the
    ///         `Binding.ctxHash` slot value.
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
