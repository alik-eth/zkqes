# Civic-terminal v2 — contracts-eng worker plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read [orchestration plan §2.2](2026-05-04-zkqes-civic-terminal-v2-orchestration.md#22-fixturescontractsbase-sepoliajson-contracts-eng-writes-web-eng-reads) for the frozen `base-sepolia.json` shape before starting Task 1.

**Goal:** Deploy a stub-verifier-backed `ZkqesRegistryV5_2` + `ZkqesCertificate` to **Base Sepolia testnet (chainId 84532)** now (no longer gated on Phase B ceremony), so the full `/register` and `/account/rotate` flows can run end-to-end against a real chain before recruitment fires (per v2 spec §8.2 reorder).

**Architecture:** Existing `DeployV5_2.s.sol` already supports both placeholder (always-true, dev) and real-pairing-stub paths via `GROTH16_VERIFIER_ADDR` env. v2 deploys the **real-pairing stub** (`Groth16VerifierV5_2Stub.sol`, already in tree) so the on-chain Groth16 verify path is exercised end-to-end. **Post-ceremony rotation = fresh registry redeploy** pointing at the real ceremonied verifier address — `groth16Verifier` is `immutable` in `ZkqesRegistryV5_2.sol` (no in-place `setVerifier` setter exists). Web/SDK consumers swap registry address via the next `base-sepolia.json` pump.

**Chain target:** **Base Sepolia (chainId 84532)** — the L2 testnet for Base. Base Sepolia is the Coinbase Layer 2 OP-Stack testnet. RPC endpoint: `https://sepolia.base.org` (public) or your provider's URL. Block explorer: `https://sepolia.basescan.org`. Verification API: BaseScan's Etherscan-compatible endpoint at `https://api-sepolia.basescan.org/api` with a BaseScan API key.

> NOTE: NOT to be confused with L1 Sepolia (chainId 11155111). The pre-existing `fixtures/contracts/sepolia.json` carries L1 Sepolia V4 deployments and stays frozen as historical record. The v2 deploy lands at the new sibling `fixtures/contracts/base-sepolia.json`.

**Tech Stack:** Foundry / forge-std, Solidity 0.8.24, Base Sepolia (chainId 84532), BaseScan verification.

**Branch baseline:** `feat/v2-contracts-stub-deploy` off `main` in worktree `/data/Develop/qkb-wt-v5/contracts`.

**Tasks here:** 5 — C1 (anvil dry-run on Base Sepolia fork), C2 (Base Sepolia stub-verifier deploy), C3 (registry+NFT deploy + BaseScan verify), C4 (`fixtures/contracts/base-sepolia.json` write + smoke), C5 (post-deploy smoke test against `register()`).

---

## File map

| File                                                              | Action                                                            |
|-------------------------------------------------------------------|-------------------------------------------------------------------|
| `packages/contracts/script/DeployV5_2.s.sol`                      | Modify — add a header note that Base Sepolia stub-verifier path is canonical for v2 dispatch (no logic change) |
| `packages/contracts/script/DeployV5_2WithStub.s.sol`              | Create — convenience wrapper that deploys `Groth16VerifierV5_2Stub` first, then runs `DeployV5_2` with the stub address |
| `fixtures/contracts/base-sepolia.json`                            | Create — `v5_2` block with stub deploy addresses (NEW file — not the existing `sepolia.json`) |
| `packages/contracts/test/integration/BaseSepoliaStubSmoke.t.sol`  | Create — fork-test of the deployed stub registry's `register()` + `nullifierOf()` round-trip |

## Pre-deployment checklist

Before Task 2's live broadcast:

- [ ] `cast balance $ADMIN_ADDRESS --rpc-url $BASE_SEPOLIA_RPC_URL` ≥ 0.05 ETH (Base Sepolia native gas; deploy gas headroom).
- [ ] Lead has completed L1+L2 + L3 schema bump (orchestration §3 step 1+2). Verify with `git -C /data/Develop/identityescroworg log --oneline main -5`.
- [ ] `forge test -vv` from this worktree green (412+ tests).
- [ ] `.env` at repo root has `PRIVATE_KEY`, `ADMIN_ADDRESS`, `BASE_SEPOLIA_RPC_URL`, `BASESCAN_API_KEY` (BaseScan key, NOT L1 Etherscan key — different service, free at sepolia.basescan.org).
- [ ] `INITIAL_TRUST_ROOT` and `INITIAL_POLICY_ROOT` env values known (lead pumps from flattener output).
- [ ] If short on Base Sepolia ETH, use a faucet (e.g. Coinbase's Base Sepolia faucet at coinbase.com/faucets/base-ethereum-sepolia-faucet, or Alchemy's). The stub deploy needs ~0.01 ETH; 0.05 ETH gives headroom for re-broadcasts.

