# ZKQES V5.4 — contracts-eng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven-development for fresh subagents per task). Steps use `- [ ]` checkbox tracking.

**Goal:** Land `IZKQESRegistry.sol` interface + `ZKQESRegistryUA.sol` implementation + deploy script. Phase A skeleton with stub age verifier (unit-test-only); Phase C swaps in the real verifier post-ceremony.

**Architecture:** Per-country registry pattern. UA-only deploy in V5.4. Interface frozen for V5.5+ countries. Both verifier slots are `immutable` — any verifier swap requires fresh deploy.

**Tech Stack:** Solidity ^0.8.24, foundry, OpenZeppelin (existing).

**Spec ref:** `docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md` §3.

**Orchestration ref:** `docs/superpowers/plans/2026-05-05-zkqes-v5_4-orchestration.md` §1, §2.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `packages/contracts/src/IZKQESRegistry.sol` | Frozen interface for all per-country registries |
| `packages/contracts/src/ZKQESRegistryUA.sol` | UA implementation |
| `packages/contracts/src/Groth16AgeVerifierUAStub.sol` | Stub for Phase A unit tests; Phase C replaced with real |
| `packages/contracts/test/ZKQESRegistryUA.t.sol` | Unit tests (register + rotate + proveAge happy + reject paths) |
| `packages/contracts/script/DeployV5_4UA.s.sol` | Phase C deploy script |

### Modified files

| Path | Change |
|---|---|
| `fixtures/contracts/base-sepolia.json` | Phase C: add `_deprecated` block + new addresses |

---

## Task 1: `IZKQESRegistry` interface

**Files:**
- Create: `packages/contracts/src/IZKQESRegistry.sol`

- [ ] **Step 1: Write the interface skeleton**

```solidity
// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

interface IZKQESRegistry {
    struct Binding {
        address pk;
        uint256 ctxHash;
        uint256 policyLeafHash;
        uint256 timestamp;
        uint256 dobCommit;
        uint8   dobSupported;
        bool    revoked;
        uint256 nullifier;
    }

    struct ChainProof { uint256[2] a; uint256[2][2] b; uint256[2] c; uint256 rTL; uint256 algorithmTag; uint256 leafSpkiCommit; }
    struct LeafProof  { uint256[2] a; uint256[2][2] b; uint256[2] c; /* V5.3 22-signal — verbatim from spec §3.1 */ }
    struct AgeProof   { uint256[2] a; uint256[2][2] b; uint256[2] c; uint256 ageQualified; uint256 ageCutoffDate; uint256 nullifierCtx; }

    function country() external view returns (string memory);
    function trustedRoot() external view returns (bytes32);
    function policyRoot() external view returns (bytes32);
    function identityVerifier() external view returns (address);
    function ageVerifier() external view returns (address);

    function register(ChainProof calldata, LeafProof calldata) external returns (bytes32 bindingId);
    function rotateWallet(bytes32 bindingId, LeafProof calldata, address newWallet, bytes calldata sig) external;
    function proveAge(bytes32 bindingId, uint256 ageCutoffDate, AgeProof calldata) external returns (bool);

    function getBinding(bytes32 id) external view returns (Binding memory);
    function ageProvenCutoffs(bytes32 id, uint256 cutoff) external view returns (bool);

    event BindingRegistered(bytes32 indexed id, address indexed pk, uint256 ctxHash);
    event BindingRotated(bytes32 indexed id, address indexed oldPk, address indexed newPk);
    event AgeProven(bytes32 indexed id, uint256 ageCutoffDate, address prover);
}
```

- [ ] **Step 2: Compile**

```bash
cd packages/contracts && forge build src/IZKQESRegistry.sol
```

Expected: clean. Interface compiles standalone.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/IZKQESRegistry.sol
git commit -m "feat(contracts): IZKQESRegistry — frozen interface for per-country registries"
```

---

## Task 2: `ZKQESRegistryUA` skeleton + stub age verifier

**Files:**
- Create: `packages/contracts/src/ZKQESRegistryUA.sol`
- Create: `packages/contracts/src/Groth16AgeVerifierUAStub.sol`

- [ ] **Step 1: Write stub age verifier**

`Groth16AgeVerifierUAStub.sol`:
```solidity
// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

interface IGroth16AgeVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[3] calldata input)
        external view returns (bool);
}

contract Groth16AgeVerifierUAStub is IGroth16AgeVerifier {
    bool public stubReturn = true;
    function setStubReturn(bool v) external { stubReturn = v; }
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[3] calldata)
        external view returns (bool) { return stubReturn; }
}
```

Phase A unit tests use this. Phase C replaces with the real Groth16 verifier from circuits-eng's ceremony output.

- [ ] **Step 2: Write `ZKQESRegistryUA` implementation**

```solidity
// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

