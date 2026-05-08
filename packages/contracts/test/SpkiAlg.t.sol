// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {SpkiAlg} from "../src/libs/SpkiAlg.sol";

/// @title  SpkiAlg unit tests — algorithm dispatch over SPKI OID prefix.
///
/// Reuses the V5.5 KeyCommit parity fixture (test/fixtures/v5_5/key-commit-parity.json)
/// because it carries canonical SPKI samples for P-256 and RSA at
/// 2048/3072/4096 modulus lengths. Detection MUST classify each correctly.
contract SpkiAlgTest is Test {
    using stdJson for string;

    function test_detect_p256_named_curve_spki() public pure {
        // 91-byte canonical RFC 5480 §2.1.1.1 P-256 SPKI from the parity
        // fixture's `p256-named-curve-spki` vector.
        bytes memory spki = hex"3059301306072a8648ce3d020106082a8648ce3d030107034200041111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
        SpkiAlg.Algorithm alg = SpkiAlg.detect(spki);
        assertEq(uint256(alg), uint256(SpkiAlg.Algorithm.P256));
    }

    function test_detect_rsa_2048_spki() public {
        string memory json = vm.readFile(
            "packages/contracts/test/fixtures/v5_5/key-commit-parity.json"
        );
        bytes memory spki = vm.parseBytes(
            json.readString(".vectors[5].spkiHex")  // rsa-2048-pkcs1-spki
        );
        SpkiAlg.Algorithm alg = SpkiAlg.detect(spki);
        assertEq(uint256(alg), uint256(SpkiAlg.Algorithm.RSA_2048));
    }

    function test_detect_rsa_3072_returns_RSA_2048_tag() public {
        // Same OID prefix; the "RSA_2048" enum name covers all
        // rsaEncryption keys regardless of modulus length. OZ
        // RSA.pkcs1Sha256 handles arbitrary modulus.
        string memory json = vm.readFile(
            "packages/contracts/test/fixtures/v5_5/key-commit-parity.json"
        );
        bytes memory spki = vm.parseBytes(
            json.readString(".vectors[6].spkiHex")  // rsa-3072-pkcs1-spki
        );
        SpkiAlg.Algorithm alg = SpkiAlg.detect(spki);
        assertEq(uint256(alg), uint256(SpkiAlg.Algorithm.RSA_2048));
    }

    function test_detect_rsa_4096_returns_RSA_2048_tag() public {
        string memory json = vm.readFile(
            "packages/contracts/test/fixtures/v5_5/key-commit-parity.json"
        );
        bytes memory spki = vm.parseBytes(
            json.readString(".vectors[7].spkiHex")  // rsa-4096-pkcs1-spki
        );
        SpkiAlg.Algorithm alg = SpkiAlg.detect(spki);
        assertEq(uint256(alg), uint256(SpkiAlg.Algorithm.RSA_2048));
    }

    function test_revert_on_truncated_spki() public {
        bytes memory bad = hex"3059";  // SEQUENCE header only, no body
        vm.expectRevert(SpkiAlg.MalformedSpki.selector);
        this._detect(bad);
    }

    function test_revert_on_non_sequence() public {
        bytes memory bad = hex"02010001";  // INTEGER, not SEQUENCE
        vm.expectRevert(SpkiAlg.MalformedSpki.selector);
        this._detect(bad);
    }

    function test_revert_on_unknown_oid() public {
        // 91-byte structure with id-ecPublicKey replaced by a fake
        // 7-byte OID (DSA: 1.2.840.10040.4.1 = 2a 86 48 ce 38 04 01).
        // Length stays 91; OID prefix differs, so detect() should revert.
        bytes memory bad = hex"3059301306072a8648ce3804010106082a8648ce3d030107034200041111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
        vm.expectRevert(SpkiAlg.UnsupportedAlgorithm.selector);
        this._detect(bad);
    }

    function _detect(bytes calldata spki) external pure returns (SpkiAlg.Algorithm) {
        return SpkiAlg.detect(spki);
    }
}
