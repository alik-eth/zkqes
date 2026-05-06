# ZKQES V5.4.1 — Orchestration Plan

**Goal:** Ship V5.4.1 — combined `register(cp, lp, ageCutoff, ageProof)` with sentinel-optional age + ZeroDev paymaster + AA wallet integration.

**Spec:** `docs/superpowers/specs/2026-05-05-zkqes-v5_4_1-sponsored-register-design.md`.

**Per-worker plans:**
- `2026-05-05-zkqes-v5_4_1-contracts.md` — contracts-eng (registry redeploy)
- `2026-05-05-zkqes-v5_4_1-web.md` — web-eng (AA wallet + paymaster + SDK calldata)
- (No circuits plan — AgeDiiaUA unchanged.)

**Top-line:** V5.4 shipped at `bd38aaa` (registry `0xeE3bE…4816`). V5.4.1 redeploys to add combined register; old marked `_deprecated`. ZeroDev hosted paymaster (managed service); AA wallet via ZeroDev Kernel built-in + EOA fallback. Sponsorship policy: single binary check on `getBinding(derivedBindingId).pk == 0`.

---

## §1. Frozen interface contracts

### §1.1 Updated `IZKQESRegistry::register` signature

Source of truth: spec §3.1. Owned by contracts-eng. Frozen pre-deploy.

Two new tail parameters appended to the existing V5.4 register signature: `uint256 ageCutoffDate, AgeProof calldata ageProof`.

### §1.2 Sentinel encoding

`ageCutoffDate == 0` ⇔ skip age verification. Range-check on contract: `ageCutoffDate == 0 || (ageCutoffDate >= 19000101 && ageCutoffDate <= 99991231)`. SDK encoder explicit: `ageCutoffDate || 0n`, `ageProof || EMPTY_AGE_PROOF`.

Owned by contracts-eng (validation) + web-eng (encoding).

### §1.3 ZeroDev paymaster policy

Source of truth: spec §4.2. Single binary check:

```
sponsor IFF:
  - userOp.target == ZKQESRegistryUA.address
  - userOp.callData.selector == register-v5.4.1.selector
  - getBinding(deriveBindingId(userOp.callData.leafProof.publicSignals[10])).pk == 0
```

Owned by lead (paymaster account + policy config in ZeroDev dashboard).

### §1.4 AA wallet connector list

Source of truth: spec §5.1. Web-eng wires:
- ZeroDev Kernel (built-in, default)
- MetaMask (EOA fallback)
- WalletConnect (EOA + external AA)
- Coinbase Smart Wallet (external AA)

Owned by web-eng.

### §1.5 SDK `BuildWitnessV5_4_1Args`

Source of truth: spec §5.2. Owned by web-eng (SDK).

```ts
export interface BuildWitnessV5_4_1Args extends BuildWitnessArgs {
  ageCutoffDate?: number;       // YYYYMMDD; undefined or 0 = skip age
  ageProof?: AgeProofCalldata;  // required when ageCutoffDate is set
}
```

### §1.6 Deploy artifact pump table

| Artifact | Producer | Consumer |
|---|---|---|
| `ZKQESRegistryUA` v5.4.1 source | contracts-eng | (compiled, deployed) |
| Deploy address (post-deploy) | contracts-eng | web-eng (`deployments.ts` SDK) |
| ZeroDev paymaster account ID + policy script | lead | (configured in ZeroDev dashboard) |
| ZeroDev API key | lead → web-eng (env var) | (consumed at runtime) |

---

## §2. Dispatch sequence

### §2.1 Phase A — contract redeploy + SDK calldata

1. **lead** — write contracts-eng + web-eng plans (this turn).
2. **lead scaffold** — extend existing worktrees; no new ones needed.
3. **contracts-eng** — V5.4.1 register signature change in `IZKQESRegistry.sol` + `ZKQESRegistryUA.sol`. Unit tests (sentinel path + non-sentinel path). Deploy script.
4. **web-eng** — extend SDK `buildWitness` with V5.4.1 args. Update `encode-register.ts` to pack new tail params. Standalone tests against synthetic Diia `.p7s` for sentinel-skip + sentinel-set flows.

Steps 3 + 4 run **in parallel** — interface frozen.

### §2.2 Phase B — paymaster setup (lead-side)

5. **lead** — create ZeroDev paymaster account on the ZeroDev dashboard. Configure policy script per §1.3. Deposit testnet ETH funding. Generate API key.

