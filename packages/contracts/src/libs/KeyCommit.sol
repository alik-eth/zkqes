// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Poseidon} from "./Poseidon.sol";

/// @title  KeyCommit — V5.5 algorithm-agnostic SPKI commitment.
///
/// @notice Commits canonical DER `SubjectPublicKeyInfo` bytes to a single
///         BN254-Fr field element. The same construction runs in three
///         places — TS reference (packages/sdk/src/witness/v5_5/key-commit.ts),
///         Circom primitive (packages/circuits/circuits/primitives/KeyCommitVar.circom),
///         and this library — and MUST produce byte-identical outputs for
///         every input. Drift between any two breaks the V5.5 trust-list
///         and proof equality invariants (spec §12 invariants 5 + 6).
///
/// @dev    Construction:
///
///           keyCommit = Poseidon2( KEY_COMMIT_DOMAIN,
///                                  PoseidonChunkHashVarT7(spkiDerBytes) )
///
///         The chunk-hash variant is T7 (RATE=5, CAPACITY=1), distinct from
///         V5.4's T16-based PoseidonChunkHashVar. T7 is chosen so this
///         library can reuse the existing `Poseidon.hashT7` deployed from
///         PoseidonBytecode without introducing a new T16 contract +
///         reproducibility-check entry.
///
///         Sponge sizing — covers up to RSA-4096 SPKIs:
///           CHUNK = 31              bytes packed per field element
///           RATE = 5                fe absorbed per round
///           MAX_LEAF_SPKI = 600     bytes (worst-case input length)
///           MAX_ROUNDS = 5          ⌈(⌈600/31⌉ + 1) / 5⌉
///
/// @dev    Parity fixture at fixtures/v5_5/key-commit-parity.json (mirror
///         under packages/contracts/test/fixtures/v5_5/ for foundry's
///         fs_permissions). KeyCommit.t.sol asserts byte-equality against
///         that file for 10 canonical vectors.
///
/// @dev    KEY_COMMIT_DOMAIN derivation — frozen in code, NOT recomputed:
///           uint256(keccak256("zkqes-key-commit-v1")) mod p_bn254
///         The string "zkqes-key-commit-v1" is a frozen ProtocolBytes
///         literal per repo CLAUDE.md §"ProtocolBytes invariant"; never
///         renamed across versions. The reduced field value MUST match
///         `KEY_COMMIT_DOMAIN` in TS reference + Circom template.
library KeyCommit {
    /// @notice keccak256("zkqes-key-commit-v1") mod p_bn254. Pinned by
    ///         the parity fixture's `domainConstant` field.
    uint256 internal constant KEY_COMMIT_DOMAIN =
        18645781269818968495274020647839177040876380151358417993861915365514852958754;

    /// @notice Maximum SPKI byte length accepted. Covers RSA-4096 with
    ///         headroom (worst observed real-world SPKI ≤ 550 bytes).
    uint256 internal constant MAX_LEAF_SPKI = 600;

    /// @notice Sponge capacity / rate ratio fixed by the chunk-hash design.
    uint256 internal constant CHUNK = 31;
    uint256 internal constant RATE = 5;

    error SpkiTooLong();

    /// @notice Variable-length Poseidon-T7 chunk hash. Byte-identical to
    ///         the TS `poseidonChunkHashVarT7(data)` in
    ///         packages/sdk/src/witness/v5_5/key-commit.ts.
    /// @param  t7   Address of the deployed Poseidon-T7 contract (per
    ///              registry constructor's PoseidonBytecode.t7Initcode
    ///              CREATE-deploy).
    /// @param  data Canonical DER bytes to hash. Length ≤ MAX_LEAF_SPKI;
    ///              reverts SpkiTooLong otherwise.
    /// @return out  Poseidon sponge state after absorbing
    ///              [chunk_0, ..., chunk_{n-1}, length] in RATE-element windows.
    function poseidonChunkHashVarT7(address t7, bytes memory data)
        internal
        view
        returns (uint256 out)
    {
        if (data.length > MAX_LEAF_SPKI) revert SpkiTooLong();

        uint256 nChunks = (data.length + CHUNK - 1) / CHUNK;
        uint256 nFe = nChunks + 1; // chunks ‖ length
        uint256[] memory fe = new uint256[](nFe);

        // Pack bytes into chunks. Each chunk is the big-endian unsigned
        // integer representation of `data[i*CHUNK .. min((i+1)*CHUNK, len)-1]`
        // — last chunk packs only its real bytes, NOT zero-padded right.
        // Matches V5.4's PoseidonChunkHashVar packing convention.
        for (uint256 i = 0; i < nChunks; i++) {
            uint256 startIdx = i * CHUNK;
            uint256 endIdx = startIdx + CHUNK;
            if (endIdx > data.length) endIdx = data.length;
            uint256 v = 0;
            for (uint256 j = startIdx; j < endIdx; j++) {
                v = (v << 8) | uint256(uint8(data[j]));
            }
            fe[i] = v;
        }
        fe[nChunks] = data.length;

        // Sponge absorb: state_0 = 0; state_{r+1} = Poseidon7(state_r ‖ window_r).
        // Window pads with 0 if the last round has fewer than RATE elements
        // — matches TS impl.
        uint256 state = 0;
        for (uint256 i = 0; i < nFe; i += RATE) {
            uint256[6] memory window;
            window[0] = state;
            for (uint256 j = 0; j < RATE; j++) {
                uint256 idx = i + j;
                window[j + 1] = idx < nFe ? fe[idx] : 0;
            }
            state = Poseidon.hashT7(t7, window);
        }
        return state;
    }

    /// @notice Compute V5.5 KeyCommit on canonical DER SPKI bytes.
    /// @param  t3 Poseidon-T3 contract address.
    /// @param  t7 Poseidon-T7 contract address.
    /// @param  spki Canonical DER `SubjectPublicKeyInfo` bytes (RFC 5280
    ///              §4.1.2.7). The function is intentionally
    ///              algorithm-blind — the caller parses the SPKI's
    ///              `algorithm.algorithm` OID separately to dispatch to
    ///              the right host signature verifier.
    /// @return commit BN254-Fr field element committing the SPKI bytes
    ///                under the V5.5 KEY_COMMIT_DOMAIN.
    function commitSpki(address t3, address t7, bytes memory spki)
        internal
        view
        returns (uint256 commit)
    {
        uint256 inner = poseidonChunkHashVarT7(t7, spki);
        return Poseidon.hashT3(t3, [KEY_COMMIT_DOMAIN, inner]);
    }
}
