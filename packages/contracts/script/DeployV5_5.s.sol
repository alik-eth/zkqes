// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ZkqesRegistryV5_5} from "../src/ZkqesRegistryV5_5.sol";
import {Groth16VerifierV5_5Stub, IGroth16VerifierV5_5} from "../src/Groth16VerifierV5_5Stub.sol";
import {Poseidon} from "../src/libs/Poseidon.sol";
import {PoseidonBytecode} from "../src/libs/PoseidonBytecode.sol";

/// @notice V5.5 deploy script. Pre-deploys PoseidonT3 + PoseidonT7 as
///         separate addresses and threads them into ZkqesRegistryV5_5's
///         constructor (V5.4 pattern, post-2026-05-05 Base Sepolia
///         MAX_INITCODE_SIZE failure). Embedding the ~33 KB Poseidon
///         initcodes inside the registry constructor pushes total
///         registry initcode over EIP-3860's ~24.5 KB cap.
///
///         The Groth16 verifier defaults to a stub (Groth16VerifierV5_5Stub
///         with accepts=true) so this script can run pre-Phase-B ceremony
///         on Anvil / Sepolia / Base Sepolia for end-to-end smoke. Once
///         the real V5.5 ceremony lands, override IDENTITY_VERIFIER_ADDR
///         with the real verifier address (same `verifyProof(uint[21])`
///         ABI — drop-in compatible).
///
/// Required env (sourced via `set -a; source .env; set +a`):
///   PRIVATE_KEY            — deployer private key
///   ADMIN_ADDRESS          — registry admin
///   INITIAL_TRUST_ROOT     — bytes32; Diia (or other QTSP) trust-list Poseidon root
///   INITIAL_POLICY_ROOT    — bytes32; first policy-list Poseidon root
///
/// Optional env:
///   IDENTITY_VERIFIER_ADDR — if 0x0 or unset, deploys a fresh
///                            Groth16VerifierV5_5Stub(accepts=true).
///                            Override with a real ceremony verifier
///                            address once Phase B completes.
///   POSEIDON_T3_ADDR       — if 0x0 or unset, deploys fresh PoseidonT3.
///                            Override to reuse an existing pre-deploy.
///   POSEIDON_T7_ADDR       — same shape as POSEIDON_T3_ADDR.
///
/// Anvil dry-run:
///   set -a; source .env; set +a
///   forge script packages/contracts/script/DeployV5_5.s.sol \
///     --rpc-url http://localhost:8545 -vv
///
/// Sepolia / Base Sepolia broadcast:
///   set -a; source .env; set +a
///   forge script packages/contracts/script/DeployV5_5.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --broadcast --verify --chain sepolia \
///     --etherscan-api-key $ETHERSCAN_API_KEY -vv
contract DeployV5_5 is Script {
    function run() external returns (
        address identityVerifier,
        address poseidonT3,
        address poseidonT7,
        address registry
    ) {
        uint256 deployerKey       = vm.envUint("PRIVATE_KEY");
        address adminAddr         = vm.envAddress("ADMIN_ADDRESS");
        bytes32 initialTrustRoot  = vm.envBytes32("INITIAL_TRUST_ROOT");
        bytes32 initialPolicyRoot = vm.envBytes32("INITIAL_POLICY_ROOT");

        // Optional reuse overrides.
        identityVerifier = vm.envOr("IDENTITY_VERIFIER_ADDR", address(0));
        poseidonT3       = vm.envOr("POSEIDON_T3_ADDR", address(0));
        poseidonT7       = vm.envOr("POSEIDON_T7_ADDR", address(0));

        vm.startBroadcast(deployerKey);

        // 1. Identity verifier — fresh stub by default.
        if (identityVerifier == address(0)) {
            Groth16VerifierV5_5Stub idStub = new Groth16VerifierV5_5Stub(true);
            identityVerifier = address(idStub);
            console2.log("Deployed fresh Groth16VerifierV5_5Stub(accepts=true):", identityVerifier);
            console2.log("  WARNING: stub verifier accepts ALL proofs - DEV ONLY");
        } else {
            console2.log("Reusing identity verifier (override):              ", identityVerifier);
        }

        // 2. PoseidonT3 — pre-deployed externally per V5.4 lesson.
        if (poseidonT3 == address(0)) {
            poseidonT3 = Poseidon.deploy(PoseidonBytecode.t3Initcode());
            console2.log("Deployed fresh PoseidonT3:                        ", poseidonT3);
        } else {
            console2.log("Reusing PoseidonT3 (override):                    ", poseidonT3);
        }

        // 3. PoseidonT7 — pre-deployed externally per V5.4 lesson.
        if (poseidonT7 == address(0)) {
            poseidonT7 = Poseidon.deploy(PoseidonBytecode.t7Initcode());
            console2.log("Deployed fresh PoseidonT7:                        ", poseidonT7);
        } else {
            console2.log("Reusing PoseidonT7 (override):                    ", poseidonT7);
        }

        // 4. ZkqesRegistryV5_5 — accepts pre-deployed Poseidon addresses.
        ZkqesRegistryV5_5 reg = new ZkqesRegistryV5_5(
            IGroth16VerifierV5_5(identityVerifier),
            adminAddr,
            initialTrustRoot,
            initialPolicyRoot,
            poseidonT3,
            poseidonT7
        );
        registry = address(reg);
        console2.log("Deployed ZkqesRegistryV5_5:                       ", registry);
        console2.log("  admin:                                           ", reg.admin());
        console2.log("  trustedListRoot (uint256):                       ", uint256(reg.trustedListRoot()));
        console2.log("  policyRoot      (uint256):                       ", uint256(reg.policyRoot()));
        console2.log("  groth16Verifier:                                 ", address(reg.groth16Verifier()));
        console2.log("  poseidonT3:                                      ", reg.poseidonT3());
        console2.log("  poseidonT7:                                      ", reg.poseidonT7());

        vm.stopBroadcast();
    }
}
