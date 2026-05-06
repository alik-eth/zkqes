# ZKQES V5.4.1 — contracts-eng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Update `IZKQESRegistry::register` signature with two tail parameters (`ageCutoffDate, ageProof`) + sentinel-optional age semantics in `ZKQESRegistryUA` + redeploy to Base Sepolia.

**Spec ref:** `docs/superpowers/specs/2026-05-05-zkqes-v5_4_1-sponsored-register-design.md` §3.

**Orchestration:** `docs/superpowers/plans/2026-05-05-zkqes-v5_4_1-orchestration.md` §1.1, §1.2.

---

## File structure

### Modified files

| Path | Change |
|---|---|
| `packages/contracts/src/IZKQESRegistry.sol` | Add tail params to `register` |
| `packages/contracts/src/ZKQESRegistryUA.sol` | Implement sentinel-optional age in `register`; extract `_proveAgeInternal` from existing `proveAge` |
| `packages/contracts/test/ZKQESRegistryUA.t.sol` | New tests: sentinel-skip path + sentinel-set path + range-check |
| `packages/contracts/script/DeployV5_4_1UA.s.sol` | New deploy script (re-uses existing verifier addresses) |
| `fixtures/contracts/base-sepolia.json` | Add `_deprecated_v5_4` block + new V5.4.1 registry address (Phase C) |

---

## Task 1: Interface + implementation update

**Files:**
- Modify: `packages/contracts/src/IZKQESRegistry.sol`
- Modify: `packages/contracts/src/ZKQESRegistryUA.sol`

- [ ] **Step 1: Update interface**

`IZKQESRegistry.sol` — append two parameters to `register`:

```solidity
function register(
    ChainProof calldata chainProof,
    LeafProof calldata leafProof,
    bytes calldata leafSpki,
    bytes calldata intSpki,
    bytes calldata signedAttrs,
    bytes32[2] calldata leafSig,
    bytes32[2] calldata intSig,
    bytes32[16] calldata trustMerklePath,
    uint256 trustMerklePathBits,
    uint256 ageCutoffDate,           // NEW — 0 = skip age verification
    AgeProof calldata ageProof       // NEW — ignored when ageCutoffDate == 0
) external returns (bytes32 bindingId);
```

`AgeProof` struct already declared in V5.4 interface; no schema change.

- [ ] **Step 2: Extract `_proveAgeInternal` from existing `proveAge`**

In `ZKQESRegistryUA.sol`, take the body of the existing `proveAge` external function and move it to an internal `_proveAgeInternal(bytes32, uint256, AgeProof memory)` function. The external `proveAge` becomes a thin wrapper:

```solidity
function proveAge(bytes32 bindingId, uint256 ageCutoffDate, AgeProof calldata p)
    external override returns (bool) {
    return _proveAgeInternal(bindingId, ageCutoffDate, p);
}

function _proveAgeInternal(bytes32 bindingId, uint256 ageCutoffDate, AgeProof memory p)
    internal returns (bool) {
    // ... existing proveAge body, unchanged ...
}
```

Note `calldata` → `memory` in the internal helper since the calling site passes from the combined-register stack.

- [ ] **Step 3: Implement combined `register`**

Update `register` to call both internals:

```solidity
function register(
    ChainProof calldata cp,
    LeafProof calldata lp,
    bytes calldata leafSpki,
    bytes calldata intSpki,
    bytes calldata signedAttrs,
    bytes32[2] calldata leafSig,
    bytes32[2] calldata intSig,
    bytes32[16] calldata trustMerklePath,
    uint256 trustMerklePathBits,
    uint256 ageCutoffDate,
    AgeProof calldata ageProof
) external override returns (bytes32 bindingId) {
    bindingId = _registerInternal(
        cp, lp,
        leafSpki, intSpki, signedAttrs, leafSig, intSig,
        trustMerklePath, trustMerklePathBits
    );

    if (ageCutoffDate != 0) {
        if (ageCutoffDate < 19000101 || ageCutoffDate > 99991231)
            revert InvalidAgeCutoff();
        _proveAgeInternal(bindingId, ageCutoffDate, ageProof);
        emit RegisteredWithAge(bindingId, bindings[bindingId].pk, ageCutoffDate);
    }

    return bindingId;
}
```

`_registerInternal` is the existing V5.4 `register` body extracted to an internal function (same calldata→memory swap as `_proveAgeInternal`).

- [ ] **Step 4: Add `RegisteredWithAge` event + `InvalidAgeCutoff` error**

```solidity
event RegisteredWithAge(bytes32 indexed id, address indexed pk, uint256 ageCutoffDate);
error InvalidAgeCutoff();
```

`InvalidAgeCutoff` may already exist from V5.4's standalone `proveAge` — reuse if so.

- [ ] **Step 5: Compile**