---

## Task 1 — Anvil dry-run on Base Sepolia fork

**Files:**
- Modify: `packages/contracts/script/DeployV5_2.s.sol` (header-comment-only edit)
- Create: `packages/contracts/script/DeployV5_2WithStub.s.sol`

- [ ] **Step 1: Add a Base-Sepolia-stub note to `DeployV5_2.s.sol`'s header**

Edit `packages/contracts/script/DeployV5_2.s.sol`. Locate the `/// Verifier flip schedule:` block in the contract NatSpec and append:

```solidity
///         For v2 civic-terminal dispatch (2026-05-04+): the Base Sepolia
///         deploy uses `Groth16VerifierV5_2Stub.sol` (real-pairing stub)
///         per spec §8.2 sequencing reorder. Run via the convenience
///         wrapper `DeployV5_2WithStub.s.sol` which deploys the stub
///         verifier first then chains into this script with
///         GROTH16_VERIFIER_ADDR set. Post-ceremony swap is a separate
///         deploy with the real ceremonied verifier address. Target chain
///         is Base Sepolia (chainId 84532), NOT L1 Sepolia.
```

No logic change to `DeployV5_2.s.sol`.

- [ ] **Step 2: Write the convenience wrapper script**

Create `packages/contracts/script/DeployV5_2WithStub.s.sol`:

```solidity
// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Groth16VerifierV5_2Stub} from "../src/Groth16VerifierV5_2Stub.sol";
import {Groth16VerifierV5_2Placeholder} from "../src/Groth16VerifierV5_2Placeholder.sol";
import {ZkqesRegistryV5_2, IGroth16VerifierV5_2} from "../src/ZkqesRegistryV5_2.sol";
import {ZkqesCertificate} from "../src/ZkqesCertificate.sol";

/// @notice v2 civic-terminal Base Sepolia deploy: deploys the real-pairing
///         stub verifier first, then the registry pointing at it, then the
///         certificate NFT bound to the registry. One forge-script
///         invocation, three contracts deployed.
///
///         Per spec §8.2 reorder, this fires BEFORE the Phase B ceremony
///         so the full /register and /account/rotate flows can be smoked
///         on Base Sepolia (chainId 84532) ahead of recruitment.
///         Post-ceremony, the registry admin rotates to the real
///         ceremonied verifier via a FRESH registry redeploy
///         (or a fresh redeploy, depending on what audit finds).
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

        // 1. Stub verifier (real pairing, stub key — pre-ceremony only).
        Groth16VerifierV5_2Stub stub = new Groth16VerifierV5_2Stub();
        verifier = address(stub);
        console2.log("Groth16VerifierV5_2Stub:", verifier);

        // 2. Registry (constructor deploys PoseidonT3 + PoseidonT7 internally).
        ZkqesRegistryV5_2 reg = new ZkqesRegistryV5_2(
            IGroth16VerifierV5_2(verifier),
            admin,
            initialTrustRoot,
            initialPolicyRoot
        );
        registry = address(reg);
        console2.log("ZkqesRegistryV5_2:", registry);

        // 3. Certificate NFT bound to the registry.
        // NB: ZkqesCertificate constructor is (address, uint64, string)
        // — registry, mintDeadline, chainLabel. uint64 BEFORE string.
        ZkqesCertificate nft = new ZkqesCertificate(registry, mintDeadline, chainLabel);
        certificate = address(nft);
        console2.log("ZkqesCertificate:", certificate);

        vm.stopBroadcast();
    }
}
```

- [ ] **Step 3: Run the wrapper against an Anvil fork of Base Sepolia**

