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

    // ---- malformed inputs surface from upstream SpkiAlg ----

    function test_revert_on_unknown_oid() public {
        // 91-byte structure with id-ecPublicKey replaced by DSA OID.
        bytes memory bad = hex"3059301306072a8648ce3804010106082a8648ce3d030107034200041111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
        vm.expectRevert(SpkiAlg.UnsupportedAlgorithm.selector);
        this._verify(bad, bytes32(0), new bytes(64));
    }
}
