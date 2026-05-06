# ZKQES V5.4.1 — Sponsored register-with-optional-age

> Date: 2026-05-05. Status: design target. Scope: V5.4.1 amendment shipping a combined `register()` function with sentinel-optional age + ZeroDev paymaster + AA wallet integration on web. Builds on shipped V5.4 (`bd38aaa` Base Sepolia deploy).
>
> Builds on:
> - `2026-05-05-zkqes-v5_4-per-country-age-design.md` (shipped). V5.4.1 adds a sponsored entry path; existing `proveAge`, `rotateWallet`, `register(cp, lp)` endpoints and surfaces are retained or deprecated per §6.

## 1. Motivation

V5.4 ships the per-country pattern + age verification for UA, but every register or proveAge call requires the user to pay gas in native ETH on Base Sepolia (and eventually Base mainnet). For a privacy / civic-protocol pre-launch, requiring users to acquire ETH on a non-standard L2 before they can prove their identity is the highest single drop-off point in the funnel.

V5.4.1 fixes this by making **the first registration per identity sponsored** via an EIP-4337 paymaster. Rationale + decisions made during the brainstorm:

- **One-time-per-identity sponsorship.** The natural "free tx per user" boundary maps perfectly to a permanent on-chain marker (`getBinding(bindingId).pk == address(0)` ⇔ never registered ⇔ sponsored). Subsequent `proveAge`, `rotateWallet`, etc. are user-paid.
- **Combined `register(cp, lp, ageCutoff, ageProof)` with sentinel-optional age.** Single sponsored selector. UA users (DOB-bearing) pass real `ageCutoff` + `ageProof`; future DOB-less QTSPs pass `ageCutoff = 0` and the contract skips the age verification step. Eliminates the "free register but pay for proveAge" UX gap and reduces the paymaster's policy surface to one binary check.
- **Spam resistance via on-chain duplicate-nullifier revert.** Anyone can submit a malformed witness, but each attempt costs the paymaster verifier gas (~3-4M) without producing a binding. Mitigation: per-(IP, recovered signer) rate limit on the relayer surface (off-chain), bounded paymaster funding cap per period (operational), monitored.

The combined `register` also simplifies the cold-start UX for dApps integrating zkqes: a single user-visible action ("verify identity, prove age 18+") becomes a single atomic on-chain operation. Without combination, a dApp embedding zkqes has to script a two-tx sequence with an awkward "wait for confirmation" beat.

## 2. Architecture overview

### 2.1 Delta vs shipped V5.4

| Component | V5.4 shipped | V5.4.1 |
|---|---|---|
| `IZKQESRegistry::register` | `(cp, lp) → bindingId` | `(cp, lp, ageCutoff, ageProof) → bindingId` |
| `IZKQESRegistry::proveAge` | external | unchanged (post-registration only path for cutoff updates) |
| `ZKQESRegistryUA` | shipped at `0xeE3bE…4816` (per fixtures) | redeploys to a new address; old marked `_deprecated` |
| Paymaster | none | new ZeroDev paymaster + policy |
| Web register flow | direct EOA `writeContract` | AA wallet userOp via paymaster; EOA fallback for power users |
| Circuits | `AgeDiiaUA` shipped | unchanged — V5.4.1 is contract+web only |
| Ceremony | Phase B output landed | unchanged |

### 2.2 Sentinel-optional age semantics

