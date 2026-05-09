# CLAUDE.md — team-lead orchestration playbook

Guidance for the **team-lead** role coordinating the worker agents in this repo. Workers have their own package-scoped CLAUDE.md files (`packages/*/CLAUDE.md`) with package-specific invariants — this file is strictly about orchestration.

## Worker team

Long-lived agents, one per subsystem, reused across phases. Never respawn; compact instead when context grows.

### Spawning vs resuming — tooling distinction

There is **one** `Agent` tool with two usage patterns. The `subagent_type` parameter picks the persona (general-purpose, Explore, code-reviewer, …) and is orthogonal to persistence. Persistence is controlled by `name`:

- `Agent({subagent_type: "general-purpose", prompt: "..."})` — **ephemeral subagent**. Runs, returns a result, terminates. Context is gone. Use for one-shot research/exploration only.
- `Agent({subagent_type: "general-purpose", name: "web-eng", prompt: "..."})` — **named persistent agent**. Stays addressable after returning, resumable with full prior context.

The worker team (flattener-eng, circuits-eng, contracts-eng, web-eng, fly-eng) is **always** the second form. **Call `Agent` with `name` exactly once per worker role, at the very first dispatch.** Every subsequent interaction — next task, greenlight, question, phase transition — goes through `SendMessage({to: "<name>", ...})`. Calling `Agent` a second time with the same `name` (or without a name for a role that already exists) spawns a *new* ephemeral agent alongside, losing the original's context and splitting the team.

Verification pattern: to probe whether a worker is still addressable, just `SendMessage({to: "<name>", ...})`. A live agent replies; a never-spawned name errors. No need to re-`Agent` "just to be safe" — doing so alongside an already-named agent spawns a second instance and splits the role.

Red flag — if you find yourself writing a multi-paragraph "Phase N summary" into a dispatch prompt, you're probably about to re-`Agent` a worker that's already alive. Stop and `SendMessage` instead; the context is still there.

| Agent           | Owns                                          | Typical branch          |
|-----------------|-----------------------------------------------|-------------------------|
| `flattener-eng` | `packages/lotl-flattener`                     | `feat/flattener` family |
| `circuits-eng`  | `packages/circuits`                           | `feat/circuits` family  |
| `contracts-eng` | `packages/contracts`, `packages/contracts-sdk`| `feat/contracts` family |
| `web-eng`       | `packages/web`, `packages/sdk`, `packages/zkqes-cli` | `feat/web` family    |
| `fly-eng`       | `scripts/ceremony-coord/cookbooks/fly`, related cookbooks | `feat/v5arch-fly` family |

The pre-2026-05-03 worker layout also included a `qie-eng` row owning `packages/qie-{core,agent,cli}` + `deploy/mock-qtsps`. That track was parked, then deleted, in the zkqes structural rename (see `docs/superpowers/specs/2026-05-03-zkqes-rename-design.md`). Workers reading older spec/plan corpora may see references; treat them as historical.

## Worktrees

**Always dispatch workers to isolated worktrees** — shared CWD causes branch-switch races that corrupt everyone's work simultaneously. Learned the hard way early in V5.

```bash
# Typical layout
/data/Develop/qkb-wt-v5/{flattener,circuits,contracts,web,fly}     # legacy directory name preserved across the rename to avoid breaking running worker context

# Create
cd /data/Develop/identityescroworg
for pkg in flattener circuits contracts web; do
  git worktree add /data/Develop/qkb-wt-v5/$pkg -b feat/$pkg main
done
```

The lead operates in the main checkout at `/data/Develop/identityescroworg/`. Never ask a worker to edit files outside their assigned package; shared fixtures under `/fixtures/` are lead-owned except when a worker needs to emit a new fixture (ask first).

## Todo list discipline

Lead maintains one long-running task list spanning the whole orchestration — not per-worker task lists. Each task is either a lead-side action (scaffold, review, pump, merge, deploy) or a cross-worker coordination gate (supply LOTL snapshot, supply signed fixture, web deploy).

Status patterns that have worked:
- `in_progress` for ongoing duties (review loop, artifact pumping, CLAUDE.md coverage) — these stay `in_progress` across the whole phase.
- `pending` for discrete gates (supply fixture, merge milestone, deploy).
- `completed` as soon as a discrete gate clears — never batch.

Do NOT create per-task entries for every worker commit. Workers track their own plan via checkbox progress in `docs/superpowers/plans/*.md`. Lead's task list is about orchestration state, not implementation state.

## Plan-driven execution