```bash
cd /data/Develop/qkb-wt-v5/contracts

# In terminal A — start Anvil fork against Base Sepolia.
anvil --fork-url $BASE_SEPOLIA_RPC_URL --port 8546 --chain-id 84532 &
ANVIL_PID=$!

# In terminal B (or after Anvil starts).
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  ADMIN_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  INITIAL_TRUST_ROOT=0x2aabe35800000000000000000000000000000000000000000000000000ff0228 \
  INITIAL_POLICY_ROOT=0x0000000000000000000000000000000000000000000000000000000000000001 \
  MINT_DEADLINE=1792833194 \
  forge script script/DeployV5_2WithStub.s.sol \
    --rpc-url http://localhost:8546 -vv

kill $ANVIL_PID
```

Expected console output: 3 addresses logged (`Groth16VerifierV5_2Stub`, `ZkqesRegistryV5_2`, `ZkqesCertificate`) — no broadcast, dry-run only. Forge prints estimated gas costs.

- [ ] **Step 4: Run the existing test suite to confirm no regression**

```bash
cd /data/Develop/qkb-wt-v5/contracts
forge test -vv
```

Expected: 412/413 passing (the 1 skipped is pre-existing).

- [ ] **Step 5: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/contracts add \
  packages/contracts/script/DeployV5_2.s.sol \
  packages/contracts/script/DeployV5_2WithStub.s.sol
git -C /data/Develop/qkb-wt-v5/contracts commit -m "feat(contracts): DeployV5_2WithStub.s.sol convenience wrapper

v2 civic-terminal Base Sepolia deploy chain — Groth16VerifierV5_2Stub +
ZkqesRegistryV5_2 + ZkqesCertificate in a single forge-script run.
Adds Base Sepolia stub note to DeployV5_2.s.sol header. Anvil dry-run
against the Base Sepolia fork verified."
```

---

## Task 2 — Base Sepolia live broadcast

- [ ] **Step 1: Confirm prerequisites**

```bash
# Admin balance on Base Sepolia (chainId 84532)
cast balance $ADMIN_ADDRESS --rpc-url $BASE_SEPOLIA_RPC_URL    # ≥ 0.05 ETH

# Lead schema bump landed
git -C /data/Develop/identityescroworg log --oneline main -5 | head -3
# Expect to see: "feat(ceremony-coord): add CeremonyPhase + status.json phase field"
```

- [ ] **Step 2: Broadcast the deploy with BaseScan verify**

```bash
cd /data/Develop/qkb-wt-v5/contracts
source /data/Develop/identityescroworg/.env  # PRIVATE_KEY, ADMIN_ADDRESS, BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY

INITIAL_TRUST_ROOT=$(cat /data/Develop/identityescroworg/fixtures/lotl-flattener/root.json | jq -r '.root') \
INITIAL_POLICY_ROOT=0x0000000000000000000000000000000000000000000000000000000000000001 \
MINT_DEADLINE=1792833194 \
forge script script/DeployV5_2WithStub.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  --verifier-url https://api-sepolia.basescan.org/api \
  -vv 2>&1 | tee /tmp/v5_2-stub-deploy.log
```

Expected: each contract verified on Base Sepolia at sepolia.basescan.org; the log block at end of `forge script` output shows verified addresses for all three.

If any verification fails, re-verify standalone:

```bash
forge verify-contract --chain base-sepolia \
  --etherscan-api-key $BASESCAN_API_KEY \
  --verifier-url https://api-sepolia.basescan.org/api \
  --watch <ADDRESS> packages/contracts/src/Groth16VerifierV5_2Stub.sol:Groth16VerifierV5_2Stub
```

- [ ] **Step 3: Capture deployed addresses + tx hashes**

```bash
grep -E "^(Groth16VerifierV5_2Stub|ZkqesRegistryV5_2|ZkqesCertificate):" /tmp/v5_2-stub-deploy.log
```

Save the three addresses + the deploy block + the deploy tx hashes — they go into `base-sepolia.json` in Task 3.

- [ ] **Step 4: Sanity-check the registry from cast (Base Sepolia)**

```bash
REGISTRY=<address from log>
VERIFIER=<address from log>

