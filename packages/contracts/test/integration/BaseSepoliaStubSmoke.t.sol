// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ZkqesRegistryV5_2, IGroth16VerifierV5_2} from "../../src/ZkqesRegistryV5_2.sol";
import {ZkqesCertificate} from "../../src/ZkqesCertificate.sol";

/// @notice Fork smoke test against the live Base Sepolia v5_2 stub deploy.
///
/// @dev    Runs against the chain at `BASE_SEPOLIA_RPC_URL` (forked into
///         the test process via `vm.createSelectFork`); verifies the
///         live registry's admin, trustedListRoot, verifier-bytecode-
///         present, and `nullifierOf(unseenWallet) == 0` invariants.
///         Catches deploy-time mis-wiring that the cast probes in
///         Task 2 wouldn't surface (e.g., wrong admin baked into
///         immutable, verifier address pointing at empty code, RPC
///         actually being L1 Sepolia not Base Sepolia).
///
/// @dev    Reads addresses from env: `BASE_SEPOLIA_REGISTRY`,
///         `BASE_SEPOLIA_VERIFIER`, `BASE_SEPOLIA_CERTIFICATE`,
///         `BASE_SEPOLIA_RPC_URL`, `ADMIN_ADDRESS`. **Skips silently**
///         when `BASE_SEPOLIA_RPC_URL` or `BASE_SEPOLIA_REGISTRY` is
///         unset (CI lane without secrets). If REGISTRY is set, the
///         remaining env vars (CERTIFICATE, ADMIN_ADDRESS) MUST also
///         be set — partial-config callers will hit a hard `vm.envAddress`
///         revert at setUp() time, which is the intended behavior
///         (operator misconfig, not graceful skip).
///
/// @dev    `setUp` asserts `block.chainid == 84532` so a misconfigured
///         `BASE_SEPOLIA_RPC_URL` (e.g., accidentally pointing at L1
///         Sepolia 11155111 or Base mainnet 8453) fails LOUDLY at
///         setup rather than silently producing a green test against
///         the wrong chain.
contract BaseSepoliaStubSmokeTest is Test {
    uint256 constant BASE_SEPOLIA_CHAIN_ID = 84532;

    ZkqesRegistryV5_2 reg;
    ZkqesCertificate nft;
    address admin;

    function setUp() public {
        // Skip silently if the RPC endpoint isn't configured (CI lane).
        string memory rpc;
        try vm.envString("BASE_SEPOLIA_RPC_URL") returns (string memory s) {
            rpc = s;
        } catch {}
        if (bytes(rpc).length == 0) {
            console2.log("BASE_SEPOLIA_RPC_URL unset; skipping fork test");
            return;
        }
        vm.createSelectFork(rpc);
        require(
            block.chainid == BASE_SEPOLIA_CHAIN_ID,
            "fork is not Base Sepolia (chainId 84532)"
        );

        // Skip silently if the deploy hasn't happened yet — the broadcast
        // is the gate that produces these addresses.
        address regAddr;
        try vm.envAddress("BASE_SEPOLIA_REGISTRY") returns (address a) {
            regAddr = a;
        } catch {}
        if (regAddr == address(0)) {
            console2.log("BASE_SEPOLIA_REGISTRY unset; skipping fork test");
            return;
        }
        reg = ZkqesRegistryV5_2(regAddr);
        nft = ZkqesCertificate(vm.envAddress("BASE_SEPOLIA_CERTIFICATE"));
        admin = vm.envAddress("ADMIN_ADDRESS");
    }

    /* ---------- Tests ---------- */

    /// @dev Registry's immutable admin matches the env-pumped value;
    ///      `trustedListRoot()` is non-zero (deploy-time INITIAL_TRUST_ROOT
    ///      env was honored). Catches "deploy succeeded but constructor
    ///      args swapped" footguns.
    function testFork_RegistryWiredCorrectly() public view {
        if (address(reg) == address(0)) return;  // skipped (no env / no deploy)
        assertEq(reg.admin(), admin, "registry admin mismatch");
        assertGt(uint256(reg.trustedListRoot()), 0, "trusted list root unset");
    }

    /// @dev The verifier address baked into the registry's immutable has
    ///      bytecode at it. Catches "verifier address is EOA / typo / zero
    ///      address" mis-wiring — the registry's `verifyProof` calls would
    ///      revert with no return-data otherwise, with no clean error.
    function testFork_VerifierIsStub() public view {
        if (address(reg) == address(0)) return;  // skipped
        // Note: the verifier accessor on `ZkqesRegistryV5_2` is the
        // auto-generated getter for the immutable field
        // `IGroth16VerifierV5_2 public immutable groth16Verifier` —
        // i.e. `groth16Verifier()`, NOT `verifier()`. (The earlier v2
        // plan draft referenced `verifier()`; corrected here against
        // the actual source at src/ZkqesRegistryV5_2.sol:76.)
        address verifierAddr = address(reg.groth16Verifier());
        assertGt(verifierAddr.code.length, 0, "verifier has no code");
    }

    /// @dev Sanity-check the read path of the registry: a never-registered
    ///      wallet maps to bytes32(0). If the registry's storage is
    ///      somehow corrupt or the address bytes are misaligned, this
    ///      surfaces it before web-eng smokes /register.
    function testFork_NullifierOfReturnsZeroForUnseenWallet() public view {
        if (address(reg) == address(0)) return;  // skipped
        bytes32 nullifier = reg.nullifierOf(address(0xdeadbeef));
        assertEq(nullifier, bytes32(0), "expected zero nullifier for unseen wallet");
    }
}