This step happens during Phase A — no worker dependency. Lead can start ZeroDev signup immediately; the policy script needs the §1.1 register selector which contracts-eng pins early in their plan.

### §2.3 Phase C — deploy + integration

6. **contracts-eng** — live deploy `ZKQESRegistryUA` v5.4.1 to Base Sepolia. Update `fixtures/contracts/base-sepolia.json` per spec §6.1 (V5.4 marked `_deprecated_v5_4`). BaseScan verify.
7. **lead pump** — pump deploy address from contracts-eng → web-eng worktree. Web-eng updates SDK `deployments.ts`.
8. **web-eng** — AA wallet connector wiring (ZeroDev Kernel built-in + MetaMask + WalletConnect + Coinbase). `Step4ProveAndRegister` userOp branch. UI copy for sponsored vs direct paths.
9. **lead** — configure ZeroDev paymaster API key as web env var (`VITE_ZERODEV_API_KEY`). Bake into Dockerfile build args (per founder direction on subdomain hosting; matches WalletConnect ID pattern).
10. **web-eng** — smoke-test sponsored register on Base Sepolia: AA wallet with zero ETH, register-with-age, observe paymaster sponsorship via `pimlico_getUserOperationStatus` or equivalent.

### §2.4 Phase D — merge + tag

11. **lead** — merge order: feat/v5_4_1-contracts → main; feat/v5_4_1-web → main.
12. **lead** — tag `v0.7.3-zkqes-v5_4_1`.
13. **lead** — manual flyctl deploy zkqes-app (no infra change for landing).
14. **lead** — post-deploy smoke + roll-up.

---

## §3. Critical-path summary

```
T0  scaffold + dispatch (lead)
T0+ Phase A  ─┐
              ├── contracts-eng: register signature change + tests
              └── web-eng:       SDK buildWitness V5.4.1 + encode-register
                                                                    │
T1  Phase B  ──── ZeroDev paymaster setup (lead) ───────────────────┤
                                                                    │
T2  Phase C  ─┐                                                    │
              ├── contracts-eng: live deploy + fixtures             │
              ├── lead pump:     deploy addr → web                  │
              ├── web-eng:       AA wallet + userOp branch          │
              └── lead:          ZeroDev API key env var            │
                                                                    │
T3  Phase D  ──── merge + tag + flyctl deploy ──────────────────────┘
```

---

## §4. Merge strategy

Two feat branches, dependency-ordered:

1. `feat/v5_4_1-contracts` — registry + tests + deploy. Ships first since web depends on the deploy address.
2. `feat/v5_4_1-web` — AA wallet + paymaster + SDK changes. Ships second.

Tag `v0.7.3-zkqes-v5_4_1` after the second merge. Push origin → manual flyctl deploy zkqes-app.

---

## §5. Risks (orchestration-side)

- **ZeroDev paymaster setup latency.** Founder needs to create the ZeroDev account + add a payment method to fund the paymaster. Mitigation: lead starts setup in parallel with Phase A; if blocked by founder action, web-eng's Phase C work (steps 8-10) is gated until paymaster + API key land.
- **AA wallet UX divergence.** ZeroDev Kernel UX may not match user expectations from MetaMask/Coinbase. Mitigation: web-eng wires "create a free smart wallet" copy explicitly; smoke-tests the full create-wallet → register flow before merge.
- **Sponsored-vs-direct branching bugs.** Two code paths means double the surface. Mitigation: shared calldata-generation primitive in SDK; only the wallet adapter differs at the leaf.
- **Daily cap exhaustion mid-launch.** If launch goes viral and the daily cap hits, sponsorship pauses. Web fallback message is the safety net but reads as "we ran out of money for free txs" — not great. Mitigation: ZeroDev dashboard alert at 80% daily cap; founder bumps cap as needed.

---

## §6. Phase status snapshot (for CLAUDE.md update post-merge)

To append:

> - **V5.4.1 sponsored register-with-optional-age** — shipped at `v0.7.3-zkqes-v5_4_1`. UA-only Base Sepolia redeploy (`ZKQESRegistryUA` v2). Combined `register(cp, lp, ageCutoff, ageProof)` with sentinel-optional age. ZeroDev hosted paymaster + AA wallet (Kernel built-in default; EOA fallback). First-registration sponsorship policy.
