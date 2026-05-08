// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {RSA} from "openzeppelin-contracts/utils/cryptography/RSA.sol";
import {P256Verify} from "./P256Verify.sol";
import {SpkiAlg} from "./SpkiAlg.sol";

/// @title  HostSig — V5.5 unified host signature verifier.
///
/// @notice Dispatches `verify(spki, digest, sig)` by parsed SPKI
///         algorithm OID:
///           - P-256: parses (X, Y) from RFC 5480 named-curve SPKI,
///                    invokes EIP-7212 P256VERIFY precompile.
///           - RSA-2048+: parses (modulus, exponent) from RFC 8017
///                    RSA SPKI, invokes OZ RSA.pkcs1Sha256 with
///                    SHA-256 PKCS#1 v1.5 padding.
///
/// @dev    Per V5.5 spec §9.5 + §11.{1,2}, this is the load-bearing
///         primitive for register()'s Gates 3 + 4. The leaf signature
///         (Gate 3) covers `sha256(signedAttrs)`; the issuer signature
///         (Gate 4) covers `leafTbsHash`. Same dispatch, same call site.
///
///         Signature wire format (`bytes sig`):
///           - P-256: 64 bytes raw `r || s`, big-endian. NO DER wrapping.
///                    The CMS extractor (V5.4 sdk/witness/v5/ecdsa-sig.ts)
///                    already converts DER ECDSA-Sig-Value to raw r||s
///                    for the witness builder; the same conversion runs
///                    on the contract-side caller before passing here.
///           - RSA:    Modulus-length blob (256B for 2048-bit, 384B for
///                    3072-bit, 512B for 4096-bit), big-endian. The CMS
///                    extractor extracts `signatureValue` BIT STRING
///                    content (RFC 5652 §5.6) verbatim.
///
/// @dev    Algorithm extension recipe (future V5.x):
///           1. Add Algorithm enum entry in SpkiAlg.
///           2. Append OID-prefix arm in SpkiAlg.detect().
///           3. Add a dispatch arm here calling the new host verifier.
///         No witness/circuit/proof changes required — the algorithm
///         is transparent to the proof layer.
library HostSig {
    error UnsupportedAlgorithm();
    error MalformedRsaSpki();
    error InvalidP256SigLength();

    /// @notice Verify a host signature over `digest` using the public
    ///         key in `spki`.
    /// @param  spki  Canonical DER SubjectPublicKeyInfo (RFC 5280).
    /// @param  digest sha256 of the bytes the signature covers.
    /// @param  sig   Signature bytes (algorithm-specific format — see
    ///               file header).
    /// @return ok    `true` iff the signature verifies.
    function verify(bytes memory spki, bytes32 digest, bytes memory sig)
        internal
        view
        returns (bool ok)
    {
        SpkiAlg.Algorithm alg = SpkiAlg.detect(spki);

        if (alg == SpkiAlg.Algorithm.P256) {
            return _verifyP256(spki, digest, sig);
        }
        if (alg == SpkiAlg.Algorithm.RSA_2048) {
            return _verifyRsa(spki, digest, sig);
        }
        revert UnsupportedAlgorithm();
    }

    /// @dev P-256 dispatch. Sig is exactly 64 bytes (r || s), big-endian.
    function _verifyP256(bytes memory spki, bytes32 digest, bytes memory sig)
        private
        view
        returns (bool)
    {
        if (sig.length != 64) revert InvalidP256SigLength();
        bytes32 r;
        bytes32 s;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
        }
        return P256Verify.verifyWithSpki(spki, digest, [r, s]);
    }

    /// @dev RSA dispatch. Parses (modulus, exponent) from canonical RSA
    ///      SPKI and calls OZ RSA.pkcs1Sha256.
    ///
    ///      RSA SPKI byte layout (RFC 8017 §A.1):
    ///        SEQUENCE {
    ///          SEQUENCE { OID rsaEncryption, NULL }   <- AlgorithmIdentifier
    ///          BIT STRING {
    ///            00                                    <- unused-bits prefix
    ///            SEQUENCE {                            <- RSAPublicKey
    ///              INTEGER modulus
    ///              INTEGER publicExponent
    ///            }
    ///          }
    ///        }
    function _verifyRsa(bytes memory spki, bytes32 digest, bytes memory sig)
        private
        view
        returns (bool)
    {
        (bytes memory n, bytes memory e) = _parseRsaSpki(spki);
        return RSA.pkcs1Sha256(digest, sig, e, n);
    }

    /// @dev Walk RSA SPKI DER, return (modulus, exponent) as `bytes`
    ///      slices ready for OZ RSA.pkcs1Sha256. Strips DER-INTEGER
    ///      leading 0x00 padding from the modulus (positive-integer
    ///      convention).
    function _parseRsaSpki(bytes memory spki)
        private
        pure
        returns (bytes memory modulus, bytes memory exponent)
    {
        // Skip outer SEQUENCE header → AlgorithmIdentifier.
        if (spki.length < 4 || uint8(spki[0]) != 0x30) revert MalformedRsaSpki();
        uint256 pos = 1 + _derLengthHeaderSize(spki, 1);

        // Skip AlgorithmIdentifier (its length-header gives us the next
        // tag offset).
        if (pos >= spki.length || uint8(spki[pos]) != 0x30) revert MalformedRsaSpki();
        uint256 algIdContentLen = _derLength(spki, pos + 1);
        uint256 algIdHdrLen = _derLengthHeaderSize(spki, pos + 1);
        pos += 1 + algIdHdrLen + algIdContentLen;

        // BIT STRING.
        if (pos >= spki.length || uint8(spki[pos]) != 0x03) revert MalformedRsaSpki();
        uint256 bitStringHdrLen = _derLengthHeaderSize(spki, pos + 1);
        pos += 1 + bitStringHdrLen;

        // Unused-bits byte (must be 0 for canonical RSA SPKI).
        if (pos >= spki.length || uint8(spki[pos]) != 0x00) revert MalformedRsaSpki();
        pos += 1;

        // Inner SEQUENCE — RSAPublicKey.
        if (pos >= spki.length || uint8(spki[pos]) != 0x30) revert MalformedRsaSpki();
        uint256 innerHdrLen = _derLengthHeaderSize(spki, pos + 1);
        pos += 1 + innerHdrLen;

        // INTEGER modulus.
        modulus = _readIntegerStripped(spki, pos);
        uint256 modContentLen = _derLength(spki, pos + 1);
        uint256 modHdrLen = _derLengthHeaderSize(spki, pos + 1);
        pos += 1 + modHdrLen + modContentLen;

        // INTEGER publicExponent. Don't strip leading 0x00 here (e=65537
        // = 0x010001 has high bit clear; canonical encoding has no pad).
        if (pos >= spki.length || uint8(spki[pos]) != 0x02) revert MalformedRsaSpki();
        uint256 expContentLen = _derLength(spki, pos + 1);
        uint256 expHdrLen = _derLengthHeaderSize(spki, pos + 1);
        uint256 expStart = pos + 1 + expHdrLen;
        if (expStart + expContentLen > spki.length) revert MalformedRsaSpki();
        exponent = _slice(spki, expStart, expContentLen);
    }

    /// @dev Read INTEGER at `spki[off]`, strip a single leading 0x00
    ///      sign-padding byte if present (DER positive-integer
    ///      convention used for RSA modulus).
    function _readIntegerStripped(bytes memory spki, uint256 off)
        private
        pure
        returns (bytes memory)
    {
        if (off >= spki.length || uint8(spki[off]) != 0x02) revert MalformedRsaSpki();
        uint256 contentLen = _derLength(spki, off + 1);
        uint256 hdrLen = _derLengthHeaderSize(spki, off + 1);
        uint256 start = off + 1 + hdrLen;
        if (start + contentLen > spki.length) revert MalformedRsaSpki();
        // Skip a single leading 0x00 if it's present and the next byte
        // has the high bit set (DER positive-integer convention).
        if (contentLen >= 2 && uint8(spki[start]) == 0x00 && (uint8(spki[start + 1]) & 0x80) != 0) {
            return _slice(spki, start + 1, contentLen - 1);
        }
        return _slice(spki, start, contentLen);
    }

    /// @dev Read a DER content-length value starting at `off`. Caller
    ///      MUST ensure header is well-formed first via
    ///      _derLengthHeaderSize. Short form returns the length byte
    ///      directly; long form decodes 1-4 length-of-length bytes.
    function _derLength(bytes memory data, uint256 off) private pure returns (uint256) {
        if (off >= data.length) revert MalformedRsaSpki();
        uint8 b0 = uint8(data[off]);
        if (b0 < 0x80) return b0;
        uint256 n = b0 & 0x7f;
        if (n == 0 || n > 4 || off + n >= data.length) revert MalformedRsaSpki();
        uint256 len = 0;
        for (uint256 i = 1; i <= n; i++) {
            len = (len << 8) | uint8(data[off + i]);
        }
        return len;
    }

    function _derLengthHeaderSize(bytes memory data, uint256 off) private pure returns (uint256) {
        if (off >= data.length) revert MalformedRsaSpki();
        uint8 b0 = uint8(data[off]);
        if (b0 < 0x80) return 1;
        uint256 n = b0 & 0x7f;
        if (n == 0 || n > 4) revert MalformedRsaSpki();
        return 1 + n;
    }

    function _slice(bytes memory data, uint256 start, uint256 len) private pure returns (bytes memory out) {
        if (start + len > data.length) revert MalformedRsaSpki();
        out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = data[start + i];
        }
    }
}