`ageCutoffDate == 0` is the "skip age" sentinel. Range-check moves from `cutoffDate >= 19000101` to `cutoffDate == 0 || (cutoffDate >= 19000101 && cutoffDate <= 99991231)`. When skipped, the `AgeProof` calldata bytes are still passed (Solidity tuples can't be omitted) but the contract bypasses both the public-signal binding check and the Groth16 verifier call.

YYYYMMDD `>= 10000101` for any plausible date, so `0` cleanly distinguishes "skip" from any legitimate cutoff. Contract emits `AgeProven(bindingId, ageCutoffDate, msg.sender)` only when age branch executes.

## 3. Contract surface

### 3.1 Updated `IZKQESRegistry::register`

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

The pre-V5.4.1 V5.4 register signature is preserved verbatim with the two new parameters appended at the tail. This minimizes diff vs shipped V5.4 and matches the Solidity convention for backwards-leaning extensions.

### 3.2 `ZKQESRegistryUA` v2 implementation

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
    // 1. Identity registration — verbatim from V5.4 register.
    bindingId = _registerInternal(
        cp, lp,
        leafSpki, intSpki, signedAttrs, leafSig, intSig,
        trustMerklePath, trustMerklePathBits
    );

    // 2. Age verification — opt-in via sentinel.
    if (ageCutoffDate != 0) {
        if (ageCutoffDate < 19000101 || ageCutoffDate > 99991231) revert InvalidAgeCutoff();
        _proveAgeInternal(bindingId, ageCutoffDate, ageProof);
    }

    return bindingId;
}
```

`_registerInternal` and `_proveAgeInternal` are extracted bodies of the existing V5.4 `register` and `proveAge` external functions. No new logic — internal calls re-use the same verifier hops.

The standalone `proveAge(bindingId, ageCutoffDate, AgeProof)` external function stays. Users who registered without age (or want a different cutoff later) call it directly. Standalone `proveAge` is **not sponsored** — only the combined register entry point is.

### 3.3 No new mappings

V5.4.1 does NOT add a `firstAgeProofSponsored` map or similar. The paymaster's binary policy (sponsor IFF `getBinding(bindingId).pk == 0`) collapses cleanly onto existing storage; the `pk` field already serves as the "registered" sentinel because it stays zero pre-registration and non-zero forever after.

### 3.4 Errors + events

No new errors beyond V5.4. `AgeProven` event still fires inside `_proveAgeInternal`. New event optional:

```solidity
event RegisteredWithAge(bytes32 indexed id, address indexed pk, uint256 ageCutoffDate);
```

emitted only when both branches executed atomically. Helps dApps distinguish "register without age" from "register with age" off-chain via single log scan. Decision: ship the event for clarity; event filters cost nothing.

## 4. Paymaster surface

### 4.1 Choice: ZeroDev paymaster service

V5.4.1 uses ZeroDev's hosted paymaster service over a self-hosted paymaster contract:

- **ZeroDev hosted**: managed policy + funding via ZeroDev dashboard. Founder configures the policy. ZeroDev signs the paymaster's `validatePaymasterUserOp` call. Funded via deposit to ZeroDev's account. Operational cost: ZeroDev's service fee on top of gas.
- **Self-hosted**: deploy `ZKQESPaymaster.sol`, fund directly, sign with project keys. Lower per-tx cost, no third-party dependency, more code to audit.

Decision: **ZeroDev hosted** for V5.4.1. Rationale: pre-launch optimization for time-to-ship over per-tx cost. Self-hosted paymaster is a V5.5+ optimization. ZeroDev's downtime is a paymaster-degraded fallback, not a critical-path issue (web detects + falls back to user-paid path).

### 4.2 Sponsorship policy

Single binary check:

```
sponsor IFF:
  - userOp.target == ZKQESRegistryUA.address
  - userOp.callData.selector == register(ChainProof, LeafProof, bytes, bytes, bytes, bytes32[2], bytes32[2], bytes32[16], uint256, uint256, AgeProof).selector
  - getBinding(deriveBindingId(userOp.callData.leafProof)).pk == 0
