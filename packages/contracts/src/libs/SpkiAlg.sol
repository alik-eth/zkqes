// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

/// @title  SpkiAlg — V5.5 algorithm dispatch by SPKI OID prefix.
///
/// @notice Reads canonical DER `SubjectPublicKeyInfo` bytes and returns
///         the host-verifier algorithm tag. The on-chain register()
///         dispatches to the right signature verifier (P256Verify
///         precompile for P-256, OZ RSA.pkcs1Sha256 for RSA-2048) based
///         on this enum.
///
/// @dev    V5.5 spec §9.3: dispatch by parsed SPKI algorithm OID, NOT
///         by a proof-family tag. This keeps the proof's leafKeyCommit
///         algorithm-agnostic — the same Groth16 verifier accepts
///         P-256, RSA-2048, and any future host-supported algorithm.
///
///         Initial supported algorithms (V5.5):
///           - P-256 (id-ecPublicKey + secp256r1 named curve)
///           - RSA-2048 PKCS#1 v1.5 + SHA-256 (rsaEncryption, e=65537)
///
///         Future algorithms add an enum entry + an OID-prefix check
///         arm here. RSA-3072/4096 reuse the rsaEncryption OID (the
///         modulus length is implicit in the BIT STRING content);
///         distinguishing them at dispatch time is unnecessary because
///         OZ RSA.pkcs1Sha256 handles arbitrary modulus length.
///
/// @dev    OID byte sequences (DER-encoded with `06 LL` prefix stripped):
///           - id-ecPublicKey  1.2.840.10045.2.1   = 2a 86 48 ce 3d 02 01
///           - secp256r1       1.2.840.10045.3.1.7 = 2a 86 48 ce 3d 03 01 07
///           - rsaEncryption   1.2.840.113549.1.1.1 = 2a 86 48 86 f7 0d 01 01 01
///
///         A canonical RFC 5480 §2.1.1.1 P-256 named-curve SPKI begins:
///           30 59                                ; SPKI SEQUENCE, 89 bytes
///           30 13                                ; AlgorithmIdentifier SEQUENCE
///           06 07 2a 86 48 ce 3d 02 01           ; id-ecPublicKey OID
///           06 08 2a 86 48 ce 3d 03 01 07        ; secp256r1 OID
///           03 42 00 04 ...                      ; BIT STRING, uncompressed point
///
///         A canonical RFC 8017 §A.1 RSA SPKI begins:
///           30 82 LL LL                          ; SPKI SEQUENCE, long form
///           30 0d                                ; AlgorithmIdentifier SEQUENCE
///           06 09 2a 86 48 86 f7 0d 01 01 01     ; rsaEncryption OID
///           05 00                                ; NULL params
///           03 82 LL LL 00                       ; BIT STRING wrapping RSAPublicKey
///           ...
///
///         The dispatch reads the first OID's bytes (skipping outer SEQUENCE
///         headers) and matches against the known prefixes. Strict-match,
///         not lenient — anything else reverts UnsupportedAlgorithm.
library SpkiAlg {
    enum Algorithm {
        UNKNOWN,
        P256,       // id-ecPublicKey + secp256r1
        RSA_2048    // rsaEncryption + 2048-bit modulus (PKCS#1 v1.5 + SHA-256)
    }

    error UnsupportedAlgorithm();
    error MalformedSpki();

    // OID byte sequences (without the leading `06 LL` tag/length pair).
    bytes7 internal constant OID_ID_EC_PUBLIC_KEY =
        hex"2a8648ce3d0201"; // 1.2.840.10045.2.1
    bytes8 internal constant OID_SECP256R1 =
        hex"2a8648ce3d030107"; // 1.2.840.10045.3.1.7
    bytes9 internal constant OID_RSA_ENCRYPTION =
        hex"2a864886f70d010101"; // 1.2.840.113549.1.1.1

    /// @notice Detect the SPKI's algorithm by reading the
    ///         AlgorithmIdentifier OID. Reverts on malformed DER or
    ///         unknown algorithm.
    /// @param  spki Canonical DER SubjectPublicKeyInfo bytes (RFC 5280
    ///              §4.1.2.7).
    /// @return alg Algorithm enum tag.
    function detect(bytes memory spki) internal pure returns (Algorithm alg) {
        // SPKI = SEQUENCE { AlgorithmIdentifier, BIT STRING }.
        // Skip outer SEQUENCE tag + length bytes to land on
        // AlgorithmIdentifier's tag (also 0x30 SEQUENCE).
        if (spki.length < 4) revert MalformedSpki();
        if (uint8(spki[0]) != 0x30) revert MalformedSpki();

        // Skip outer SEQUENCE length-header.
        uint256 outerLenHdr = _derLengthHeaderSize(spki, 1);
        uint256 algIdTagOff = 1 + outerLenHdr;

        if (algIdTagOff + 2 > spki.length) revert MalformedSpki();
        if (uint8(spki[algIdTagOff]) != 0x30) revert MalformedSpki();

        // Skip AlgorithmIdentifier's length-header to land on its first
        // child (the OID, tag 0x06).
        uint256 algIdLenHdr = _derLengthHeaderSize(spki, algIdTagOff + 1);
        uint256 oidTagOff = algIdTagOff + 1 + algIdLenHdr;

        if (oidTagOff + 2 > spki.length) revert MalformedSpki();
        if (uint8(spki[oidTagOff]) != 0x06) revert MalformedSpki();

        uint256 oidLen = uint8(spki[oidTagOff + 1]);
        uint256 oidStart = oidTagOff + 2;
        if (oidStart + oidLen > spki.length) revert MalformedSpki();

        // 7-byte OID: id-ecPublicKey → P-256 (no need to also check
        // secp256r1 since the canonical form REQUIRES that companion
        // OID; if a malformed P-384 SPKI snuck in, the downstream
        // P256Verify call will reject the SPKI shape).
        if (oidLen == 7 && _eqBytes7(spki, oidStart, OID_ID_EC_PUBLIC_KEY)) {
            return Algorithm.P256;
        }
        // 9-byte OID: rsaEncryption → RSA-2048+. Modulus length is
        // implicit in the BIT STRING content; OZ RSA.pkcs1Sha256
        // handles arbitrary lengths.
        if (oidLen == 9 && _eqBytes9(spki, oidStart, OID_RSA_ENCRYPTION)) {
            return Algorithm.RSA_2048;
        }
        revert UnsupportedAlgorithm();
    }

    // --- internal helpers ---

    /// @dev Returns the byte length of the DER length-of-length encoding
    ///      starting at `off`. Short form (0x00..0x7f) = 1; long form
    ///      0x8N = 1 + N. Reverts on indefinite-form (0x80) or N > 4
    ///      (no SPKI exceeds 2^32 bytes).
    function _derLengthHeaderSize(bytes memory data, uint256 off)
        private
        pure
        returns (uint256)
    {
        if (off >= data.length) revert MalformedSpki();
        uint8 b0 = uint8(data[off]);
        if (b0 < 0x80) return 1;
        if (b0 == 0x80) revert MalformedSpki(); // indefinite form
        uint256 n = b0 & 0x7f;
        if (n > 4) revert MalformedSpki();
        return 1 + n;
    }

    function _eqBytes7(bytes memory data, uint256 off, bytes7 expected)
        private
        pure
        returns (bool)
    {
        if (off + 7 > data.length) return false;
        bytes7 got;
        assembly {
            got := mload(add(add(data, 0x20), off))
        }
        return got == expected;
    }

    function _eqBytes9(bytes memory data, uint256 off, bytes9 expected)
        private
        pure
        returns (bool)
    {
        if (off + 9 > data.length) return false;
        bytes9 got;
        assembly {
            got := mload(add(add(data, 0x20), off))
        }
        return got == expected;
    }
}
