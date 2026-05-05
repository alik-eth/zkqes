# ZKQES V5.4 — Orchestration Plan

> **For lead use only.** Per-worker plans:
> - `2026-05-05-zkqes-v5_4-contracts.md` — contracts-eng
> - `2026-05-05-zkqes-v5_4-circuits.md` — circuits-eng
> - `2026-05-05-zkqes-v5_4-web.md` — web-eng

**Goal:** Ship V5.4 — per-country registry pattern + age verification for UA — as a single coordinated multi-worker arc.

**Spec:** `docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md`.

**Top-line scope reminder:** A-narrow (ship `ZKQESRegistryUA` only, no router until V5.5). `IZKQESRegistry` frozen interface. Tier-2 `AgeDiiaUA` circuit (Diia diverges from RFC 3739; UA-specific extractor stays). Parameterized cutoff. dobCommit private. Single Phase B ceremony covering both V5.3 identity + V5.4 age circuits.

---

## §1. Frozen interface contracts

The artifacts below are **frozen at brainstorm-output**. Workers consume them; lead approves any change request before broadcasting.

### §1.1 `IZKQESRegistry` Solidity interface

Source of truth: spec §3.1. Owned by contracts-eng. Frozen at deploy.

### §1.2 `ZKQESRegistryUA` storage layout

Source of truth: spec §3.2. Owned by contracts-eng. Constructor args + storage slots locked.

### §1.3 `AgeDiiaUA` circuit public-signal layout

Source of truth: spec §4.1. Three public signals, exactly:

| Slot | Name | Type |
|---|---|---|
| 0 | `ageQualified` | uint (0/1) |
| 1 | `ageCutoffDate` | uint (YYYYMMDD) |
| 2 | `nullifierCtx` | uint |

Owned by circuits-eng. Order is FROZEN — `Groth16AgeVerifierUA.sol`'s public signal array MUST match this slot ordering byte-for-byte.

### §1.4 `nullifierCtx` derivation

```
nullifierCtx = keccak256(abi.encodePacked(
  "zkqes-age-ctx-v1",   // ProtocolBytes literal — frozen
  bindingId,            // bytes32
  ageCutoffDate         // uint256
))
```

Used both circuit-side (private witness derives + verifies) and contract-side (`ZKQESRegistryUA.proveAge` recomputes + asserts equality). The string `"zkqes-age-ctx-v1"` is a frozen ProtocolBytes literal, NEVER renamed.

Owned by circuits-eng (definition) + contracts-eng (verification).

### §1.5 `QtspMeta` schema extension

Source of truth: spec §7. Owned by web-eng (SDK + fixtures).

```ts
dobEncoding: 'rfc-3739' | 'diia-ua' | 'none';
dobAttributeOid: string | null;  // null when dobEncoding === 'none'
```

`fixtures/trust/ua/diia/meta.json` updated in same commit as schema extension; integrity test from multi-QTSP T14 catches drift.

### §1.6 `BuildAgeWitnessArgs` SDK API

Source of truth: spec §6.1. Owned by web-eng.

```ts
export interface BuildAgeWitnessArgs {
  signedCades: Buffer;
  bindingId: bytes32;
  ageCutoffDate: number;       // YYYYMMDD
  nullifierCtxKeccak: bytes32;
}
```

The `nullifierCtxKeccak` field is **passed in by the consumer, NOT derived inside the witness builder** — keeps the keccak primitive consistent across web (UI), contracts (verification), and circuits (witness). Web computes it via `viem`'s `keccak256` + same args as §1.4.

### §1.7 Deploy artifact pump table

Cross-package outputs flow lead → consumer worktrees:

| Artifact | Producer | Consumer |
|---|---|---|
| `Groth16VerifierV5_3.sol` (real, post-ceremony) | circuits-eng | contracts-eng |
| `Groth16AgeVerifierUA.sol` (real, post-ceremony) | circuits-eng | contracts-eng |
| `IZKQESRegistry.sol` ABI (compiled) | contracts-eng | web-eng (SDK ABI re-export) |
| `ZKQESRegistryUA` deploy address | contracts-eng (post-deploy) | web-eng (`deployments.ts`) |
| `AgeDiiaUA.r1cs` + final `.zkey` + `vkey.json` | circuits-eng (post-ceremony) | contracts-eng (verifier compile) + web-eng (R2 artifact URL) |
| `fixtures/trust/ua/diia/meta.json` (V5.4-extended) | web-eng | (no consumer; just lands) |

