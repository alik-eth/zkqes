# zkqes civic-terminal v2 — orchestration plan

> **For agentic workers:** This document is **lead-only**. Workers read their own per-worker plan. Workers reference §2 (interface contracts) and §6 (frozen tokens) but do NOT take instructions from this file. Workers ARE bound by §2 — any change requires a lead-broadcast.

**Source spec:** [`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-v2-design.md @ bd33007`](../specs/2026-05-04-zkqes-civic-terminal-v2-design.md)
**Branch baseline:** `chore/civic-terminal-v2-spec @ bd33007` (the spec branch — merge to `main` before dispatch)
**v1 spec it extends:** `docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md @ 85bc85e`

---

## 0. Scope reminder

v2 covers four work areas across three workers. Lead does the scaffold + ceremony-coord schema bump + BRAND.md amendment. Web-eng owns the bulk (landing state machine, /ceremony rebuild, app routes refactor including DeviceReadinessGate + PreviewModeBanner, docs.zkqes.org retheme). Contracts-eng owns the **Base Sepolia** stub-verifier deploy upfront (§8.2 reorder — no longer gated on Phase B ceremony) plus the post-ceremony real-verifier swap (deferred until ceremony completes; separate dispatch).

Chain target locked: **Base Sepolia (chainId 84532)** — the L2 testnet for Base. (L1 Sepolia is NOT used for v2; pre-existing V4 deployments at `fixtures/contracts/sepolia.json` stay frozen as historical record.)