```bash
cd packages/contracts && forge build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/IZKQESRegistry.sol packages/contracts/src/ZKQESRegistryUA.sol
git commit -m "feat(contracts): V5.4.1 — combined register(cp, lp, ageCutoff, ageProof) with sentinel-optional age"
```

---

## Task 2: Tests

**Files:**
- Modify: `packages/contracts/test/ZKQESRegistryUA.t.sol`

- [ ] **Step 1: Test sentinel-skip path**

```solidity
function testRegister_v5_4_1_skipAge() public {
    /* set up: chain proof + leaf proof for synthetic Diia .p7s */
    bytes32 bindingId = registry.register(
        cp, lp,
        leafSpki, intSpki, signedAttrs, leafSig, intSig,
        trustMerklePath, trustMerklePathBits,
        0,                          // ageCutoffDate = 0 sentinel
        EMPTY_AGE_PROOF             // ignored
    );
    assertNotEq(bindingId, bytes32(0));
    assertEq(registry.getBinding(bindingId).pk, expectedPk);
    /* verify NO AgeProven event emitted */
    /* verify ageProvenCutoffs[bindingId][*] all stay false */
}
```

- [ ] **Step 2: Test sentinel-set path**

```solidity
function testRegister_v5_4_1_withAge() public {
    /* set up: chain proof + leaf proof + age proof for synthetic Diia */
    uint256 cutoff = 20070101;
    bytes32 bindingId = registry.register(
        cp, lp,
        leafSpki, intSpki, signedAttrs, leafSig, intSig,
        trustMerklePath, trustMerklePathBits,
        cutoff,
        ageProof
    );
    assertNotEq(bindingId, bytes32(0));
    /* verify RegisteredWithAge event emitted */
    /* verify ageProvenCutoffs[bindingId][cutoff] == true */
}
```

- [ ] **Step 3: Test range-check rejects**

```solidity
function testRegister_v5_4_1_rejectsBadCutoff() public {
    vm.expectRevert(InvalidAgeCutoff.selector);
    registry.register(... 18000101 ...);  // before 1900

    vm.expectRevert(InvalidAgeCutoff.selector);
    registry.register(... 100000101 ...);  // after 9999
}
```

- [ ] **Step 4: Run tests**

```bash
forge test -vv --match-contract ZKQESRegistryUATest
```

Expected: all V5.4 tests still pass + 3 new V5.4.1 tests pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "test(contracts): V5.4.1 — register sentinel-skip + sentinel-set + range-check"
```

---

## Task 3: Deploy script

**Files:**
- Create: `packages/contracts/script/DeployV5_4_1UA.s.sol`

- [ ] **Step 1: Write deploy script**

```solidity
contract DeployV5_4_1UA is Script {
    function run() external returns (ZKQESRegistryUA) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        bytes32 trustedRoot = vm.envBytes32("INITIAL_TRUST_ROOT");
        bytes32 policyRoot  = vm.envBytes32("INITIAL_POLICY_ROOT");
        address identityVerifier = vm.envAddress("V5_3_IDENTITY_VERIFIER");  // pump from V5.4 deploy
        address ageVerifier      = vm.envAddress("V5_4_AGE_VERIFIER");       // pump from V5.4 deploy

        vm.startBroadcast(pk);
        ZKQESRegistryUA reg = new ZKQESRegistryUA(
            trustedRoot, policyRoot,
            identityVerifier, ageVerifier,
            vm.envAddress("ADMIN_ADDRESS")
        );
        vm.stopBroadcast();
        console.log("ZKQESRegistryUA v5.4.1:", address(reg));
        return reg;
    }
}
```

V5.4.1 reuses the V5.4 verifier addresses. No new verifier deploy.

- [ ] **Step 2: Live deploy (founder gate)**

```bash
set -a; source .env; set +a
export V5_3_IDENTITY_VERIFIER=0x...  # from fixtures/contracts/base-sepolia.json
export V5_4_AGE_VERIFIER=0x...
forge script script/DeployV5_4_1UA.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

Verify on BaseScan via `forge verify-contract --chain base-sepolia ...`.

- [ ] **Step 3: Update `fixtures/contracts/base-sepolia.json`**

```jsonc
{
  "_deprecated_v5_4": {
    "registryUA": "0xeE3bE...4816",
    "deprecatedAt": "2026-05-XX",
    "reason": "V5.4 register without combined-age signature; superseded by V5.4.1"
  },
  "registryUA": "0x...",                  // V5.4.1 address
  "groth16VerifierV5_3": "0x...",         // unchanged
  "groth16AgeVerifierUA": "0x...",        // unchanged
  "zkqesCertificate": "0x1e6a...1A63"
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/script/DeployV5_4_1UA.s.sol fixtures/contracts/base-sepolia.json
git commit -m "deploy(contracts): V5.4.1 — ZKQESRegistryUA v2 LIVE on Base Sepolia"
```

- [ ] **Step 5: Ping lead**

SendMessage with deploy address for pump to web-eng worktree.