---

## §2. Dispatch sequence

V5.4 has cross-package interface contracts + ceremony coupling. Strict ordering required:

### §2.1 Phase A — interfaces and circuits land first

1. **lead** — write contracts-eng + circuits-eng + web-eng plans (this turn).
2. **lead scaffold** (this turn) — create worktrees per `feat/v5_4-{contracts,circuits,web}` (see §S2). No code yet, just branches off `main`.
3. **circuits-eng** — `AgeDiiaUA.circom` + parameterized cutoff template + R1CS compile + initial `.zkey` (Phase 1 from existing pot22). Ships as feat/v5_4-circuits commits.
4. **contracts-eng** — `IZKQESRegistry.sol` interface + `ZKQESRegistryUA.sol` skeleton (with stub `Groth16AgeVerifierUA` for unit tests pre-ceremony). Ships as feat/v5_4-contracts commits.
5. **web-eng** — SDK `build-age-witness.ts` against the public-signal layout from §1.3 + `QtspMeta` schema extension + `ProveAgeFlow` UI shell (mocked Groth16 verification for unit tests). Ships as feat/v5_4-web commits.

Steps 3, 4, 5 run **in parallel** — interfaces are frozen so no cross-worker coupling. Each worker uses stubs/mocks for downstream artifacts.

### §2.2 Phase B — Phase B ceremony fires

Gate: all three Phase A workers' branches green (typecheck + tests + build). Lead reviews each worker's commits per the team review pattern.