Every phase has:
- One **design spec** at `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (brainstorming output).
- One **orchestration plan** at `docs/superpowers/plans/YYYY-MM-DD-<topic>-orchestration.md` — interface contracts, dispatch order, merge strategy, lead-side scaffold steps.
- One **per-worker plan** at `docs/superpowers/plans/YYYY-MM-DD-<topic>-<worker>.md` — bite-sized TDD tasks, exact file paths, complete code.

Interface contracts in the orchestration plan are **frozen early**. Changes require explicit lead sign-off and a cross-worker broadcast. Workers read the orchestration plan's §2 before touching anything.

## Dispatch sequence

1. Brainstorm → spec → commit.
2. Write plans → commit.
3. Lead scaffold (orchestration plan §Scaffold): worktrees, package skeletons, pnpm-workspace update, shared fixtures, `.gitignore`.
4. **Context-compaction gate:** before handing reused workers their next-phase plan, ask each to self-report context size. If any is >100k tokens, instruct them to compact before proceeding. Fresh agents need no compaction.
5. Spawn/resume workers in a single message (parallel dispatch). Each worker's initial message includes their plan path and the orchestration-plan link.
6. Review loop: lead runs worker's declared verification commands after each commit, inspects diff, greenlights next task via SendMessage.

## Artifact pumping

Cross-package outputs don't flow automatically — lead moves them between worktrees. Table of expected pumps lives in each orchestration plan (§7). Examples:

- `trusted-cas.json`: flattener worktree → web worktree.
- Contract ABIs + bytecode: contracts worktree → web worktree.
- Sepolia deployment addresses: contracts (after live deploy) → web worktree.
- R2 prover URLs: circuits (after ceremony) → web worktree.

Standard pump:

```bash
# Example: copy a fixture from producer to consumer worktree
cp /data/Develop/qkb-wt-v5/flattener/dist/output/trusted-cas.json \
   /data/Develop/qkb-wt-v5/web/fixtures/
