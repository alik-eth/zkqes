// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ZKQESRegistryUA} from "../src/ZKQESRegistryUA.sol";
import {Groth16VerifierV5_2Placeholder} from "../src/Groth16VerifierV5_2Placeholder.sol";
import {Groth16AgeVerifierUAStub} from "../src/Groth16AgeVerifierUAStub.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";
import {PoseidonBytecode} from "../src/libs/PoseidonBytecode.sol";

/// @notice V5.4 Base Sepolia deploy. Post-failure-2026-05-05 redesign:
///         pre-deploys PoseidonT3 + PoseidonT7 as separate addresses
///         and threads them into `ZKQESRegistryUA`'s constructor, instead
///         of CREATE-deploying them inside the registry's own constructor.
///         The latter pattern (V5.2 baseline) embedded ~33 KB of Poseidon
///         initcodes into the registry's own bytecode and tipped V5.4
///         over Base Sepolia's effective MAX_INITCODE_SIZE ceiling.
///         Pre-deploy + pass-as-args drops the registry's initcode from
///         ~41.6 KB to ~6.3 KB.
///
/// @dev    On the failed-broadcast partial state from the prior attempt:
///         two stubs landed on-chain at deterministic addresses (admin
///         nonce-based) and are ABI-compatible with the new flow. Rather
///         than burning fresh deploys, the script defaults to reusing
///         them via the pre-baked constants below. Override via
///         `IDENTITY_VERIFIER_ADDR` / `AGE_VERIFIER_ADDR` env to deploy
///         fresh ones (e.g., for a fully-clean redeploy or a different
///         chain).
///
/// Required env (sourced via `set -a; source .env; set +a`):
///   PRIVATE_KEY            — deployer private key
///   ADMIN_ADDRESS          — registry admin
///   INITIAL_TRUST_ROOT     — bytes32; UA Diia trust-list Poseidon root
///   INITIAL_POLICY_ROOT    — bytes32; first policy-list Poseidon root
///
/// Optional env (override stub reuse / force fresh deploys):
///   IDENTITY_VERIFIER_ADDR — if 0x0 or unset, reuses the committed
///                            pre-deploy at REUSE_IDENTITY_VERIFIER below;
///                            otherwise uses the env value as-is. Pass
///                            `0x0000…0001` (or any non-zero sentinel that
///                            is NOT the reuse address) to force a fresh
///                            stub deploy.
///   AGE_VERIFIER_ADDR      — same shape as above, REUSE_AGE_VERIFIER default.
///
/// Base Sepolia broadcast:
///   set -a; source .env; set +a
///   forge script packages/contracts/script/DeployV5_4UA.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast --verify --chain base-sepolia \
///     --etherscan-api-key $BASESCAN_API_KEY -vv
contract DeployV5_4UA is Script {
    /// Pre-deployed stubs from the failed broadcast at 2026-05-05
    /// (`/tmp/v5_4-stub-deploy.log`). Pinned for reuse to avoid burning
    /// fresh deploys on a contract whose bytecode is identical and whose
    /// purpose-built ABI is exercised by the V5.4 unit suite.
    address internal constant REUSE_IDENTITY_VERIFIER = 0xa669F0Ede4eBD025897554Af8aCcE31eA4990f04;
    address internal constant REUSE_AGE_VERIFIER      = 0xc30DF40b1E2F8af15a36DBebc0E1BD91E1E2a693;

    function run() external returns (
        address identityVerifier,
        address ageVerifier,
        address poseidonT3,
        address poseidonT7,
        address registry
    ) {
        uint256 deployerKey       = vm.envUint("PRIVATE_KEY");
        address adminAddr         = vm.envAddress("ADMIN_ADDRESS");
        bytes32 initialTrustRoot  = vm.envBytes32("INITIAL_TRUST_ROOT");
        bytes32 initialPolicyRoot = vm.envBytes32("INITIAL_POLICY_ROOT");

        // Optional reuse overrides — defaults to the pre-deployed stubs.
        identityVerifier = vm.envOr("IDENTITY_VERIFIER_ADDR", REUSE_IDENTITY_VERIFIER);
        ageVerifier      = vm.envOr("AGE_VERIFIER_ADDR",      REUSE_AGE_VERIFIER);

        vm.startBroadcast(deployerKey);

        // 1. Identity verifier (deploy fresh if no reuse override; else
        //    use the pre-deployed stub at REUSE_IDENTITY_VERIFIER).
        if (identityVerifier == REUSE_IDENTITY_VERIFIER) {
            console2.log("Reusing identity verifier (V5.3-compatible stub):", identityVerifier);
        } else {
            Groth16VerifierV5_2Placeholder idStub = new Groth16VerifierV5_2Placeholder();
            identityVerifier = address(idStub);
            console2.log("Deployed fresh Groth16VerifierV5_2Placeholder:           ", identityVerifier);
        }

        // 2. Age verifier (same reuse pattern).
        if (ageVerifier == REUSE_AGE_VERIFIER) {
            console2.log("Reusing age verifier (V5.4 stub):                 ", ageVerifier);
        } else {
            Groth16AgeVerifierUAStub ageStubImpl = new Groth16AgeVerifierUAStub();
            ageVerifier = address(ageStubImpl);
            console2.log("Deployed fresh Groth16AgeVerifierUAStub:          ", ageVerifier);
        }

        // 3. PoseidonT3 (V5.4 NEW vs V5.2: pre-deployed externally instead
        //    of CREATE-deployed in the registry constructor — keeps the
        //    registry's own initcode under EIP-3860 + Base Sepolia limits).
        poseidonT3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
        console2.log("Deployed PoseidonT3:                              ", poseidonT3);

        // 4. PoseidonT7 (V5.4 NEW; same rationale as T3).
        poseidonT7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
        console2.log("Deployed PoseidonT7:                              ", poseidonT7);

        // 5. ZKQESRegistryUA — accepts pre-deployed Poseidon addresses.
        ZKQESRegistryUA reg = new ZKQESRegistryUA(
            initialTrustRoot,
            initialPolicyRoot,
            identityVerifier,
            ageVerifier,
            adminAddr,
            poseidonT3,
            poseidonT7
        );
        registry = address(reg);
        console2.log("Deployed ZKQESRegistryUA:                         ", registry);
        console2.log("  admin:                                           ", reg.admin());
        console2.log("  trustedRoot (uint256):                           ", uint256(reg.trustedRoot()));
        console2.log("  policyRoot  (uint256):                           ", uint256(reg.policyRoot()));
        console2.log("  country:                                          UA");
        console2.log("  identityVerifier (per IZKQESRegistry):           ", reg.identityVerifier());
        console2.log("  ageVerifier      (per IZKQESRegistry):           ", reg.ageVerifier());
        console2.log("  poseidonT3:                                      ", reg.poseidonT3());
        console2.log("  poseidonT7:                                      ", reg.poseidonT7());

        vm.stopBroadcast();
    }
}