6. **lead** — extend ceremony-coord scripts per spec §5.3 (`--circuit` flag, `circuits.*` payload field). Lands in `scripts/ceremony-coord/` directly on `main`. Pre-ceremony.
7. **circuits-eng + lead** — coordinate Phase B ceremony recruitment + fire (existing pending task #8). Output: real V5.3 identity verifier + real V5.4 age verifier as compiled `.sol`. Per spec §5.1, contributors do BOTH circuits per session.
8. **lead pump** — pump real verifiers from circuits-eng worktree → contracts-eng worktree.

### §2.3 Phase C — deploy + integration

9. **contracts-eng** — replace stub `Groth16AgeVerifierUA` with real verifier. Compile + deploy `ZKQESRegistryUA` on Base Sepolia per spec §8.2 steps 2-3.
10. **lead pump** — pump deploy address + new verifier addresses from contracts-eng → web-eng worktree (`fixtures/contracts/base-sepolia.json` _deprecated marker + new addresses).
11. **web-eng** — replace mocked Groth16 with real proof generation; smoke-test full register → proveAge round-trip on Base Sepolia.
12. **lead** — update `fixtures/trust/ua/diia/meta.json` per spec §8.2 step 8 (state: live, real samples).

### §2.4 Phase D — merge + tag

13. **lead** — merge order: feat/v5_4-circuits → main; feat/v5_4-contracts → main (depends on real verifier); feat/v5_4-web → main (depends on deploy address).
14. **lead** — tag `v0.7.2-zkqes-v5_4`.
15. **lead** — manual flyctl deploy zkqes-app (no infra change for landing).
16. **lead** — post-deploy smoke + roll-up.

---

## §S. Lead scaffold steps

### §S1. Worktrees

Lead creates from main checkout:

```bash
cd /data/Develop/identityescroworg
git checkout main && git pull
git worktree add /data/Develop/qkb-wt-v5/v5_4-circuits -b feat/v5_4-circuits main
git worktree add /data/Develop/qkb-wt-v5/v5_4-contracts -b feat/v5_4-contracts main
# web-eng's existing /data/Develop/qkb-wt-v5/deploy-web stays; switch to feat/v5_4-web there.
```

### §S2. Package skeletons (none new)

V5.4 is purely amendment work — no new packages. Existing packages each get new files per the per-worker plans.

### §S3. Shared fixtures (none new)

`fixtures/contracts/base-sepolia.json` updates land via Phase C lead pump. No pre-Phase-A scaffold needed.

### §S4. Context-compaction gate

Before handing reused workers their V5.4 plans, ask each to self-report context size. If any is >100k tokens, instruct them to compact before proceeding. circuits-eng + contracts-eng have been mostly idle since their last arc closed — likely fresh. web-eng compacted recently for the v3 redesign train; should be re-compactable if needed pre-V5.4.

---

## §3. Critical-path summary

```
T0  scaffold + dispatch (lead)
T0+ Phase A  ─┐
              ├── circuits-eng:  AgeDiiaUA + R1CS + initial .zkey
              ├── contracts-eng: IZKQESRegistry + ZKQESRegistryUA skeleton
              └── web-eng:       build-age-witness + ProveAgeFlow shell
                                                                    │
T1  Phase B  ──── ceremony multi-circuit + Phase B fire ────────────┤
                                                                    │
T2  Phase C  ─┐                                                    │
              ├── contracts-eng: real verifier swap + deploy        │
              ├── lead pump:     deploy addrs → web                 │
              └── web-eng:       real proof gen + smoke              │
                                                                    │
T3  Phase D  ──── merge + tag + flyctl deploy ──────────────────────┘
```

Phase A → B coupling: ceremony fires once all three workers have **passing skeleton** state (i.e., circuits-eng has the .circom + r1cs, contracts-eng has the interface + skeleton with stub verifier, web-eng has the SDK + UI mock). Real proof + real deploy land in Phase C.

---

## §4. Per-worker plan refs

- contracts-eng: `2026-05-05-zkqes-v5_4-contracts.md`
- circuits-eng:  `2026-05-05-zkqes-v5_4-circuits.md`
- web-eng:       `2026-05-05-zkqes-v5_4-web.md`

Each worker plan stands alone; orchestration plan is the cross-cutting reference.

---

## §5. Merge strategy

All three feat branches merge to `main` via `--no-ff` from the lead checkout. Tag `v0.7.2-zkqes-v5_4` after the third merge lands. Push origin → manual flyctl deploy zkqes-app.

Order:
1. `feat/v5_4-circuits` — verifier contract + ceremony output
2. `feat/v5_4-contracts` — registry deploy depends on verifier
3. `feat/v5_4-web` — UI deploy depends on registry address

The order is dependency-driven, not chronological — Phase A workers commit in parallel; Phase D merges in this strict order so each merge sees the artifacts it consumes.

---

## §6. Risks (orchestration-side)

- **Phase A lockstep miss.** If one worker's skeleton lands later than the others, Phase B is blocked. Mitigation: lead reviews each worker's commits in real time; surface stalls at first delayed daily ping.
- **Ceremony coupling escalation.** If Phase B ceremony has a contributor recruitment shortfall (<5 contributors), V5.4 stalls. Fallback: split ceremonies (V5.3 fires alone, V5.4 ceremony separate later) — spec §11.
- **`nullifierCtx` derivation drift.** Three sites compute the same keccak: circuit private witness, contract `proveAge`, SDK `build-age-witness` (passed in by consumer). Drift breaks `proveAge` silently. Mitigation: define the derivation once in spec §1.4; each worker's plan §1 references this section verbatim; integration test in Phase C round-trips the derivation across all three sites.
- **Stub-verifier-to-real-verifier swap forgotten.** contracts-eng must NOT ship Phase A skeleton with stub verifier as production code. Mitigation: explicit Phase C step 9 in the contracts-eng plan; lead reviews pre-deploy.

---

## §7. Open question (founder gate before Phase A starts)

**Should V5.4 ship Phase B ceremony for V5.3 identity ALONGSIDE V5.4 age, or is V5.3 ceremony decoupled?** Spec §5 locks single combined Phase B per founder direction ("1 ceremony per recruited person, 2 circuits"). This is acknowledged but worth surfacing once more pre-Phase-A to confirm: if founder revisits the coupling decision, V5.4 plan structure stays the same but Phase B fires later (V5.4 only) or earlier (V5.3 only).

Founder confirmed combined at brainstorm-time. Locked unless re-opened.

---

## §8. Phase status snapshot (for CLAUDE.md update post-merge)

To append to CLAUDE.md "Phase status snapshot" section once V5.4 ships:

> - **V5.4 per-country registries + age** — shipped at `v0.7.2-zkqes-v5_4`. UA-only deploy on Base Sepolia (`ZKQESRegistryUA`). `IZKQESRegistry` interface frozen for V5.5+ countries. Tier-2 `AgeDiiaUA` circuit shipped; Tier-1 `AgeRFC3739` deferred. Parameterized cutoff. Router skipped (V5.5).