```

The third check requires an `eth_call` against the registry from the paymaster's policy engine. ZeroDev supports custom policy via JavaScript/TypeScript hooks; we configure a small policy script that decodes the userOp calldata, derives the bindingId from `leafProof.publicSignals[10]` (the `identityFingerprint`), and reads `getBinding`.

If the policy `eth_call` fails (RPC down) → reject sponsorship; web falls back to user-paid.

### 4.3 Funding model

Founder funds the ZeroDev paymaster account in USDC or ETH on Base Sepolia (testnet) → Base mainnet (post-§9.4). Per-registration cost estimate at ~3-4M gas:

- Base Sepolia: ~$0 (testnet ETH free).
- Base mainnet at ~$0.10/Mgas (Base typical): ~$0.40 per sponsored register.

For a 1000-user pre-launch on Base Sepolia, sponsorship cost = $0. For early Base mainnet users, founder caps the policy at N sponsored registrations per day (configurable in ZeroDev dashboard) to prevent griefing-via-spam.

### 4.4 Spam-resistance fallbacks

- **Per-leafProof rate limit**: ZeroDev policy script tracks `keccak256(leafProof.a)` (or any unique identifier) in an in-memory counter; reject if >3 attempts in 5 minutes. Drops the simplest griefing pattern (resubmit invalid proofs to drain).
- **Per-IP rate limit**: enforced at ZeroDev's bundler edge.
- **Daily cap**: hard cap on sponsored userOps per UTC day. Halts cold if exceeded; web shows "sponsorship paused, please pay gas" fallback message.
- **Off-chain pre-flight**: optional. Web runs the verifier in a Web Worker pre-submit and only routes to sponsored path if the proof verifies locally. Eliminates 95%+ of malformed-proof spam at the source. Adds ~10s latency on the user side; acceptable for the sponsored path.

The pre-flight is a V5.4.1 nice-to-have, not a launch gate. Initial launch relies on rate limits + daily cap.

## 5. Web + SDK surface

### 5.1 AA wallet integration

V5.4.1 web introduces an AA wallet path. Two ways into it:

- **Built-in**: bundle ZeroDev's wallet connector (Kernel SCW) into the web; users without an existing AA wallet get a "create AA wallet" option on the connect screen alongside the EOA wallets.
- **External**: rely on user-supplied AA wallets (Safe + 4337 module, Coinbase Smart Wallet, etc.). Web detects via the wallet's `eth_supportedEntryPoints` response.

Decision: **both, with built-in as default**. Founder DM-confirmed during brainstorm. Built-in path is the smoothest UX for cold-start users who don't already have a wallet; external path serves power users.

Connect screen shape:

```
┌─ Connect a wallet ──────────────────────────┐
│  ⊕ Create a free smart wallet (recommended) │  ← ZeroDev Kernel
│  ⊙ MetaMask                                 │  ← EOA fallback
│  ⊙ WalletConnect                            │  ← EOA / external AA
│  ⊙ Coinbase Wallet                          │  ← Coinbase Smart Wallet
└──────────────────────────────────────────────┘
```

### 5.2 SDK changes

`packages/sdk/src/witness/v5/build-witness.ts` — `buildWitness` already produces the witness for the V5.4 register signature. V5.4.1 extends with optional age params:

```ts
export interface BuildWitnessV5_4_1Args extends BuildWitnessArgs {
  ageCutoffDate?: number;       // YYYYMMDD; undefined or 0 = skip age
  ageProof?: AgeProofCalldata;  // required when ageCutoffDate is set
}
```

When `ageCutoffDate` is set, the builder additionally runs `buildAgeWitness` (V5.4 unchanged) and packages both witnesses for the combined register call.

`packages/sdk/src/calldata/encode-register.ts` — extends to pack the new parameters into the register calldata. Sentinel encoded explicitly: `ageCutoffDate || 0n`, `ageProof || EMPTY_AGE_PROOF`.

### 5.3 ProveAgeFlow / RegisterFlow updates

`Step4ProveAndRegister` (existing v5 register flow) gets a userOp branch:

1. Detect connected wallet: AA-capable → sponsored path; EOA → direct path.
2. Build calldata: identical to V5.4.1 register signature.
3. Sponsored path: build userOp, request paymaster signature from ZeroDev, submit through ERC-4337 bundler.
4. Direct path: `writeContract` with user paying gas.

UX: sponsored path renders "Verifying identity (free)…" — direct path renders "Verifying identity (gas: $0.40)…". Same component, different copy.

`ProveAgeFlow` is unchanged — standalone `proveAge` is unsponsored, user always pays.

### 5.4 Hardcoded V5.4.1 registry address

`packages/sdk/src/deployments.ts`:

```ts
export const ZKQES_REGISTRY_UA = {
  baseSepolia: {
    v5_4: { address: '0xeE3bE…4816', _deprecated: true },
    v5_4_1: { address: '0x...', deployedAt: 'BLOCK_NUMBER' },     // new V5.4.1 deploy
    current: '0x...',                                              // alias for v5_4_1
  },
} as const;
```

Web reads `current`. The `v5_4` deprecated entry is the audit-trail honesty marker, same pattern as V5.4's `_deprecated` block per spec §8.

## 6. Migration path

### 6.1 Steps

1. Compile + deploy `ZKQESRegistryUA` v2 to Base Sepolia.
2. Update `fixtures/contracts/base-sepolia.json`:
   ```jsonc
   {
     "_deprecated_v5_4": {
       "registryUA": "0xeE3bE...4816",
       "deprecatedAt": "2026-05-XX",
       "reason": "V5.4 register without combined-age signature; superseded by V5.4.1 deploy"
     },
     "registryUA": "0x...",                  // V5.4.1 address
     "groth16VerifierV5_3": "0x...",         // unchanged from V5.4 (already real, post-Phase B)
     "groth16AgeVerifierUA": "0x...",        // unchanged from V5.4
     "zkqesCertificate": "0x1e6a...1A63"     // unchanged
   }
   ```
3. Update SDK `deployments.ts` per §5.4.
4. Configure ZeroDev paymaster: account creation, policy script deploy, funding deposit.
5. Deploy + verify all contracts on BaseScan.
6. Web AA wallet connector landed; sponsored path wired in `Step4ProveAndRegister`.
7. Smoke-test full sponsored register on Base Sepolia (synthetic .p7s sample, AA wallet, no ETH in user wallet, observe gas-paid-by-paymaster).
8. Roll-up + tag `v0.7.3-zkqes-v5_4_1`.

### 6.2 Existing V5.4 testnet bindings

Existing bindings on `0xeE3bE…4816` are NOT migrated. Anyone with a V5.4 binding re-registers on the V5.4.1 deploy if they want sponsorship. Pre-launch testnet — no real user data preserved.

## 7. Out of scope

- Self-hosted paymaster contract (`ZKQESPaymaster.sol`) — V5.5+ optimization.
- Cross-country sponsorship policy (sponsor `register` for V5.5 country #2 paymaster) — extends V5.4.1 policy when V5.5 ships.
- Off-chain pre-flight verification — V5.4.2 nice-to-have if spam pattern emerges.
- ZeroDev Kernel SCW custom features (session keys, multi-sig, etc.) — out of V5.4.1 scope; basic Kernel deployment covers the use case.
- Mainnet deploy — V5.4.1 ships to Base Sepolia. Mainnet is the §9.4 acceptance gate.
- Sweeping rename of legacy `Zkqes*` entities — separate arc (#93).

## 8. Success criteria

1. `ZKQESRegistryUA` v5.4.1 deployed on Base Sepolia with the combined-register signature live.
2. ZeroDev paymaster account configured with the §4.2 policy and funded with sufficient testnet ETH.
3. **End-to-end sponsored register:** UA user with real Diia `.p7s`, AA wallet (ZeroDev Kernel default), zero ETH in wallet, completes register-with-age in a single sponsored userOp. Resulting binding has `dobSupported == 1`, `ageProvenCutoffs[bindingId][cutoff] == true`.
4. **EOA fallback:** UA user with EOA wallet (MetaMask) completes register-with-age via direct `writeContract`, paying gas themselves. Same end state on chain.
5. **Sentinel skip:** synthetic call with `ageCutoffDate == 0` registers a binding without firing the age path; `ageProvenCutoffs[bindingId][*]` stays empty.
6. Spam-resistance rate limits enforced: ≥3 invalid-proof submissions from the same IP/leafProof in 5 min get rejected by the paymaster.

## 9. Risks

- **Paymaster funding griefing.** Without rate limits, a single attacker could drain the paymaster's balance via malformed-proof spam. Mitigation: per-leafProof + per-IP rate limit, daily cap, optional pre-flight (§4.4).
- **ZeroDev service downtime.** Paymaster signature unavailable → sponsored path fails. Mitigation: web detects + falls back to direct `writeContract`. User pays gas themselves; flow continues.
- **AA wallet UX learning curve.** Users unfamiliar with smart wallets may bounce on the "create a free smart wallet" option. Mitigation: clear copy ("we'll create a free wallet for you, no setup needed"); EOA option remains visible.
- **Calldata bloat from sentinel.** Skip-age callers still pay calldata for the empty `AgeProof` (~320 bytes ≈ 1.3K gas on L2 ≈ $0.0001). Negligible.
- **Sponsored selector collision risk.** If V5.4.1 contract gets a non-trivial bug post-deploy, paymaster keeps sponsoring the buggy call until policy update. Mitigation: contract redeploy + paymaster policy update happen atomically (lead-coordinated); pre-deploy gauntlet covers the major paths.

---

## Cross-references

- Parent: `2026-05-05-zkqes-v5_4-per-country-age-design.md` — V5.4 shipped.
- ZeroDev paymaster policy reference: ZeroDev docs (external).
- ERC-4337: spec & wallet interfaces (external).