cast call $REGISTRY 'groth16Verifier()(address)' --rpc-url $BASE_SEPOLIA_RPC_URL   # returns $VERIFIER (accessor is groth16Verifier, not verifier)
cast call $REGISTRY 'admin()(address)' --rpc-url $BASE_SEPOLIA_RPC_URL             # returns $ADMIN_ADDRESS
cast call $REGISTRY 'trustedListRoot()(bytes32)' --rpc-url $BASE_SEPOLIA_RPC_URL  # returns $INITIAL_TRUST_ROOT
cast chain-id --rpc-url $BASE_SEPOLIA_RPC_URL                                      # returns 84532
```

Expected: all three reads match the deploy inputs.

- [ ] **Step 5: Push the broadcast log + commit**

The `broadcast/` directory under `packages/contracts/` is gitignored except for the broadcast manifests for canonical deploys. We do NOT commit the raw transaction-private-key-bearing files; we commit the latest `run-latest.json` (it's safe — addresses + chainId only).

```bash
git -C /data/Develop/qkb-wt-v5/contracts add \
  packages/contracts/broadcast/DeployV5_2WithStub.s.sol/84532/run-latest.json
git -C /data/Develop/qkb-wt-v5/contracts commit -m "deploy(contracts): Base Sepolia v5_2 stub registry chain (broadcast manifest)

Deployed via DeployV5_2WithStub.s.sol against Base Sepolia chainId 84532.
Addresses pumped to fixtures/contracts/base-sepolia.json in next commit.
BaseScan verification: all three contracts verified at sepolia.basescan.org.