git -C /data/Develop/qkb-wt-v5/web add fixtures/trusted-cas.json
git -C /data/Develop/qkb-wt-v5/web commit -m "chore(web): pump trusted-cas.json from flattener"
```

## Merging

Each worker's branch lives in their worktree. Lead does all merges to `main` from the main checkout.

Milestone merge order (typical):
1. `feat/flattener` (fixtures first).
2. `feat/contracts` (unlocks ABI pump).
3. `feat/circuits` (unlocks artifact URLs).
4. `feat/web` (last, depends on all three).

Merge commits use `--no-ff` with a summary. Tag releases at phase boundaries (`v0.5.x-pre-ceremony`, `v0.6.0-zkqes-rename`, etc.).

## Secrets hygiene

**Never commit:**
- `.env` (gitignored; root has admin key + R2 secrets).
- `.p7s` files (globally gitignored; detached CAdES signatures carry a natural person's legal identity).

If a secret enters git, `git reset --soft` + `git gc --prune=now --aggressive` while it's still only in local history. Pushed secrets require credential rotation, not git surgery.

Secrets that ARE safe to include in orchestration messages to workers:
- admin pk / address (public).
- on-chain contract addresses (public).
- Sepolia RPC URL (semi-public).
- fixture sha256 hashes.

Secrets that are NEVER messaged to workers:
- Private keys of any kind.
- R2 secret access key (use the public URL output instead).
- `.p7s` contents or paths on machines workers can't reach anyway.

## CI / verification

Per-package verification (lead runs after each worker commit):

```bash
pnpm -F @zkqes/<pkg> test
pnpm -F @zkqes/<pkg> typecheck
pnpm -F @zkqes/<pkg> build
```

For contracts:

```bash
cd packages/contracts && forge test -vv
```

(Note: `forge test` from main checkout currently fails on a pre-existing `remappings.txt` / OZ-submodule layout drift — see task #65. Until fixed, `forge test` is canonical from the contracts worktree.)

For circuits (slow — 10+ min full run):

```bash
pnpm -F @zkqes/circuits test
```

Inspect the commit diff manually for:
- Out-of-scope edits (worker touched another package).
- Accidental secret inclusion (grep commit for `0x[a-f0-9]{64}` patterns, `.env`, `.p7s`).
- Interface-contract drift (any change to files matching orchestration §2 — hard stop, message worker to revert).

## Deployment

- **Sepolia**: `forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $ETHERSCAN_KEY`. Admin key from root `.env`.
- **Web hosting**: GH Pages for the landing target at `zkqes.org` root (workflow `pages.yml`). The app target at `app.zkqes.org` is a separate deploy gated on Sepolia E2E §9.4 — host TBD (likely Cloudflare Pages or Vercel for SPA-friendly redirects).

Pre-deploy checklist:
- [ ] All CI green (`pnpm test` + `forge test` + e2e).
- [ ] Admin address funded on target chain (`cast balance $ADMIN_ADDRESS --rpc-url $SEPOLIA_RPC_URL`).
- [ ] Anvil dry-run against the deploy script.
- [ ] Tag the release commit.

Post-deploy:
- [ ] Update `fixtures/contracts/sepolia.json` with new addresses.
- [ ] Pump to consumer worktrees.
- [ ] Verify contracts on Etherscan.

## Communication patterns

- **SendMessage** for every greenlight, question, or task dispatch to a worker. Plain-text output from the lead is invisible to workers.
- **Never respawn** a worker with a new Agent call mid-phase — you lose all their context. Compact instead.
- **Broadcast (`to: "*"`) is expensive** — use only for interface-contract changes or phase boundaries, not routine updates.
- Acknowledge every worker commit in one sentence so the activity log stays coherent for future sessions.

## When a worker is blocked

1. Worker marks their task blocked + messages lead.
2. Lead identifies the upstream dependency.
3. If it's lead-side (supply fixture, approve interface change): unblock directly.
4. If it's cross-worker: either pump the artifact from the other worker, or re-sequence the blocked worker onto an independent task while the upstream finishes.
5. Never let a blocked worker sit idle without a redirect. Their context cost is accruing whether they're working or not.

## Red flags from worker output

- **"I'll commit the whole thing in one shot"** for a >1000-line change. Demand a split into 2–4 reviewable commits. This came up on circuits T9a; splitting into 9a.1–9a.4 was the right call.
- **Silent scope expansion** — worker touches a file outside their package. Revert immediately.
- **Missing tests** on a feature commit — every task in every plan has a test step. No exceptions.
- **Regenerating a frozen fixture** (KAT vectors, trusted-cas Merkle root in a specific test). These are checked in deliberately; updating them breaks cross-worker consistency.

## When the user asks ambiguous orchestration questions

Default answers that have been validated in session:
- "Deploy first, then dispatch next phase" — sequential gates protect against half-finished state entering downstream assumptions.
- "Compact before next phase if context > 100k" — codified in orchestration §S6b.
- "Plan before implementation" — every phase goes through brainstorming → spec → plans → dispatch, even "simple" ones.
- "Real fixtures over synthetic whenever possible" — the real Diia .p7s caught leaf-only-CMS shape divergence that synthetic fixtures hid.

## ProtocolBytes invariant (V6.1)

A small set of string literals in the codebase begin with `qkb-` and are NOT branding — they are protocol-internal byte strings hashed (keccak256 / SHA-256 / Poseidon) into circuit publics, contract storage, or off-chain deterministically-derived values. The full list is in `docs/superpowers/specs/2026-05-03-zkqes-rename-design.md` §3. Each occurrence in code carries a `// frozen protocol byte string; see specs/2026-05-03-zkqes-rename-design.md §3` comment. **Do not rename these in any future amendment**; new domain-separation tags in new amendments use the `zkqes-` prefix from the start.

## Country identifier privacy — onboarding discipline

Spec: `docs/superpowers/specs/2026-05-09-country-identifier-privacy-guideline.md` (authoritative).

Every country onboarding goes through an explicit identifier-exposure review and lands in one of four buckets. The bucket determines what privacy claim is honest in product copy, code comments, and spec text — and gates whether we ship now, ship per-QTSP, or defer.

| Bucket | Definition | Honest privacy claim | Examples |
|---|---|---|---|
| **A** | Operationally public / readily enumerable identifier | Stable uniqueness anchor is **not secret**; deterministic public hash is dictionary-attackable | UA FOP / business-adjacent flows |
| **B** | Protected personal identifier, but low-entropy | Anchor is **not operationally public** but **not cryptographically private** if exposed deterministically | DE `IdNr`, FR `NIR` / numéro fiscal, PL `PESEL`, IT `codice fiscale` |
| **C** | Separate public business identifier alongside personal one | Cert may expose either; review per-cert before claiming | DE `W-IdNr`, IT `partita IVA`, BE enterprise number |
| **D** | Sector-pseudonymous (hidden base + per-sector derived ID) | Genuine pseudonymization at the protocol level | AT `Stammzahl` → `bPK` |