import { IZKQESRegistry } from "./IZKQESRegistry.sol";
import { IGroth16Verifier } from "./IGroth16Verifier.sol";  // existing
import { IGroth16AgeVerifier } from "./Groth16AgeVerifierUAStub.sol";

error BindingNotFound();
error BindingRevoked();
error DobNotAvailable();
error InvalidAgeCutoff();
error AgeNotQualified();
error AgeCutoffMismatch();
error AgeNullifierContextMismatch();
error InvalidAgeProof();
error OnlyAdmin();

contract ZKQESRegistryUA is IZKQESRegistry {
    string public constant override country = "UA";
    string public constant VERSION = "ZKQES/V5.4";

    bytes32 public override trustedRoot;
    bytes32 public override policyRoot;
    IGroth16Verifier public immutable override identityVerifier;
    IGroth16AgeVerifier public immutable override ageVerifier;
    address public admin;

    mapping(bytes32 => Binding) public bindings;
    mapping(uint256 => bool) public usedNullifiers;
    mapping(bytes32 => mapping(uint256 => bool)) public override ageProvenCutoffs;

    constructor(
        bytes32 _trustedRoot,
        bytes32 _policyRoot,
        address _identityVerifier,
        address _ageVerifier,
        address _admin
    ) {
        trustedRoot = _trustedRoot;
        policyRoot  = _policyRoot;
        identityVerifier = IGroth16Verifier(_identityVerifier);
        ageVerifier      = IGroth16AgeVerifier(_ageVerifier);
        admin = _admin;
    }

    function register(ChainProof calldata cp, LeafProof calldata lp)
        external override returns (bytes32 bindingId) {
        // ... port from existing ZkqesRegistryV5_2.register ...
        // Set bindings[bindingId].dobSupported = 1 for UA (Diia carries DOB).
    }

    function rotateWallet(...) external override { /* ... */ }

    function proveAge(bytes32 bindingId, uint256 ageCutoffDate, AgeProof calldata p)
        external override returns (bool) {
        Binding storage b = bindings[bindingId];
        if (b.pk == address(0)) revert BindingNotFound();
        if (b.revoked) revert BindingRevoked();
        if (b.dobSupported != 1) revert DobNotAvailable();
        if (ageCutoffDate < 19000101 || ageCutoffDate > 99991231) revert InvalidAgeCutoff();
        if (p.ageQualified != 1) revert AgeNotQualified();
        if (p.ageCutoffDate != ageCutoffDate) revert AgeCutoffMismatch();

        // Per orchestration §1.4 — ProtocolBytes literal "zkqes-age-ctx-v1" is FROZEN.
        uint256 expectedCtx = uint256(keccak256(abi.encodePacked(
            "zkqes-age-ctx-v1", bindingId, ageCutoffDate
        )));
        if (p.nullifierCtx != expectedCtx) revert AgeNullifierContextMismatch();

        uint256[3] memory input = [p.ageQualified, p.ageCutoffDate, p.nullifierCtx];
        if (!ageVerifier.verifyProof(p.a, p.b, p.c, input)) revert InvalidAgeProof();

        ageProvenCutoffs[bindingId][ageCutoffDate] = true;
        emit AgeProven(bindingId, ageCutoffDate, msg.sender);
        return true;
    }

    function getBinding(bytes32 id) external view override returns (Binding memory) { return bindings[id]; }
}
```

`register()` and `rotateWallet()` port from existing `ZkqesRegistryV5_2` — minor renames to match `IZKQESRegistry` shape but logic unchanged.

- [ ] **Step 3: Compile**

```bash
forge build
```

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/ZKQESRegistryUA.sol packages/contracts/src/Groth16AgeVerifierUAStub.sol
git commit -m "feat(contracts): ZKQESRegistryUA + Groth16AgeVerifierUAStub (Phase A skeleton)"
```

---

## Task 3: Unit tests

**Files:**
- Create: `packages/contracts/test/ZKQESRegistryUA.t.sol`

- [ ] **Step 1: Test scaffold**

```solidity
contract ZKQESRegistryUATest is Test {
    ZKQESRegistryUA registry;
    Groth16AgeVerifierUAStub ageStub;
    /* set up identityVerifier mock similar to existing ZkqesRegistryV5_2 tests */

    function setUp() public {
        ageStub = new Groth16AgeVerifierUAStub();
        registry = new ZKQESRegistryUA(
            bytes32(uint256(0x1)),   // trustedRoot
            bytes32(uint256(0x2)),   // policyRoot
            address(identityStub),
            address(ageStub),
            address(this)
        );
    }
}
```

- [ ] **Step 2: Test `proveAge` happy path**

