// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ZKQESRegistryUA} from "../src/ZKQESRegistryUA.sol";
import {Groth16VerifierV5_2Stub} from "../src/Groth16VerifierV5_2Stub.sol";
import {Groth16AgeVerifierUAStub} from "../src/Groth16AgeVerifierUAStub.sol";

/// @notice V5.4 Base Sepolia deploy: identity verifier (V5.3-compatible
///         stub) + age verifier (V5.4 stub) + ZKQESRegistryUA. One forge-
///         script invocation, three contracts deployed.
///
///         Per V5.4 plan §Task 4 + lead-confirmed parallel-to-ceremony
///         posture, this dispatches NOW with stubs (matches v0.7.0 stub-
///         deploy pattern). Post-Phase-B ceremony swap = fresh redeploy
///         with real ceremonied verifier addresses (both verifier slots
///         in `ZKQESRegistryUA` are `immutable`; no in-place setter).
///
///         Identity verifier note: V5.3 was an in-place amendment to V5.2
///         that did NOT introduce a new verifier source file (see
///         `docs/release-notes/v0.5.3-contracts.md`). The V5.2 stub
///         contract `Groth16VerifierV5_2Stub.sol` shares the V5.3 22-input
///         ABI verbatim. Pre-ceremony, the V5.2 stub's vkey accepts the
///         V5.2/V5.3 stub-ceremony proof tuple; post-ceremony, the real
///         V5.4 deploy uses the freshly-ceremonied V5.3 verifier (which
///         encodes the V5.3 F2 `Num2Bits(160)` rotationNewWallet
///         constraint into the R1CS).
///
/// Required env (sourced via `set -a; source .env; set +a`):
///   PRIVATE_KEY            — deployer private key (also pays gas)
///   ADMIN_ADDRESS          — registry admin
///   INITIAL_TRUST_ROOT     — bytes32; UA Diia trust-list Poseidon root
///                            (current: 0x25ce7bfa7693e391a7e1d5df666caa
///                                       5b622bf709cc6797289a74bfc272462b3e)
///   INITIAL_POLICY_ROOT    — bytes32; first policy-list Poseidon root
///                            (current placeholder: 0x0...01)
///
/// Base Sepolia broadcast (chainId 84532):
///   set -a; source .env; set +a
///   forge script packages/contracts/script/DeployV5_4UA.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY \
///     -vv
///
/// Anvil dry-run on Base Sepolia fork:
///   anvil --fork-url $BASE_SEPOLIA_RPC_URL --port 8546 --chain-id 84532 &
///   set -a; source .env; set +a
///   PRIVATE_KEY=0xac0974... ADMIN_ADDRESS=0xf39F... \
///     forge script packages/contracts/script/DeployV5_4UA.s.sol \
///       --rpc-url http://localhost:8546 -vv
///
/// @dev Constructor arg order (locked by interface, lead-confirmed at T2):
///      `ZKQESRegistryUA(_trustedRoot, _policyRoot, _identityVerifier,
///       _ageVerifier, _admin)` — bytes32, bytes32, address, address,
///      address.
contract DeployV5_4UA is Script {
    function run() external returns (
        address identityVerifier,
        address ageVerifier,
        address registry
    ) {
        uint256 deployerKey       = vm.envUint("PRIVATE_KEY");
        address adminAddr         = vm.envAddress("ADMIN_ADDRESS");
        bytes32 initialTrustRoot  = vm.envBytes32("INITIAL_TRUST_ROOT");
        bytes32 initialPolicyRoot = vm.envBytes32("INITIAL_POLICY_ROOT");

        vm.startBroadcast(deployerKey);

        // 1. Identity verifier (V5.3-compatible stub via V5.2 file —
        //    same 22-input ABI; V5.3 added no new verifier source).
        Groth16VerifierV5_2Stub idStub = new Groth16VerifierV5_2Stub();
        identityVerifier = address(idStub);
        console2.log("Groth16VerifierV5_2Stub (identity, V5.3-compatible):", identityVerifier);

        // 2. Age verifier (V5.4 stub, settable). Phase A unit-test stub
        //    pattern; Phase C swap with the real `Groth16AgeVerifierUA.sol`
        //    from circuits-eng's V5.4 ceremony output.
        Groth16AgeVerifierUAStub ageStubImpl = new Groth16AgeVerifierUAStub();
        ageVerifier = address(ageStubImpl);
        console2.log("Groth16AgeVerifierUAStub (age, V5.4 stub):         ", ageVerifier);

        // 3. ZKQESRegistryUA (constructor CREATE-deploys PoseidonT3 + T7
        //    internally; mirrors ZkqesRegistryV5_2 pattern).
        ZKQESRegistryUA reg = new ZKQESRegistryUA(
            initialTrustRoot,
            initialPolicyRoot,
            identityVerifier,
            ageVerifier,
            adminAddr
        );
        registry = address(reg);
        console2.log("ZKQESRegistryUA:                                   ", registry);
        console2.log("  PoseidonT3:                                      ", reg.poseidonT3());
        console2.log("  PoseidonT7:                                      ", reg.poseidonT7());
        console2.log("  admin:                                           ", reg.admin());
        console2.log("  trustedRoot (uint256):                           ", uint256(reg.trustedRoot()));
        console2.log("  policyRoot  (uint256):                           ", uint256(reg.policyRoot()));
        console2.log("  country:                                          UA");
        console2.log("  identityVerifier (per IZKQESRegistry):           ", reg.identityVerifier());
        console2.log("  ageVerifier      (per IZKQESRegistry):           ", reg.ageVerifier());

        vm.stopBroadcast();
    }
}