**Country scope is per-country at the contract level, not at runtime.** The country identifier is baked into the contract name (e.g., `ZKQESRegistryUA`, future `ZKQESRegistryDE`), not a constructor argument. This means:
- No country-tag public signal needed in the circuit.
- No runtime country dispatch in the registry.
- Per-country deploy script + per-country trust-list root + per-country bucket classification.
- `ZkqesRegistryV5_5` (algorithm-agnostic, country-blind) is the **template** to be forked per-country (`ZKQESRegistryV5_5_UA`, `ZKQESRegistryV5_5_DE`, …).

**Forbidden language** in code, copy, or spec (per spec §3.2):
- "anonymous stable identifier"
- "private tax-ID hash"
- "pseudonym" — unless the country lands in Bucket D
- "tax ID is public" / "enumerated tax ID" — both wrong as protocol-wide assertions

**Required language** (per spec §3.1):
- "country-scoped uniqueness"
- "certified uniqueness from state-issued identity data"
- "limited privacy for the stable dedup key" (in Buckets A/B/C)
- "self-contained certified uniqueness"

**Onboarding checklist** (per spec §6) — required before shipping a new country:
1. Real signed artifact inspected (`.p7s` / signed PDF — not just policy docs).
2. Stable fields classified (person-stable / cert-stable / business-stable / format-unstable).
3. Exposure classified (public / protected-low-entropy / provider-local / sector-pseudonymous).
4. Bucket assigned (A/B/C/D).
5. Written decision: ship now / ship per-QTSP / defer / defer pending hidden-derivation layer.

**Working assumptions today** (spec §8 — refresh on real-sample review):
- **UA**: Bucket A. `identityFingerprint = Poseidon(subjectSerialPacked, FINGERPRINT_DOMAIN)` over a TINUA-prefixed serial is dictionary-attackable; this is the honest characterization, not a privacy bug.
- **AT**: Bucket D conceptually; awaiting cert review before shipping.
- **DE / FR / IT / PL**: assume B/C, NOT A; confirm with real samples before shipping.
- **HU**: unresolved; policy text suggests TINHU-prefixed serial but needs sample.

## Phase status snapshot

Keep a one-line summary current here:

- **V5 protocol** — shipped through V5.4 rollup at tag `v0.5.5-pre-ceremony`. Real-QES validation passes end-to-end against Diia (UA). Phase B trusted setup ceremony recruiting; Sepolia + mainnet gated on ceremony.
- **zkqes structural rename** — in flight on `chore/zkqes-rename-train` per spec `2026-05-03-zkqes-rename-design.md` + plan `2026-05-03-zkqes-rename-orchestration.md`. Full QKB/QIE/Identity-Escrow → zkqes. Tag baseline: `v0.6.0-zkqes-rename`.
- **V5.5 multi-algorithm extension** — **merged to main 2026-05-08** at `ed76fd5` (alongside V5.6). All four worktree branches integrated cleanly: flattener (algorithm-agnostic keyCommit), contracts (KeyCommit + SpkiAlg + HostSig + ZkqesRegistryV5_5 + DeployV5_5), circuits (KeyCommitVar + main circuit + stub ceremony output), web/SDK (V5.5 builder + parity fixture). KEY_COMMIT_DOMAIN = `18645781269818968495274020647839177040876380151358417993861915365514852958754` (frozen, four-language parity). Main circuit: 5,604,710 constraints, 21 public signals. Stub ceremony live-smoked end-to-end on pot23: zkey + Groth16VerifierV5_5Stub.sol + sample proof/public/witness all produced; `groth16 verify: OK`. Post-merge tests: 107 forge + 64 flattener vitest + 252 SDK vitest = 423 green. Phase B real ceremony pending recruitment.
- **V5.6 lost-wallet recovery** — **merged to main 2026-05-08** at `ed76fd5`. v0.2 unified-register design: drop `rotateWallet`, add atomic `registerWithAge`. Spec at `2026-05-08-v5_6-lost-wallet-recovery-amendment.md`. V5.6 cleanup intentionally drops pre-V5.4 contracts/ABIs/test surface (forge: 455 → 107).
- **Country identifier privacy guideline** — spec at `2026-05-09-country-identifier-privacy-guideline.md`. Authoritative for all future country onboarding (see §"Country identifier privacy" above for the bucket model + forbidden/required language). Pending: audit existing user-facing copy (HomeDocument, Step1-4) for forbidden terms; per-country contract naming convention for V5.5 forks.