```solidity
function testProveAge_happy() public {
    bytes32 bindingId = _registerSampleBinding();
    uint256 cutoff = 20070101;  // born before 2007 = at least 19 today
    uint256 expectedCtx = uint256(keccak256(abi.encodePacked(
        "zkqes-age-ctx-v1", bindingId, cutoff
    )));
    IZKQESRegistry.AgeProof memory p;
    p.ageQualified  = 1;
    p.ageCutoffDate = cutoff;
    p.nullifierCtx  = expectedCtx;

    bool ok = registry.proveAge(bindingId, cutoff, p);
    assertTrue(ok);
    assertTrue(registry.ageProvenCutoffs(bindingId, cutoff));
}
```

- [ ] **Step 3: Test reject paths** (one test per revert):
  - `BindingNotFound` (invalid bindingId)
  - `BindingRevoked` (admin-revoked binding)
  - `DobNotAvailable` (dobSupported == 0 binding)
  - `InvalidAgeCutoff` (cutoff = 0, cutoff = 99999999, cutoff = 18000101)
  - `AgeNotQualified` (ageQualified = 0)
  - `AgeCutoffMismatch` (proof's cutoff != arg)
  - `AgeNullifierContextMismatch` (wrong nullifier context derivation)
  - `InvalidAgeProof` (stub returns false)

- [ ] **Step 4: Run tests**

```bash
forge test -vv --match-contract ZKQESRegistryUATest
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "test(contracts): ZKQESRegistryUA — register + rotate + proveAge happy + 8 reject paths"
```

---

## Task 4: Phase C — real verifier swap + deploy script

**This task waits for the lead pump of real `Groth16VerifierV5_3.sol` + `Groth16AgeVerifierUA.sol` from circuits-eng's ceremony output (orchestration §S §S2.3 step 8).**

**Files:**
- Modify: `packages/contracts/src/Groth16AgeVerifierUAStub.sol` (delete)
- Pumped from circuits-eng: `packages/contracts/src/Groth16AgeVerifierUA.sol` (real)
- Pumped from circuits-eng: `packages/contracts/src/Groth16VerifierV5_3.sol` (real, post-ceremony)
- Create: `packages/contracts/script/DeployV5_4UA.s.sol`

- [ ] **Step 1: Replace stub with real**

Delete `Groth16AgeVerifierUAStub.sol`. Pump real `Groth16AgeVerifierUA.sol` from `feat/v5_4-circuits` (lead pumps via `cp`). Update `ZKQESRegistryUA.sol`'s import.

- [ ] **Step 2: Deploy script**

`packages/contracts/script/DeployV5_4UA.s.sol`:
```solidity
contract DeployV5_4UA is Script {
    function run() external returns (ZKQESRegistryUA) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        bytes32 trustedRoot = vm.envBytes32("INITIAL_TRUST_ROOT");
        bytes32 policyRoot  = vm.envBytes32("INITIAL_POLICY_ROOT");

        vm.startBroadcast(pk);
        Groth16VerifierV5_3 idV  = new Groth16VerifierV5_3();
        Groth16AgeVerifierUA ageV = new Groth16AgeVerifierUA();
        ZKQESRegistryUA reg = new ZKQESRegistryUA(
            trustedRoot, policyRoot,
            address(idV), address(ageV),
            vm.envAddress("ADMIN_ADDRESS")
        );
        vm.stopBroadcast();
        console.log("ZKQESRegistryUA:", address(reg));
        console.log("Groth16VerifierV5_3:", address(idV));
        console.log("Groth16AgeVerifierUA:", address(ageV));
        return reg;
    }
}
```

- [ ] **Step 3: Live deploy (founder gate)**

```bash
set -a; source .env; set +a
forge script script/DeployV5_4UA.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

Verify all three contracts on BaseScan via `forge verify-contract --chain base-sepolia ...` per the V0.7.0 deploy precedent.

- [ ] **Step 4: Update `fixtures/contracts/base-sepolia.json`**

```jsonc
{
  "_deprecated": {
    "registryV5_2": "0xeE3bE208418DB51040e5983138C758C9eD154816",
    "groth16VerifierV5_2Stub": "0x5d63671653d9a047493386D494891fFDEc64007e",
    "deprecatedAt": "2026-05-XX",
    "reason": "Stub-verifier deploy retired post-Phase-B-ceremony, replaced by real V5.3 + V5.4 deploys"
  },
  "registryUA": "0x...",
  "groth16VerifierV5_3": "0x...",
  "groth16AgeVerifierUA": "0x...",
  "zkqesCertificate": "0x1e6a264F760D80BBf9E6fb2700A69b93B46a1A63"
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/Groth16AgeVerifierUA.sol packages/contracts/src/Groth16VerifierV5_3.sol \
        packages/contracts/script/DeployV5_4UA.s.sol \
        fixtures/contracts/base-sepolia.json
git rm packages/contracts/src/Groth16AgeVerifierUAStub.sol
git commit -m "deploy(contracts): V5.4 ZKQESRegistryUA — real verifiers, Base Sepolia LIVE"
```

- [ ] **Step 6: Ping lead**

SendMessage with deploy addresses for pump to web-eng worktree.
