// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {HostSig} from "../src/libs/HostSig.sol";
import {SpkiAlg} from "../src/libs/SpkiAlg.sol";

/// @title  HostSig dispatch tests.
///
/// Two paths to exercise:
///   1. P-256: dispatch reaches the EIP-7212 precompile (mocked here
///      because revm doesn't ship 0x0100). Asserts return value
///      pass-through + the sig length guard.
///   2. RSA: SPKI parser correctly extracts (modulus, exponent) from
///      synthetic RSA-2048/3072/4096 SPKIs in the parity fixture.
///      Skips end-to-end OZ RSA.pkcs1Sha256 verify because we'd need a
///      real signing keypair; that path is exercised in the V5.5
///      registry integration test once a real RSA QTSP fixture lands.
contract HostSigTest is Test {
    using stdJson for string;

    // EIP-7212 P256VERIFY precompile address — same as P256Verify.sol.
    address internal constant P256_PRECOMPILE = address(0x0000000000000000000000000000000000000100);

    // ---- helpers ----

    /// Wrapper since vm.expectRevert can only catch reverts from
    /// external calls.
    function _verify(bytes calldata spki, bytes32 digest, bytes calldata sig)
        external
        view
        returns (bool)
    {
        return HostSig.verify(spki, digest, sig);
    }

    function _loadFixtureVector(string memory key) internal view returns (bytes memory) {
        string memory json = vm.readFile(
            "packages/contracts/test/fixtures/v5_5/key-commit-parity.json"
        );
        return vm.parseBytes(json.readString(key));
    }

    // ---- P-256 path ----

    function test_p256_returns_true_when_precompile_accepts() public {
        // Canonical 91-byte P-256 named-curve SPKI (RFC 5480 §2.1.1.1).
        bytes memory spki = _CANONICAL_P256_SPKI;
        bytes32 digest = keccak256("test");
        bytes memory sig = new bytes(64); // r,s zero-padded; precompile is mocked
        // Mock the precompile to return 32-byte 0x01 (valid signature
        // per EIP-7212 contract).
        vm.mockCall(P256_PRECOMPILE, "", abi.encode(uint256(1)));
        bool ok = HostSig.verify(spki, digest, sig);
        assertTrue(ok, "dispatch should pass through precompile-accept result");
    }

    function test_p256_revert_on_wrong_sig_length() public {
        bytes memory tooShort = new bytes(63); // P-256 raw r||s is exactly 64 bytes
        vm.expectRevert(HostSig.InvalidP256SigLength.selector);
        this._verify(_CANONICAL_P256_SPKI, bytes32(0), tooShort);
    }

    /// 91-byte canonical RFC 5480 §2.1.1.1 named-curve P-256 SPKI. X
    /// and Y coordinates are filler 0x11 / 0x22 — sufficient to exercise
    /// the SPKI structural parser; precompile invocation is mocked
    /// regardless of actual point validity.
    bytes constant _CANONICAL_P256_SPKI =
        hex"3059301306072a8648ce3d020106082a8648ce3d0301070342000411111111111111111111111111111111111111111111111111111111111111112222222222222222222222222222222222222222222222222222222222222222";

    // ---- RSA path: SPKI parser ----

    function test_rsa_2048_parser_extracts_correct_lengths() public {
        // The synthetic rsa-2048-pkcs1-spki vector has 256-byte modulus
        // and 65537 exponent (3 bytes encoded as 01 00 01).
        bytes memory spki = _loadFixtureVector(".vectors[5].spkiHex");
        // No way to call internal parser directly; exercise via verify
        // with a stub OZ RSA call. OZ RSA.pkcs1Sha256 returns false on
        // any malformed input including bogus sig — we just assert it
        // doesn't revert during parsing.
        bytes memory bogusSig = new bytes(256);
        bool ok = HostSig.verify(spki, bytes32(0), bogusSig);
        assertFalse(ok, "bogus RSA sig should verify-false (not revert during parse)");
    }

    function test_rsa_3072_parser_no_revert() public {
        bytes memory spki = _loadFixtureVector(".vectors[6].spkiHex");
        bytes memory bogusSig = new bytes(384);
        bool ok = HostSig.verify(spki, bytes32(0), bogusSig);
        assertFalse(ok);
    }

    function test_rsa_4096_parser_no_revert() public {
        bytes memory spki = _loadFixtureVector(".vectors[7].spkiHex");
        bytes memory bogusSig = new bytes(512);
        bool ok = HostSig.verify(spki, bytes32(0), bogusSig);
        assertFalse(ok);
    }

    // ---- RSA path: end-to-end verify with real fixture ----

    /// Real RSA-2048 keypair signature, generated via node:crypto:
    ///   const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    ///     modulusLength: 2048, publicExponent: 65537 });
    ///   const sig = sign('sha256', Buffer.from('hello v5.5 rsa'),
    ///     { key: privateKey, padding: RSA_PKCS1_PADDING });
    /// SPKI is RFC 8017 §A.1 canonical, signature is PKCS#1 v1.5 over
    /// SHA-256. End-to-end test covers HostSig.verify → SpkiAlg.detect →
    /// _verifyRsa → _parseRsaSpki → OZ RSA.pkcs1Sha256.
    bytes constant _RSA_SPKI_REAL = hex"30820122300d06092a864886f70d01010105000382010f003082010a0282010100b71dccdcab883a8cee0b77574ec3cd3513f6940229385606daa48148e7cc8126474b3049992e5df358895c39fa446dd13b3e8f92c9db3adf973e090ea04d6541fcd50780a6970b5ec659f2b11da4af67e2595882789f8a5cdce74e35fdede16458df0ce49c669b73ee81b766777cb9f086e2a7432cfa2256cea35b212532698f778fa6667a68f472d5b0934c9d983c018f03da9ac71eabe1c84abe00a829201ff92ddddcf2d7f00e78d698559695320e3a197a1fc912ac734c96a9d29d378d78715e2db851481f75e5c90080d019cc9c95c5e71c7d43c5c209d0d2271752b241bc914b89ad4056fc95654edf1a0fc6bcef66217171946a7814f414bdd8e40a2f0203010001";

    bytes constant _RSA_SIG_REAL = hex"332a1f46afb39459abb61e5fc4dc93b732d1ef05a9a250d8f106f88434bf09126644c1ad05acceef676ddfa0adbe4d1e6764980600669a31d8c6956bff9f713adb1bc67cdb96daa05522db88e25f14eb54f7a2e0a9983bd94e85d816e34bd7c65147169928e448b6a230dfdf2db2a58221ef61db2a95feed25a15e3a8c15ad03c3838bacd4c78d029422f5a31a9f4f7697e5ed3cf29cb3b3ad497acc36a8832fd6dc600141d32e49682c7e46e1aa5f2dab460d569ef9cceb89f114883853c732582ca9f21b9f4b12ba492af2fe5258bb93db6ad3808d4595ad9ca493c766eb717b8d4d63abf611c1a239768929e88e64fe5298a9b7446bd05a1b6bec851893e9";

    bytes32 constant _RSA_DIGEST_REAL = 0x8090d281c09d0edfb7f0acfd2779bdb1c8ce0e2b0a5c348729d1d30556dbd610;

    function test_rsa_e2e_verifies_real_signature() public view {
        bool ok = HostSig.verify(_RSA_SPKI_REAL, _RSA_DIGEST_REAL, _RSA_SIG_REAL);
        assertTrue(ok, "real RSA-2048 PKCS#1v1.5 SHA-256 sig should verify");
    }

    function test_rsa_e2e_rejects_tampered_digest() public view {
        bytes32 tamperedDigest = bytes32(uint256(_RSA_DIGEST_REAL) ^ 1);
        bool ok = HostSig.verify(_RSA_SPKI_REAL, tamperedDigest, _RSA_SIG_REAL);
        assertFalse(ok, "RSA verify should reject mismatched digest");
    }

    function test_rsa_e2e_rejects_tampered_sig() public view {
        bytes memory tamperedSig = _RSA_SIG_REAL;
        // Flip a bit in the middle of the signature.
        tamperedSig[128] ^= bytes1(uint8(0x01));
        bool ok = HostSig.verify(_RSA_SPKI_REAL, _RSA_DIGEST_REAL, tamperedSig);
        assertFalse(ok, "RSA verify should reject tampered signature");
    }

    // ---- malformed inputs surface from upstream SpkiAlg ----

    function test_revert_on_unknown_oid() public {
        // 91-byte structure with id-ecPublicKey replaced by DSA OID.
        bytes memory bad = hex"3059301306072a8648ce3804010106082a8648ce3d030107034200041111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
        vm.expectRevert(SpkiAlg.UnsupportedAlgorithm.selector);
        this._verify(bad, bytes32(0), new bytes(64));
    }
}
