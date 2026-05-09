// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ZKQESRegistryUA} from "../src/ZKQESRegistryUA.sol";
import {Groth16VerifierV5_5Stub} from "../src/Groth16VerifierV5_5Stub.sol";
import {Groth16AgeVerifierUAStub} from "../src/Groth16AgeVerifierUAStub.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";
import {PoseidonBytecode} from "../src/libs/PoseidonBytecode.sol";

/// @notice V7 Base Sepolia deploy. V7 = V5.5 wire + V5.6 features
///         (spec `docs/superpowers/specs/2026-05-09-v7-merged-amendment.md`).
///         Pre-deploys PoseidonT3 + PoseidonT7 separately and threads
///         them into the registry constructor — keeps registry initcode
///         under EIP-3860 / Base Sepolia limits.
///
/// @dev    Uses Groth16VerifierV5_5Stub for the identity verifier slot
///         (always-true, uint256[21] input). Replace with the real
///         post-pot23 ceremony verifier address via `IDENTITY_VERIFIER_ADDR`.
///
/// Required env (sourced via `set -a; source .env; set +a`):
///   PRIVATE_KEY            — deployer private key
///   ADMIN_ADDRESS          — registry admin
///   INITIAL_TRUST_ROOT     — bytes32; UA Diia trust-list Poseidon root
///                            over KeyCommit leaves (V5.5 NEW)
///   INITIAL_POLICY_ROOT    — bytes32; first policy-list Poseidon root
///
/// Optional env (override stub deploys):
///   IDENTITY_VERIFIER_ADDR — V5.5 21-signal Groth16 verifier; deploys
///                            a fresh stub if unset/0x0.
///   AGE_VERIFIER_ADDR      — V5.4 AgeDiiaUA verifier; deploys a fresh
///                            stub if unset/0x0.
///
/// Base Sepolia broadcast:
///   set -a; source .env; set +a
///   forge script packages/contracts/script/DeployV7UA.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast --verify --chain base-sepolia \
///     --etherscan-api-key $BASESCAN_API_KEY -vv
contract DeployV7UA is Script {
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

        identityVerifier = vm.envOr("IDENTITY_VERIFIER_ADDR", address(0));
        ageVerifier      = vm.envOr("AGE_VERIFIER_ADDR",      address(0));

        vm.startBroadcast(deployerKey);

        if (identityVerifier == address(0)) {
            identityVerifier = address(new Groth16VerifierV5_5Stub(true));
            console2.log("Deployed fresh Groth16VerifierV5_5Stub:           ", identityVerifier);
        } else {
            console2.log("Using identity verifier:                          ", identityVerifier);
        }

        if (ageVerifier == address(0)) {
            ageVerifier = address(new Groth16AgeVerifierUAStub());
            console2.log("Deployed fresh Groth16AgeVerifierUAStub:          ", ageVerifier);
        } else {
            console2.log("Using age verifier:                               ", ageVerifier);
        }

        poseidonT3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
        console2.log("Deployed PoseidonT3:                              ", poseidonT3);
        poseidonT7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
        console2.log("Deployed PoseidonT7:                              ", poseidonT7);

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
        console2.log("Deployed ZKQESRegistryUA (V7):                    ", registry);
        console2.log("  VERSION:                                          ", reg.VERSION());
        console2.log("  admin:                                            ", reg.admin());
        console2.log("  trustedRoot (uint256):                            ", uint256(reg.trustedRoot()));
        console2.log("  policyRoot  (uint256):                            ", uint256(reg.policyRoot()));
        console2.log("  country:                                           UA");

        vm.stopBroadcast();
    }
}
