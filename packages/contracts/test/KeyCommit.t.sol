// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {KeyCommit} from "../src/libs/KeyCommit.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";
import {PoseidonBytecode} from "../src/libs/PoseidonBytecode.sol";

/// @title  KeyCommit parity test — Solidity vs TS reference.
///
/// Loads `test/fixtures/v5_5/key-commit-parity.json` (mirrored from
/// repo-root `fixtures/v5_5/`) and asserts that `KeyCommit.commitSpki`
/// produces byte-identical output to the TS `keyCommit(spkiDer)` for
/// every canonical vector. If this test fails, the V5.5 trust-list root
/// will silently diverge from the proof's `leafKeyCommit` — fix the
/// drift before any merge.
contract KeyCommitParityTest is Test {
    using stdJson for string;

    address internal t3;
    address internal t7;

    function setUp() public {
        t3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
        t7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
    }

    function test_domainConstant_matchesFixture() public view {
        string memory json = vm.readFile(
            "packages/contracts/test/fixtures/v5_5/key-commit-parity.json"
        );
        string memory domainStr = json.readString(".domainConstant");
        uint256 fixtureDomain = vm.parseUint(domainStr);
        assertEq(
            KeyCommit.KEY_COMMIT_DOMAIN,
            fixtureDomain,
            "KEY_COMMIT_DOMAIN drift between Solidity + TS reference"
        );
    }

    function test_commitSpki_matchesAllParityVectors() public view {
        string memory json = vm.readFile(
            "packages/contracts/test/fixtures/v5_5/key-commit-parity.json"
        );
        // The fixture's `vectors` is a JSON array; each element has
        // `label`, `spkiHex`, `expectedChunkHash`, `expectedKeyCommit`.
        // stdJson can't parse arrays of objects in one call without a
        // matching struct, so we iterate by index.
        uint256 i = 0;
        while (true) {
            string memory base = string.concat(".vectors[", vm.toString(i), "]");
            // Probe the label at [i]; an empty string means we've walked
            // off the end of the array (stdJson returns "" for missing
            // string fields).
            string memory label;
            try this._readStringAt(json, string.concat(base, ".label")) returns (string memory s) {
                label = s;
            } catch {
                break;
            }
            if (bytes(label).length == 0) break;

            string memory spkiHex = json.readString(string.concat(base, ".spkiHex"));
            uint256 expected = vm.parseUint(
                json.readString(string.concat(base, ".expectedKeyCommit"))
            );
            uint256 expectedChunk = vm.parseUint(
                json.readString(string.concat(base, ".expectedChunkHash"))
            );

            bytes memory spki = vm.parseBytes(spkiHex);

            uint256 chunk = KeyCommit.poseidonChunkHashVarT7(t7, spki);
            assertEq(
                chunk,
                expectedChunk,
                string.concat("chunk-hash drift on vector: ", label)
            );

            uint256 commit = KeyCommit.commitSpki(t3, t7, spki);
            assertEq(
                commit,
                expected,
                string.concat("keyCommit drift on vector: ", label)
            );
            i++;
        }
        require(i > 0, "no vectors loaded - fixture path or shape wrong?");
    }

    function test_revertsOnSpkiTooLong() public {
        bytes memory tooLong = new bytes(601);
        vm.expectRevert(KeyCommit.SpkiTooLong.selector);
        this._commitSpki(tooLong);
    }

    // External wrapper so vm.expectRevert can catch lib reverts.
    function _commitSpki(bytes calldata spki) external view returns (uint256) {
        return KeyCommit.commitSpki(t3, t7, spki);
    }

    function _readStringAt(string calldata json, string calldata key)
        external
        pure
        returns (string memory)
    {
        return stdJson.readString(json, key);
    }
}
