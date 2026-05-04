// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Groth16VerifierV5_2Stub} from "../src/Groth16VerifierV5_2Stub.sol";
import {ZkqesRegistryV5_2, IGroth16VerifierV5_2} from "../src/ZkqesRegistryV5_2.sol";
import {ZkqesCertificate, IZkqesRegistry} from "../src/ZkqesCertificate.sol";

/// @notice v2 civic-terminal Base Sepolia deploy: deploys the real-pairing
///         stub verifier first, then the registry pointing at it, then the
///         certificate NFT bound to the registry. One forge-script
///         invocation, three contracts deployed.
///
///         Per spec §8.2 reorder, this fires BEFORE the Phase B ceremony
///         so the full /register and /account/rotate flows can be smoked
///         on Base Sepolia (chainId 84532) ahead of recruitment.
///         Post-ceremony: the registry's `groth16Verifier` is `immutable`,
///         so verifier rotation is a fresh registry redeploy with the
///         real ceremonied verifier address. (No in-place
///         `setVerifier(address)` admin call exists.) `base-sepolia.json`
///         flips `verifierKind: "stub"` → `"real"` + new addresses
///         post-ceremony.
///
/// Required env (same as DeployV5_2 less GROTH16_VERIFIER_ADDR):
///   PRIVATE_KEY            — deployer private key (also pays gas)
///   ADMIN_ADDRESS          — registry admin
///   INITIAL_TRUST_ROOT     — bytes32; flattener-eng's first trust-list root
///   INITIAL_POLICY_ROOT    — bytes32; first policy-list root
///   MINT_DEADLINE          — uint64; NFT mint window close (Unix seconds)
///
/// Optional env:
///   CHAIN_LABEL            — string for NFT constructor (default "UA")
///
/// Base Sepolia broadcast (chainId 84532):
///   forge script packages/contracts/script/DeployV5_2WithStub.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY \
///     --verifier-url https://api-sepolia.basescan.org/api -vv
///
/// Anvil dry-run against Base Sepolia fork:
///   anvil --fork-url $BASE_SEPOLIA_RPC_URL --port 8546 --chain-id 84532 &
///   PRIVATE_KEY=0xac0974... ADMIN_ADDRESS=0xf39F... \
///     INITIAL_TRUST_ROOT=0x... INITIAL_POLICY_ROOT=0x... \
///     MINT_DEADLINE=1792833194 \
///     forge script packages/contracts/script/DeployV5_2WithStub.s.sol \
///       --rpc-url http://localhost:8546 -vv
///
/// @dev    `ZkqesCertificate`'s constructor arg order is
///         `(registry, mintDeadline, chainLabel)` — uint64 BEFORE string.
///         If you flip them you'll get an unhelpful Solidity type error;
///         flagged here because the early v2 plan draft had them flipped.
contract DeployV5_2WithStub is Script {
    function run() external returns (
        address verifier,
        address registry,
        address certificate
    ) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        bytes32 initialTrustRoot = vm.envBytes32("INITIAL_TRUST_ROOT");
        bytes32 initialPolicyRoot = vm.envBytes32("INITIAL_POLICY_ROOT");
        uint64 mintDeadline = uint64(vm.envUint("MINT_DEADLINE"));

        string memory chainLabel = "UA";
        try vm.envString("CHAIN_LABEL") returns (string memory s) {
            if (bytes(s).length > 0) chainLabel = s;
        } catch {}

        vm.startBroadcast(deployerKey);

        // 1. Stub verifier (real BN254 pairing math, stub-ceremony key —
        //    pre-ceremony only). Same artifact as
        //    `RealTupleGasSnapshotV5_2.t.sol`'s `Groth16VerifierV5_2Stub`.
        Groth16VerifierV5_2Stub stub = new Groth16VerifierV5_2Stub();
        verifier = address(stub);
        console2.log("Groth16VerifierV5_2Stub:", verifier);

        // 2. Registry (constructor CREATE-deploys PoseidonT3 + PoseidonT7
        //    internally; emits ~33KB of init bytecode total).
        ZkqesRegistryV5_2 reg = new ZkqesRegistryV5_2(
            IGroth16VerifierV5_2(verifier),
            admin,
            initialTrustRoot,
            initialPolicyRoot
        );
        registry = address(reg);
        console2.log("ZkqesRegistryV5_2:", registry);
        console2.log("  PoseidonT3:     ", reg.poseidonT3());
        console2.log("  PoseidonT7:     ", reg.poseidonT7());
        console2.log("  admin:          ", reg.admin());
        console2.log("  trustedListRoot:", uint256(reg.trustedListRoot()));
        console2.log("  policyRoot:     ", uint256(reg.policyRoot()));

        // 3. Certificate NFT bound to the registry. Constructor arg order
        //    is (registry, mintDeadline, chainLabel) — see ZkqesCertificate.sol:31-39.
        ZkqesCertificate nft = new ZkqesCertificate(
            IZkqesRegistry(registry),
            mintDeadline,
            chainLabel
        );
        certificate = address(nft);
        console2.log("ZkqesCertificate:", certificate);
        console2.log("  mintDeadline:  ", mintDeadline);
        console2.log("  chainLabel:    ", chainLabel);

        vm.stopBroadcast();
    }
}