Stub-verifier rationale: pre-ceremony, real-pairing stub exercises the
on-chain Groth16 verify path end-to-end so /register can smoke against
the live chain ahead of Phase B recruitment per spec §8.2 reorder.
Post-ceremony rotation: fresh registry redeploy pointing at real verifier (groth16Verifier is immutable; no in-place setter exists)."
```

---

## Task 3 — Create `fixtures/contracts/base-sepolia.json`

**Files:**
- Create: `fixtures/contracts/base-sepolia.json`

The frozen shape is in [orchestration §2.2](2026-05-04-zkqes-civic-terminal-v2-orchestration.md#22-fixturescontractsbase-sepoliajson-contracts-eng-writes-web-eng-reads).

> NOTE: this is a NEW file. Do NOT touch the existing `fixtures/contracts/sepolia.json` — that's L1 Sepolia historical V4 deploys, frozen as historical record.

- [ ] **Step 1: Confirm the new file path is clean**

```bash
ls /data/Develop/qkb-wt-v5/contracts/fixtures/contracts/base-sepolia.json 2>&1
# Expected: file not found (this is your first commit creating it).
```

- [ ] **Step 2: Compute the stub bytecode SHA-256**

```bash
cd /data/Develop/qkb-wt-v5/contracts
forge build 2>/dev/null
jq -r '.bytecode.object' out/Groth16VerifierV5_2Stub.sol/Groth16VerifierV5_2Stub.json | xxd -r -p | sha256sum
```

Save the hash; it becomes the `stubArtifactSha256` field in `base-sepolia.json`. This pins which stub bytecode was deployed so post-ceremony auditors can verify what they're replacing.

- [ ] **Step 3: Write the new file**

Create `fixtures/contracts/base-sepolia.json`. Use the Task 2 broadcast log to fill addresses, deploy block, and tx hashes:

```json
{
  "chainId": 84532,
  "chainName": "Base Sepolia",
  "explorerBase": "https://sepolia.basescan.org",
  "v5_2": {
    "registry": "0x<registry-address>",
    "verifier": "0x<verifier-address>",
    "verifierKind": "stub",
    "certificate": "0x<certificate-address>",
    "deployedAt": "2026-05-XX",
    "deployBlock": <block-number>,
    "deployTx": "0x<tx-hash>",
    "stubArtifactSha256": "<sha-from-step-2>",
    "verifierFlipNote": "groth16Verifier is immutable; post-ceremony swap = fresh registry redeploy + new base-sepolia.json pump per spec §8.2"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/contracts add fixtures/contracts/base-sepolia.json
git -C /data/Develop/qkb-wt-v5/contracts commit -m "feat(contracts): pump v5_2 Base Sepolia stub addresses to base-sepolia.json

Three addresses + deploy block + tx hash + bytecode SHA pin which stub
was deployed so post-ceremony auditors can verify what's being replaced.
Lead pumps this to packages/web/src/fixtures/contracts/base-sepolia.json
in the web worktree per orchestration §5. New file (NOT a modification
of existing sepolia.json — that's L1 historical V4)."
```

---

## Task 4 — Post-deploy fork test

**Files:**
- Create: `packages/contracts/test/integration/BaseSepoliaStubSmoke.t.sol`

A small fork test that hits the live Base Sepolia stub registry to confirm `register()` and `nullifierOf()` are reachable. This catches deploy-time misconfigurations (e.g., wrong admin, wrong verifier wired) that the cast probes in Task 2 wouldn't surface.

- [ ] **Step 1: Write a failing fork test**

Create `packages/contracts/test/integration/BaseSepoliaStubSmoke.t.sol`:

```solidity
// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ZkqesRegistryV5_2, IGroth16VerifierV5_2} from "../../src/ZkqesRegistryV5_2.sol";
import {ZkqesCertificate} from "../../src/ZkqesCertificate.sol";

/// @notice Fork smoke test against the live Base Sepolia v5_2 stub deploy.
/// @dev    Reads addresses from the BASE_SEPOLIA_REGISTRY / *_VERIFIER /
///         *_CERTIFICATE env vars (set by `.env`). Skips silently
///         if env is unset (CI without secrets).
contract BaseSepoliaStubSmokeTest is Test {
    uint256 constant BASE_SEPOLIA_CHAIN_ID = 84532;

    ZkqesRegistryV5_2 reg;
    ZkqesCertificate nft;
    address admin;

    function setUp() public {
        string memory rpc;
        try vm.envString("BASE_SEPOLIA_RPC_URL") returns (string memory s) { rpc = s; } catch {}
        if (bytes(rpc).length == 0) {
            console2.log("BASE_SEPOLIA_RPC_URL unset; skipping fork test");
            return;
        }
        vm.createSelectFork(rpc);
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "fork is not Base Sepolia (84532)");

        address regAddr;
        try vm.envAddress("BASE_SEPOLIA_REGISTRY") returns (address a) { regAddr = a; } catch {}
        if (regAddr == address(0)) {
            console2.log("BASE_SEPOLIA_REGISTRY unset; skipping fork test");
            return;
        }
        reg = ZkqesRegistryV5_2(regAddr);
        nft = ZkqesCertificate(vm.envAddress("BASE_SEPOLIA_CERTIFICATE"));
        admin = vm.envAddress("ADMIN_ADDRESS");
    }

    function testFork_RegistryWiredCorrectly() public view {
        if (address(reg) == address(0)) return;  // skipped
        assertEq(reg.admin(), admin, "registry admin mismatch");
        assertGt(uint256(reg.trustedListRoot()), 0, "trusted list root unset");
    }

    function testFork_VerifierIsStub() public view {
        if (address(reg) == address(0)) return;  // skipped
        // NB: accessor is `groth16Verifier`, not `verifier` (public field name in ZkqesRegistryV5_2.sol).
        address verifier = address(reg.groth16Verifier());
        assertGt(verifier.code.length, 0, "verifier has no code");
    }

    function testFork_NullifierOfReturnsZeroForUnseenWallet() public view {
        if (address(reg) == address(0)) return;  // skipped
        // A random wallet that hasn't registered should map to bytes32(0).
        bytes32 nullifier = reg.nullifierOf(address(0xdeadbeef));
        assertEq(nullifier, bytes32(0), "expected zero nullifier for unseen wallet");
    }
}
```

- [ ] **Step 2: Run the fork test**

```bash
cd /data/Develop/qkb-wt-v5/contracts
BASE_SEPOLIA_REGISTRY=0x<registry-addr> \
BASE_SEPOLIA_VERIFIER=0x<verifier-addr> \
BASE_SEPOLIA_CERTIFICATE=0x<cert-addr> \
BASE_SEPOLIA_RPC_URL=$BASE_SEPOLIA_RPC_URL \
ADMIN_ADDRESS=$ADMIN_ADDRESS \
forge test --match-path test/integration/BaseSepoliaStubSmoke.t.sol -vv
```

Expected: 3/3 passing. Test setUp asserts `block.chainid == 84532` so a misconfigured `BASE_SEPOLIA_RPC_URL` (e.g. accidentally pointing at L1 Sepolia) fails loudly.

- [ ] **Step 3: Run the full test suite to ensure no regression**

```bash
forge test -vv
```

Expected: 412/413 (or 415/416 with the 3 new tests).

- [ ] **Step 4: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/contracts add packages/contracts/test/integration/BaseSepoliaStubSmoke.t.sol
git -C /data/Develop/qkb-wt-v5/contracts commit -m "test(contracts): Base Sepolia stub deploy fork smoke

Three reads against the live deploy on chainId 84532: registry.admin()
matches env, verifier has bytecode at the wired address, nullifierOf()
returns zero for an unseen wallet. setUp asserts block.chainid==84532
so a misconfigured RPC pointing at L1 Sepolia fails loudly.

Skips silently when BASE_SEPOLIA_REGISTRY/CERTIFICATE/RPC env are unset
(CI lane without secrets)."
```

---

## Task 5 — Hand off to lead for pump

- [ ] **Step 1: Push branch + signal lead**

```bash
git -C /data/Develop/qkb-wt-v5/contracts push -u origin feat/v2-contracts-stub-deploy
```

Then signal lead via SendMessage with:
- Three deployed addresses (verifier, registry, certificate)
- Etherscan links for each
- Block number + tx hashes
- Confirmation that `fixtures/contracts/base-sepolia.json` is created locally and committed

Lead pumps the fixture into the web worktree per orchestration §5 and merges the contracts branch to main per orchestration §8.

- [ ] **Step 2: Stay on standby for the post-ceremony swap**

After Phase B ceremony completes (separately tracked as task #8), a follow-up plan will dispatch:
- Deploy real ceremonied verifier to Base Sepolia.
- Fresh registry redeploy pointing at the real ceremonied verifier (`groth16Verifier` is `immutable`; no in-place setter exists).
- Update `base-sepolia.json` `verifierKind: "stub"` → `"real"` and add `verifierFlipBlock`.
- BaseScan verify the real verifier.

That work is OUT OF SCOPE for v2 dispatch.

---

## Acceptance gate (worker self-check)

- [ ] `forge test -vv` from worktree → 412+ passing, 0 failures
- [ ] Anvil dry-run of `DeployV5_2WithStub.s.sol` succeeds locally
- [ ] Live Base Sepolia broadcast emits 3 addresses + BaseScan verifies all 3 at sepolia.basescan.org
- [ ] `cast call $REGISTRY 'admin()(address)' --rpc-url $BASE_SEPOLIA_RPC_URL` returns the expected admin
- [ ] `cast chain-id --rpc-url $BASE_SEPOLIA_RPC_URL` returns 84532 (asserts you didn't accidentally hit L1 Sepolia)
- [ ] `fixtures/contracts/base-sepolia.json` exists with the `v5_2` block and all required fields
- [ ] Fork smoke test passes against the live deploy
- [ ] Branch pushed, lead notified

After lead confirms pump to web + merge to main, the contracts-eng v2 dispatch is complete.

## Self-review notes

- **Spec coverage:** Task 1+2 implement spec §8.2 step 2 (Base Sepolia stub-verifier deploy upfront). Task 3 implements the orchestration-§2.2 contract. Task 4 is defensive — catches the long-tail "deployed but mis-wired" risk that cost a half-day on V5.0.
- **No placeholders:** every step has runnable forge commands or specific file edits.
- **Type consistency:** `verifierKind: "stub"` matches orchestration §2.2 exactly. The post-ceremony flip writes `"real"`. `chainId: 84532` is consistent across deploy script comment, fixture file, and fork-test setUp guard.
- **Risk:** if `Groth16VerifierV5_2Stub` happens to verify our test fixture proofs (which it shouldn't — stub key won't match circuit's R1CS), Base Sepolia /register would succeed against bogus proofs. Mitigation: lead-side acceptance gate (#18) runs a deliberately-malformed proof and asserts it reverts; web-side `verifierKind` check in PreviewModeBanner makes the stub state user-visible.