Out of scope for v2 dispatch: the Phase B ceremony itself (already pending as task #8), the real-verifier swap (post-ceremony, separate plan), mobile-app port, /about/faq/research surfaces.

## 1. Workers + worktrees

| Worker         | Worktree                                          | Branch baseline                  | Owns                                                                 |
|----------------|---------------------------------------------------|----------------------------------|----------------------------------------------------------------------|
| `lead` (you)   | `/data/Develop/identityescroworg`                 | `main` after spec merge          | ceremony-coord schema bump, BRAND.md amendment, scaffold, pumps, merges |
| `contracts-eng`| `/data/Develop/qkb-wt-v5/contracts`               | `feat/v2-contracts-stub-deploy`  | Base Sepolia stub-verifier deploy + new `fixtures/contracts/base-sepolia.json` |
| `web-eng`      | `/data/Develop/qkb-wt-v5/web`                     | `feat/v2-web-civic-terminal`     | Landing state machine, /ceremony rebuild, app routes refactor, docs retheme |

Note: `qkb-wt-v5/` directory name is preserved across the rename (per CLAUDE.md "Worktrees" §) to avoid breaking running worker context.

## 2. Interface contracts (FROZEN — do not drift without lead broadcast)

These are the cross-worker boundaries. Any change requires a `SendMessage({to: "*", ...})` broadcast and a paired plan amendment.

### 2.1 `status.json` schema (lead writes, web-eng reads)

The existing schema at `scripts/ceremony-coord/src/types.ts` and the mirror at `packages/web/src/lib/ceremonyStatus.ts` are extended **additively**. The spec §7.1 shape with `startedAt` / `beacon: { applied, sha256, appliedAt }` is **not** adopted — it would force a ceremony-coord rewrite for no functional gain. The existing field names stay; only `phase` is added.

Frozen post-bump shape:

```typescript
export interface CeremonyStatusPayload {
  // EXISTING — unchanged:
  readonly round: number;                      // last completed round; 0 = round-zero only
  readonly totalRounds: number;                // typically 10
  readonly contributors: readonly CeremonyContributor[];
  readonly currentRoundOpenedAt?: string;      // ISO-8601 UTC
  readonly finalZkeySha256: string | null;     // populated post-finalize
  readonly beaconBlockHeight: number | null;
  readonly beaconHash: string | null;

  // NEW — v2 adds:
  readonly phase: 'recruiting' | 'ceremony-live' | 'live';
}
```

Validation contract:
- `phase` MUST be one of the three string literals.
- For backward compat, frontends that encounter `phase: undefined` (older R2 payload) derive: `(finalZkeySha256 !== null) → 'live'`, `(round >= 1) → 'ceremony-live'`, else `'recruiting'`.
- `validateStatusPayload` updated to require `phase` going forward (with the `?? derive(p)` fallback baked into the parse path, NOT the validator).

### 2.2 `fixtures/contracts/base-sepolia.json` (contracts-eng writes, web-eng reads)

This is a NEW file. The existing `fixtures/contracts/sepolia.json` carries Phase 1 / V4 deployments on **L1 Sepolia** (chainId 11155111) and stays frozen as historical record — v2 does not touch it. The Base Sepolia v2 deploy lands at a sibling file `fixtures/contracts/base-sepolia.json`:

```json
{
  "chainId": 84532,
  "v5_2": {
    "registry": "0x...",
    "verifier": "0x...",
    "verifierKind": "stub",
    "certificate": "0x...",
    "deployedAt": "2026-05-XX",
    "deployBlock": 12345678,
    "deployTx": "0x...",
    "stubArtifactSha256": "<sha of Groth16VerifierV5_2Stub.sol bytecode>"
  }
}
```

`verifierKind` is `"stub"` until ceremony completes, then flips to `"real"` in a follow-up commit (post-ceremony plan, not in this dispatch).

Web-eng's `packages/web/src/fixtures/contracts/base-sepolia.json` is the consumer mirror, pumped by lead.

### 2.3 BRAND.md amendment (lead writes, no consumers)

Lifted verbatim from v1 spec §6.1–§6.3 + §3.5, plus v2 surface-grammar additions for /ceremony 3-col + /register single-long-form + /verify 3-col. Amendment goes into the existing `BRAND.md` at the repo root; lead owns this commit. Workers don't touch BRAND.md.

### 2.4 Civic-terminal token grammar (web-eng owns, no other workers touch)

Frozen at `packages/web/src/styles/civic-terminal.css` (lifted from Claude Design handoff bundle 2026-05-04). The token list — `--ct-paper`, `--ct-ink`, `--ua-blue`, `--eu-gold`, `--mono`, `--display`, `.ct-panel`, `.ct-tab`, `.ct-tag--warn`, `.ct-civic-stripe`, etc. — is the brand layer. New surfaces use these primitives; no new primitives without lead approval.

## 3. Critical path + sequencing

```
Lead L1 ──┐
          ├──→ Web-eng W1 (landing state machine) ──┐
Lead L2 ──┘                                         ├──→ Web-eng W4 (app routes incl. DeviceReadinessGate)
                                                    │
Contracts-eng C1 ─────────────────────→ Web-eng W3 (pump base-sepolia.json) ──┘

                         Web-eng W2 (/ceremony rebuild) ←── independent of C1
                         Web-eng W5 (docs retheme)        ←── independent of all
                         Lead L3 (BRAND.md amendment)     ←── independent of all
```

**Critical path order:**

1. **L1** — ceremony-coord schema bump (status.json `phase` field + `--phase` flag in `publish-status.ts` + `round-zero.ts` writes `phase: 'recruiting'`). Unblocks W1 + W2.
2. **L2** — pump bumped types to web worktree (`packages/web/src/lib/ceremonyStatus.ts`). Unblocks W1 + W2.
3. **C1** — Contracts-eng deploys `Groth16VerifierV5_2Stub` + `ZkqesRegistryV5_2` + `ZkqesCertificate` to **Base Sepolia (chainId 84532)**, writes addresses to new `fixtures/contracts/base-sepolia.json`. Unblocks W4.
4. **W1** — Landing state-machine wiring (phase-driven content swaps in `CivicTerminalLanding.tsx`).
5. **W2** — /ceremony rebuild (3-col civic-terminal shell, JSON-driven).
6. **W3** — pump `base-sepolia.json` from contracts → web.
7. **W4** — App routes refactor: DeviceReadinessGate + PreviewModeBanner + /register + /rotate + /verify wiring.
8. **W5** — docs.zkqes.org VitePress retheme.
9. **L3** — BRAND.md amendment (any time after spec merge; doesn't block workers).

**Parallel-able:** L3 + W2 + W5 can all run in parallel with C1 and W4. L1 + L2 + C1 are dispatch-day-1; W1 + W2 + W5 are dispatch-day-1; W4 starts after C1 returns + lead pumps.

**Wall-time estimate (single-engineer-equivalent):** L1+L2 ≈ ½ day; C1 ≈ 1 day (incl. live deploy); L3 ≈ ½ day; W1 ≈ 1 day; W2 ≈ 2–3 days; W4 ≈ 5–7 days; W5 ≈ 1 day. Total ≈ 11–14 days; with parallelism ≈ 7–9 days.

## 4. Lead-side scaffold

### S1. Merge spec to main

```bash
cd /data/Develop/identityescroworg
git checkout main && git pull
git merge --no-ff chore/civic-terminal-v2-spec -m "merge: civic-terminal v2 design spec"
git push origin main
git tag spec/civic-terminal-v2 bd33007 && git push origin spec/civic-terminal-v2
```

### S2. Worktree setup (one-time per worker)

```bash
cd /data/Develop/identityescroworg
# Reuse existing worktrees for contracts + web (already on main)
git -C /data/Develop/qkb-wt-v5/contracts fetch && \
  git -C /data/Develop/qkb-wt-v5/contracts checkout -b feat/v2-contracts-stub-deploy main
git -C /data/Develop/qkb-wt-v5/web fetch && \
  git -C /data/Develop/qkb-wt-v5/web checkout -b feat/v2-web-civic-terminal main
```

### S3. Context-compaction gate (per CLAUDE.md S6b)

Before resuming web-eng + contracts-eng, ask each:

```
SendMessage({to: "web-eng", text: "Self-report context size in tokens. >100k means compact before next phase."})
SendMessage({to: "contracts-eng", text: "Self-report context size in tokens. >100k means compact before next phase."})
```

If either returns >100k, instruct compaction before sending the new plan.

### S4. Dispatch (parallel, one message)

```
SendMessage({to: "web-eng", text: "Civic-terminal v2 ready. Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md. Worktree: /data/Develop/qkb-wt-v5/web @ feat/v2-web-civic-terminal. Interface contracts in orchestration §2 — read before touching anything. Start with W1 (landing state machine); W4 gated on contracts pump (I'll signal)."})

SendMessage({to: "contracts-eng", text: "Civic-terminal v2 ready. Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-contracts.md. Worktree: /data/Develop/qkb-wt-v5/contracts @ feat/v2-contracts-stub-deploy. C1 = Base Sepolia (chainId 84532) stub-verifier deploy upfront (no longer gated on ceremony per spec §8.2). Base Sepolia §9.4 acceptance gate (#18) runs against your deploy."})
```

L1+L2+L3 are lead-side; lead does them in main checkout per the per-worker `2026-05-04-zkqes-civic-terminal-v2-lead.md` plan.

## 5. Pump table

Cross-package outputs flow lead-mediated, never directly between worktrees.

| Source                                                         | Sink                                                | When                          |
|----------------------------------------------------------------|------------------------------------------------------|-------------------------------|
| `scripts/ceremony-coord/src/types.ts` (after L1 commit)        | `packages/web/src/lib/ceremonyStatus.ts` (web wt)   | Immediately after L1 commit; web-eng blocked on this |
| `fixtures/contracts/base-sepolia.json` (after C1 deploy)       | `packages/web/src/fixtures/contracts/base-sepolia.json` (web wt) | Immediately after C1 commits + verifies |
| `packages/contracts/abi/ZkqesRegistryV5_2.json` (regen)        | `packages/sdk/src/abi/ZkqesRegistryV5_2.ts` (sdk side) | If ABI re-export is needed; usually unchanged |

Pump command pattern (per CLAUDE.md):

```bash
# Example: pump base-sepolia.json from contracts worktree to web worktree
cp /data/Develop/qkb-wt-v5/contracts/fixtures/contracts/base-sepolia.json \
   /data/Develop/qkb-wt-v5/web/packages/web/src/fixtures/contracts/base-sepolia.json
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/fixtures/contracts/base-sepolia.json
git -C /data/Develop/qkb-wt-v5/web commit -m "chore(web): pump base-sepolia.json v5_2 stub addresses"
```

## 6. Frozen brand tokens (web-eng heads-up)

Web-eng MUST use the existing primitives in `packages/web/src/styles/civic-terminal.css`. Any new primitive (e.g., a `.ct-panel--warn-stripe` variant) requires a lead broadcast. Adding new tokens drifts the brand. The expected primitive set for v2 surfaces:

- Panels: `.ct-panel`, `.ct-panel--raised`, `.ct-panel--inset`
- Tabs: `.ct-tab`, `.ct-tab--off`
- Tags: `.ct-tag`, `.ct-tag--warn`
- Civic stripe: `.ct-civic-stripe` (decorative, `aria-hidden`)
- Type: `var(--display)` (VT323 — headers/marquee), `var(--mono)` (Plex Mono — body/code)
- Color: `var(--ct-paper)`, `var(--ct-ink)`, `var(--ua-blue)`, `var(--ua-yellow)`, `var(--eu-blue)`, `var(--eu-gold)`, `var(--ok)`, `var(--warn)`, `var(--err)`

If a marketer-locked piece of copy lives in v1 spec §3 or this v2 spec §3 / §4 / §5 / §6 — copy it verbatim; do not rephrase. Marketer-locked strings are tracked in the per-worker web plan's "frozen copy" table.

## 7. Verification gates (lead runs after each worker commit)

### Contracts-eng

```bash
cd /data/Develop/qkb-wt-v5/contracts
forge test -vv                                          # 412/413 expected (1 skip), all passing
pnpm -F @zkqes/contracts typecheck                      # green
forge script script/DeployV5_2.s.sol --rpc-url $ANVIL  # dry-run on local fork before live
```

After live deploy:
- BaseScan verification green for `Groth16VerifierV5_2Stub`, `ZkqesRegistryV5_2`, `ZkqesCertificate` (sepolia.basescan.org).
- `cast call $REGISTRY 'groth16Verifier()(address)' --rpc-url $BASE_SEPOLIA_RPC_URL` returns the stub verifier address. (Accessor is `groth16Verifier`, not `verifier` — public field name in `ZkqesRegistryV5_2.sol`. The verifier is `immutable`; post-ceremony rotation = fresh registry redeploy, not setVerifier.)
- `cast call $REGISTRY 'admin()(address)' --rpc-url $BASE_SEPOLIA_RPC_URL` returns expected admin.

### Web-eng (per task)

```bash
cd /data/Develop/qkb-wt-v5/web
pnpm -F @zkqes/web test                                 # 340/340 baseline; new tests must keep this passing
pnpm -F @zkqes/web typecheck                            # green
VITE_TARGET=landing pnpm -F @zkqes/web build            # landing target green
VITE_TARGET=app pnpm -F @zkqes/web build                # app target green
pnpm -F @zkqes/web exec playwright test --project=flow  # smoke + flow projects
```

### Lead

```bash
cd /data/Develop/identityescroworg
pnpm install                                            # workspace install resolves new fields
pnpm -F @zkqes/sdk test && pnpm -F @zkqes/web test     # baseline cross-package suite
```

## 8. Merge order

1. Lead L1 + L2 (ceremony-coord schema + types pump) → already on main via lead commits.
2. **`feat/v2-contracts-stub-deploy`** → main (after BaseScan verify + base-sepolia.json pump).
3. Lead L3 (BRAND.md amendment) → already on main via lead commit.
4. **`feat/v2-web-civic-terminal`** → main (last, depends on L1+L2 schema + C1 base-sepolia.json + L3 BRAND.md).

Each merge uses `git merge --no-ff` with a summary commit message. Tag at the end:

```bash
git tag v0.7.0-civic-terminal-v2 && git push origin v0.7.0-civic-terminal-v2
```

(Tag bump rationale: structural rebrand of all user-facing surfaces; minor-bump under the monorepo's `0.x` scheme. v0.7.0 follows v0.6.0-zkqes-rename.)

## 9. Risks + mitigations

| Risk                                                                 | Mitigation                                                                                                |
|----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `phase` field schema drift between ceremony-coord and web mirror     | Both files have a header comment pointing at the other; CI smoke (`pnpm test`) parses a fixture status.json with `phase: 'recruiting'` and asserts the mirror types match |
| Contracts-eng deploys before lead schema bump lands on main          | Sequence in §3 puts L1+L2 before C1; lead doesn't dispatch C1 until L1 commits to main                   |
| Web-eng touches files outside `packages/web/`                        | Per CLAUDE.md "Red flags from worker output" — lead reverts immediately on any out-of-scope edit         |
| DeviceReadinessGate replaces existing `assessDeviceCapability` and breaks live `/ua/registerV5` flow on Base Sepolia | Web-eng W4 keeps `assessDeviceCapability` exported for backwards-compat; new gate is a parallel component; old `/ua/use-desktop` route stays as a fallback target until v2 rollout completes |
| Base Sepolia stub-verifier deploy gas / cost unknowns                | Anvil dry-run first against a Base Sepolia fork (`anvil --fork-url $BASE_SEPOLIA_RPC_URL`); admin balance check (`cast balance --rpc-url $BASE_SEPOLIA_RPC_URL`) before live broadcast |
| Marquee component duplication between Landing + /ceremony            | Web-eng W2 first task is to extract `Marquee` into `packages/web/src/components/ceremony/Marquee.tsx` shared by both surfaces |
| Frozen-copy drift (marketer-locked strings get rephrased)            | Per-worker web plan §0.1 lists the frozen-copy table; web-eng spot-checks before commit                   |
| Phase-LED a11y regression                                            | DeviceReadinessGate + Marquee tasks each have an `aria-label` test; CI gates                              |

## 10. Out-of-scope confirmation

This dispatch does NOT include:

- The Phase B real-Phase-2 ceremony itself (task #8, separately tracked).
- The post-ceremony real-verifier swap on Base Sepolia or Base mainnet (separate plan after ceremony completes).
- Base mainnet deploy (task #15, gated on user explicit go-ahead per CLAUDE.md "Deployment").
- New routes (/about, /faq, /research) — spec §9 out-of-scope.
- Mobile-app port (spec §9 out-of-scope).

These will be re-dispatched as separate plans when their gating events fire (recruitment + 10 contributions + beacon for ceremony; user go-ahead for mainnet).

## 11. References

- Spec: [`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-v2-design.md`](../specs/2026-05-04-zkqes-civic-terminal-v2-design.md)
- v1 spec: [`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md`](../specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md)
- Lead per-worker plan: [`docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-lead.md`](2026-05-04-zkqes-civic-terminal-v2-lead.md)
- Contracts-eng per-worker plan: [`docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-contracts.md`](2026-05-04-zkqes-civic-terminal-v2-contracts.md)
- Web-eng per-worker plan: [`docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md`](2026-05-04-zkqes-civic-terminal-v2-web.md)
