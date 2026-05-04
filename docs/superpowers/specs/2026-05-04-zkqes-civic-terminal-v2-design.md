# zkqes civic-terminal v2 — full surface family design spec

**Date:** 2026-05-04
**Status:** locked, brainstorm complete, lead-drafted
**Lineage:** extends [`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md @ 85bc85e`](2026-05-04-zkqes-civic-terminal-rebrand-design.md) — the v1 spec covered landing + token layer + BRAND.md amendment text. This v2 covers the full user-facing surface family: landing + /ceremony + app(register/rotate/verify), state progression across the recruitment → ceremony → live phases, and the sequencing implications of the founder's testnet-live-before-recruitment constraint.
**Brainstorm session:** founder + lead, 2026-05-04 (~6 questions, Q1–Q5 locked + a sequencing constraint)
**Authoritative for:** /ceremony body design, app route shapes (register/rotate/verify), state progression, JSON schema for `status.json`, sequencing reorder
**NOT authoritative for:** landing body design (v1 spec owns), token grammar / palette / type stack (v1 spec §4–§5 own), BRAND.md amendment text (v1 spec §6 owns)

## 0. Goal

Extend the civic-terminal rebrand from landing-only (v1 spec scope) to the full user-facing surface family. Lock the per-surface body shape, the cross-surface state machine, the pre-recruitment / ceremony-live / post-ceremony transitions, and the JSON schema that drives them. Reorder the critical path so recruitment doesn't fire until everything is live on Sepolia testnet.

## 1. Locked decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| Q1 | Aesthetic direction | civic-terminal, done right (v1 prototype direction, production-grade across all surfaces) |
| Q2 | Surface scope | landing + /ceremony + app(register/rotate/verify); docs.zkqes.org treated mechanically (token rebind); new surfaces (/about, /faq, /research) deferred |
| Q3 | IA / shell pattern | hybrid — shared header/footer chrome on all surfaces, per-surface body shape varies by job |
| Q4 | /ceremony job-to-be-done | live progress feed driven by `status.json`; lead's `publish-status.ts` writes the phase tag, frontend renders accordingly |
| Q5 | /register flow shape | single long form, scrolling document feel; 6 numbered sections separated by `.ct-civic-stripe` rules; no 3-column shell |
| Q6 | /account/rotate flow shape | single long form, same shape as /register, 3 sections (3 sigs); reused for shape consistency |
| Q7 | /verify shape | 3-column variant D shell (it's an inspector/explorer, not a flow); reuses landing/ceremony chrome |
| C1 | Pre-launch app handling | DROPPED — recruitment is gated on testnet-live so /register, /rotate, /verify are always functional. Pre-ceremony they run against a stub verifier; post-ceremony they run against the real verifier. No `<AppPreLaunchPanel>` component needed. |
| C2 | State progression | 3 phases: `recruiting` / `ceremony-live` / `live` (matches v1 spec Q3 lock); same components, content adapts |

## 2. Unifying metaphor

Every page is a *civic-terminal session* for that surface's job. The variant D 3-column shell (marquee at top, body in middle, status sidebar on right, footer ribbon at bottom) is the brand identity. Where the activity is forms-you-fill (/register, /rotate), the shell collapses to a single-column scrolling-document feel — the form needs space to breathe and progressive-disclosure forces the wrong shape on a 6-step flow.

The shell-vs-document split:

| Surface | Shape | Why |
|---|---|---|
| Landing | 3-col shell (variant D) | gateway feel; multiple peripheral concerns visible at once |
| /ceremony | 3-col shell | data-rich dashboard; chain + recruit-cards + verify-widget in three columns |
| /register | single long form | 6-step flow needs reading-order; columns would compete for attention |
| /account/rotate | single long form | symmetric with /register; 3 sections instead of 6 |
| /verify | 3-col shell | inspector/explorer (paste + result); siblings with /ceremony in shape |

Token grammar (palette, type, `.ct-*` primitives) is consistent across all surfaces per v1 spec §4. Only the body layout differs.

## 3. Landing (`zkqes.org/`)

**Reference: v1 spec §3 at 85bc85e.** v2 does NOT change landing's body design — variant D 3-col, marquee, binding-statement preview, ceremony-attestations right sidebar.

What v2 adds for landing: locked state-machine transitions for the marquee + binding-statement + sidebar across the 3 phases.

| Element | Phase: recruiting | Phase: ceremony-live | Phase: live |
|---|---|---|---|
| Marquee LED | yellow ● recruiting | green ● ceremony-live | blue ● live |
| Marquee count | `round 0 of {TOTAL}` (or `round — of —` if total=0) | `round {N} of {TOTAL} · in progress` | `round {TOTAL} of {TOTAL} · complete · audit pending` (post-ceremony, pre-mainnet) or `mainnet live` (post-mainnet) |
| Binding-statement block (middle column) | preview text + PRE-LAUNCH `.ct-tag--warn` (per v1 spec §3.2) | same as recruiting | LIVE link to /register; `.ct-tag--warn` removed |
| Ceremony attestations (right sidebar) | "awaiting first contributor (10 needed · 32 GB RAM each)" — keep verbatim per marketer review | last 7 attested rounds + current-round pulse | full chain + beacon panel |
| Disabled tabs in middle | Register/Rotate/Verify with `Available after trusted setup ceremony + Sepolia testnet deploy` tooltip | same | tabs unlocked, link to /register/rotate/verify |
| Footer ribbon | `{BUILD_SHA_7} · {BUILD_DATE} · zkqes.org` (v1 spec §3.5) | same | same |

The frontend doesn't need to know which phase it's in — it reads `status.json.phase` and renders the corresponding variant. Same component tree, content swaps.

## 4. /ceremony (`zkqes.org/ceremony`)

**Body shape: 3-column shell (260/1fr/260) with role-specific content per column.** Reuses landing's chrome (marquee, footer); body diverges.

### 4.1 Layout

```
┌────────────────────────────────────────────────────┐
│ MARQUEE — same as landing                           │
├──────────┬──────────────────────────┬──────────────┤
│ HOW TO   │ ROUND-BY-ROUND CHAIN     │ INSPECT &    │
│ CONTRIB. │ (primary content)        │ VERIFY       │
│ (260px)  │ (1fr, scroll if long)    │ (260px)      │
│          │                          │              │
│ LOCAL    │ ┌──────────────────────┐ │ paste cell   │
│ CLOUD    │ │ ROUND 1              │ │ ↓            │
│ HETZNER  │ │ alik.eth · 0xdeadbe… │ │ result       │
│          │ │ ✓ verify · 23m ago   │ │              │
│ ────     │ └──────────────────────┘ │ ────         │
│          │                          │              │
│ COORD:   │ ┌──────────────────────┐ │ trust budget │
│ alik.eth │ │ ROUND 2              │ │ 1 of 10 →    │
│          │ │ awaiting contributor │ │ sound        │
│ DM for   │ └──────────────────────┘ │              │
│ round    │ …                        │ ────         │
│ assign   │                          │              │
│          │                          │ FAQ ▼ (3-4)  │
└──────────┴──────────────────────────┴──────────────┘
│ FOOTER RIBBON — same as landing                     │
└────────────────────────────────────────────────────┘
```

### 4.2 Left column — "how to contribute" (always visible)

Three contribution-path cards stacked, tightly:

```
.ct-tag · LOCAL  ─→ 32 GB RAM · ~20 min · $0
.ct-tag · CLOUD  ─→ Fly.io · ~20 min · ~$0.30
.ct-tag · HETZNER ─→ CCX33 · ~20 min · ~€0.06
```

Each links to its cookbook (Fly link → `scripts/ceremony-coord/cookbooks/fly/README.md`; Hetzner link → README's "Help with the ceremony" section; Local link → opens an inline modal with the 4-command snarkjs flow).

Below the cards: `COORD: alik.eth · DM for round assignment` — civic-document-style attribution. Persistent across all phases (recruitment, ceremony-live, post-ceremony) so the page never feels orphaned.

### 4.3 Middle column — round-by-round chain (state-driven)

Primary content. JSON-driven render: each entry in `status.json.rounds[]` becomes a `.ct-panel` row.

**Round states:**
- **Done**: `ROUND {N}` heading, contributor name, attestation hash (truncated to 16 chars + `…`), image digest pin, timestamp, ✓ verify-self button (re-runs `snarkjs zkey verify` against the pumped artifacts in-browser)
- **In progress (current round)**: same heading, `.ct-tag--warn` pulse, contributor name (if known), `ETA: ~{Xm}` from feed, no attestation hash yet
- **Pending (future round)**: outlined placeholder cell, `awaiting contributor` label, no contributor name

Pre-recruitment phase (round 0, total 0): the chain section shows just the recruitment-cards grid (3 paths, large, prominent) instead of placeholder rounds. Once round-zero seeds (round 0 done, total = 10), 10 outlined placeholders render with a `ROUND-ZERO SEED` panel at the top showing the admin-seed contribution.

Post-ceremony phase: chain shows all 10 rounds + a `BEACON APPLIED` panel below with the random-beacon hash and the `verifier deployed at 0x…` link.

### 4.4 Right column — inspect & verify

Top: paste-attestation widget. User pastes a SHA-256 attestation hash; widget verifies the chain by checking that the attestation hashes match the published values in `status.json.contributors[]` and that each round's `attestationSha256` chains correctly into the next. Shows ✓ / ✗ result + which round the attestation belongs to.

**This is chain verification only, not full `snarkjs zkey verify`.** Full verify requires downloading ~2 GB and ~30 GB peak memory — same constraints as ceremony participation, not viable for casual visitors. Visitors who want full proof-of-soundness verification install the `zkqes verify-ceremony` CLI command (deferred to V1.1; the chain verify covers the common-case "is this attestation legitimate" question). Per §12 Q1 below.

Below: cumulative trust budget calc. Renders as a single line: `1 of N honest = sound · current contributors: alik.eth, …`. The math is the n-of-N independence guarantee; the line is just the cardinality + names.

Below: FAQ accordion. 3–4 items: "what's a trusted setup", "why 32 GB RAM", "what does verify do here", "how do I know my entropy was independent". Each accordion item is a `.ct-panel` with a `[+]` toggle.

### 4.5 Empty / null states

- `status.json` unreachable: marquee falls back to `recruiting` + chain section shows the recruitment-cards-only render. Page still functional for outreach; the live data just isn't displayed. Footer ribbon still renders BUILD SHA + DATE so visitors can confirm they're seeing a real deploy.
- Round count is 0/0: marquee shows `round — of —` (per marketer's HN-screenshot mitigation in v1 spec §10c).
- Status field present but unrecognized: marquee falls back to `recruiting` color/copy; log warning client-side; don't fail the render.

## 5. App routes (`app.zkqes.org/{register, account/rotate, verify}`)

App is always live (Sepolia testnet from day 1 of public). Pre-ceremony, the app uses a stub verifier (currently committed at `Groth16VerifierV5_2Stub.sol`); post-ceremony, the real verifier deploys and the app switches over via the contract address in `fixtures/contracts/sepolia.json`. No `<AppPreLaunchPanel>` — the routes work end-to-end from public-launch day.

### 5.0 Device-readiness gate (precedes /register and /rotate)

`<DeviceReadinessGate>` component renders BEFORE Step 01 of /register and /rotate. Acts as a hard gate: until the user satisfies one of the two acceptance paths, the rest of the form stays hidden behind a `.ct-tag--warn` block. Not used by /verify (chain verification only — no prover required).

**Two acceptance paths** (either one unlocks the form):

1. **Supported browser + sufficient RAM**: Firefox ≥120 (64-bit), `navigator.deviceMemory ≥ 8` (heuristic — Chrome's `deviceMemory` caps at 8 GB even on 64 GB machines, so 8 is the highest signal we get; we treat it as "this machine is plausibly large enough"). Chrome / Safari / mobile fail this check (Chrome OOMs on the 38 GB peak; Safari hasn't been tested; mobile is too small).
2. **`zkqes serve` detected at `localhost:9080`**: existing `useCliPresence.ts` hook (per V5.4 work). 500 ms timeout on `GET /status`. If the CLI sidecar is running, this path always wins regardless of browser.

**Component states:**

```
┌─ DEVICE READINESS ─────────────────────────────────┐
│ ◐ checking your device …                            │   (loading, ~500 ms)
└────────────────────────────────────────────────────┘

┌─ DEVICE READY ─────────────────────────────────────┐
│ ✓ Firefox 121 · 16 GB+ RAM detected                 │   (passed via path 1)
│ proving will run in a Web Worker · ~90 s · ~38 GB peak│
└────────────────────────────────────────────────────┘

┌─ DEVICE READY · CLI DETECTED ──────────────────────┐
│ ✓ zkqes serve detected at localhost:9080            │   (passed via path 2)
│ proving will offload to native rapidsnark · ~14 s   │
└────────────────────────────────────────────────────┘

┌─ DEVICE NOT READY · .ct-tag--warn ─────────────────┐
│ This device can't run the prover.                   │   (failed)
│ You have two options:                               │
│                                                     │
│ ┌─ OPTION A · Firefox 64-bit ≥120 with 32 GB RAM ──┐│
│ │ Open this page in Firefox 64-bit on a desktop    ││
│ │ with 32 GB+ RAM. Proving runs in a Web Worker;   ││
│ │ ~90 s wall time, ~38 GB peak memory.             ││
│ │                                                  ││
│ │ Detected: {browser} · {ram}                      ││
│ └──────────────────────────────────────────────────┘│
│                                                     │
│ ┌─ OPTION B · Install zkqes CLI prover ────────────┐│
│ │ Run native rapidsnark locally, browser auto-     ││
│ │ detects it. ~14 s wall time, ~3.7 GB peak.       ││
│ │ Works on any browser.                            ││
│ │                                                  ││
│ │ ▣ npm install -g @zkqes/cli                      ││
│ │ ▣ zkqes serve                                    ││
│ │                                                  ││
│ │ → install instructions (full)                    ││
│ └──────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────┘
```

When in the failed state, the rest of the /register or /rotate form stays gone (don't render Step 01–06 at all — keep the page short). When the user installs `zkqes serve` and reloads, the CLI poll picks it up and the gate flips to the "ready · CLI detected" state. When the user opens the page in Firefox, the browser check passes.

The gate runs once on mount; on `useCliPresence` change (CLI started while user was on the page), the gate re-evaluates and unlocks the form without a reload.

**Copy locked**: the `Detected:` line is critical for debug — shows exactly what the browser reported (`Chrome 130 · 8 GB`, `Safari 17 · unknown`, `Firefox 121 · 16 GB+`). Power users know what to fix; lay users see the install paths.

**i18n**: en + uk. The "Detected: …" technical line stays English (browser/RAM strings); option A/B headings + body translated.

**Out of scope**: heuristic-improvement work — Chrome's `deviceMemory` cap at 8 is a known bug we're not fixing. If a user has 64 GB Chrome and is willing to try, they can install `zkqes serve` to bypass. We don't try to detect actual RAM beyond `deviceMemory`.

### 5.1 /register — single long form

Single column, max-width 720px, centered. **Top of the column: `<DeviceReadinessGate>` from §5.0.** Until passed, no form steps render. **Below the gate (once passed)**: all 6 steps as numbered `.ct-panel` sections separated by `.ct-civic-stripe` rules. No 3-column shell.

```
┌─ Sticky header strip (on scroll) ──────────────────┐
│ STEP {N} of 6 · {step name}                         │
│ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░  {progress bar}              │
└────────────────────────────────────────────────────┘

──── 01. CONNECT WALLET ────────────────────────
[wallet connector cell — RainbowKit]

──── 02. GENERATE BINDING STATEMENT ────────────
[binding statement preview]
[download .qkb.json button]
[next: sign with Diia →]

──── 03. SIGN WITH DIIA QES ────────────────────
[instructions]
[paste the .p7s back here ↓ — out-of-app jump]

──── 04. UPLOAD .P7S ───────────────────────────
[drag-and-drop zone]
[parse + verify status: ✓/✗ with reason]

──── 05. PROVE ─────────────────────────────────
[prover selector — Web Worker / zkqes serve auto-detect]
[live progress: "proving … 23s elapsed · 67s remaining"]

──── 06. REGISTER ──────────────────────────────
[gas estimate]
[register tx button]
[success block: nullifier · attestation · explorer link]
```

The form scrolls top-to-bottom; reading IS the flow. Sections collapse-toggle once complete (showing a one-line summary + edit button). Progressive enhancement: each section gates on the prior section's completion (state in URL hash for refresh-survival). Power users see all 6 steps at once; newcomers follow the sticky strip.

State-machine: stored in `sessionStorage` (per existing pattern in `packages/web/src/lib/session.ts` from V5 work). `step` field tracks the active section; `proof` + `publicSignals` populated post-step-5; `txHash` post-step-6.

### 5.2 /account/rotate — single long form (3 sections)

Same shape as /register: `<DeviceReadinessGate>` from §5.0 at top, gates the rest. Same prover requirement (rotation also requires a fresh proof). Below the gate, 3 sections instead of 6, matching the wallet-rotation flow's actual sigs:

```
──── 01. NEW WALLET HKDF ───────────────────────
[connect new wallet → personal_sign HKDF]

──── 02. OLD WALLET HKDF + ROTATION-AUTH ───────
[connect old wallet → personal_sign rotation-auth (chainId-bound)]

──── 03. REGISTER FROM NEW WALLET ──────────────
[gas estimate]
[register tx button (proves rotation-auth)]
[success block: new wallet bound · old wallet retired]
```

Same sticky header strip (`STEP N of 3`), same `.ct-civic-stripe` separation. Visual symmetry with /register.

### 5.3 /verify — 3-column shell

Variant D shell (matches landing/ceremony chrome).

- **Middle (1fr)**: paste-attestation OR paste-wallet-address widget. Two tabs at the top (`.ct-tab`): "by attestation" / "by wallet". Below: result panel — for attestation, shows which round + contributor + image digest; for wallet, shows `nullifierOf[wallet]` + `identityCommitments[fingerprint]` + `identityWallets[fingerprint]` lookup result with timestamps and the registry contract address. Each row uses civic-document-style labeled-row layout.
- **Left (260px)**: "what does this verify" mini-explainer (3-4 sentences) + link to docs section + link to source code.
- **Right (260px)**: recent-verifications log (browser-local list via `localStorage`, last 10). For repeat users / explorers.

No flow; viewer-only. Pre-ceremony: same shape; verify works against the stub verifier's published attestations (which are minimal but valid). Post-ceremony: same shape, real attestations.

### 5.4 Preview-mode banner (phase ≠ `live`)

When `status.json.phase` is not `live`, all three app routes render a thin top-of-body banner above the route's normal content:

```
┌─────────────────────────────────────────────────────────────┐
│ ◐ PREVIEW MODE — ceremony in progress · verifications use   │
│   stub verifier · proofs are NOT trusted for production     │
└─────────────────────────────────────────────────────────────┘
```

Uses `.ct-tag--warn` styling. Renders within the body, after the marquee, before the form / result panels. Removed entirely when phase = `live` (single React-conditional, ~5 lines). Banner copy is i18n'd (en + uk per existing pattern).

Reason: the app being functional pre-ceremony means visitors CAN sign + prove + register on Sepolia, but the proof's soundness depends on the (not-yet-run) trusted setup. Preview-mode banner makes that explicit.

### 5.5 Mobile collapse for app routes

- /register, /rotate already single-column → unchanged.
- /verify's 3-col collapses: middle becomes the page, left + right become expand-cards below the result.

## 6. Cross-surface concerns

### 6.1 docs (`docs.zkqes.org`) — mechanical only

VitePress as-is. `docs/.vitepress/theme/custom.css` rewrite rebinds `--vp-c-*` tokens against `civic-terminal.css` palette (paper/ink/mute) + UA/EU accents. Webfont swap (EB Garamond → VT323 for headers; Inter Tight → Plex Mono for body/code). Nav + sidebar treatment uses `.ct-tab` grammar for cross-surface consistency. **No layout redesign** — VitePress's content-first IA is right; we just retheme. ~130-line CSS rewrite.

This is web-eng's W3 work per v1 spec §7; v2 doesn't change scope.

### 6.2 Responsive strategy — three breakpoints

- **≥1200px**: full 3-column shell (260/1fr/260) on landing + /ceremony + /verify.
- **800–1199px**: 3-column collapses to 2-column. Left + middle merge into single 1fr column; right sidebar stays at 280px (or moves below as expand-cards if narrower). Marquee + footer chrome unchanged.
- **<800px**: full stack. Marquee → primary content → secondary concerns inline as expand-cards → footer chrome. Register/rotate forms are already single-column so unchanged. Verify's right column (recent-verifications) becomes an expand-card below the result.

VT323 size band locks at all breakpoints (22–72px) per v1 spec §5.1; on mobile we use the lower end of the band.

### 6.3 State progression — 3 phases, one machine

Same components, different content per phase. Single source of truth: `status.json.phase`. Frontend reads, picks the right component variant, renders.

| Phase | Trigger (what writes it) | Effect on landing | Effect on /ceremony | Effect on app |
|---|---|---|---|---|
| **`recruiting`** | `round-zero.ts` writes after seeding round 0 (round=0, totalRounds=10). Phase string set explicitly. | yellow LED, `round 0 of 10`, binding-preview block + warn-tag | recruitment-cards + 10 outlined placeholders + round-zero seed panel | functional against stub verifier; preview-mode banner ("ceremony in progress; verifications use stub key") |
| **`ceremony-live`** | `publish-status.ts --round {N} --commit` for any N≥1 | green LED, `round N of 10`, attestation chain right sidebar populates | chain populates round-by-round; current round pulses | unchanged from `recruiting` |
| **`live`** | manual flip after final-round-beacon ceremony script completes + real verifier deploys | blue LED, `live` (no round count), binding-statement-LIVE link → /register, `.ct-tag--warn` removed | full 10-round chain + beacon panel; recruitment cards collapse | switches to real verifier address; preview-mode banner removed |

The `phase` field in `status.json` is the single switch. Lead controls when transitions happen; frontend never speculates.

### 6.4 Accessibility extension (beyond v1 spec §5)

V1 spec §5 covers landing accessibility. v2 extends:

- **/register sticky header strip** must be `<aria-current="step">`-tagged so screen readers announce `Step 3 of 6` on focus. Progress bar uses `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.
- **Form sections** (`.ct-panel` for each of 01–06) use `<section aria-labelledby="step-N-heading">`; the heading is the section title. Sections collapse-toggle exposes `aria-expanded`.
- **/ceremony chain rows** are `<article aria-labelledby="round-N-heading">` with the round heading inside. Verify-self button is `<button aria-controls="round-N-result-panel">`.
- **/verify result panels** use `<dl>` for labeled-row layouts — labels are `<dt>`, values `<dd>`. Screen readers announce `nullifierOf [value 0x…]` correctly.
- **Phase-LED dot** in marquee uses `aria-label="phase: recruiting"` (or current phase) so screen readers announce it. Color is decorative; phase is text-equivalent.
- **Mobile expand-cards** use native `<details>`/`<summary>`. Free a11y.

Reduced-motion media query (per v1 spec §5.4) extends to the marquee LED pulse: replace pulse animation with static dot when `prefers-reduced-motion: reduce`.

## 7. Data layer

### 7.1 `status.json` schema (extended)

Lives at `prove.zkqes.org/ceremony/status.json`. Read by all three surfaces (landing, /ceremony, app's preview-banner). Written by `scripts/ceremony-coord/scripts/{round-zero,publish-status,finalize}.ts`.

```typescript
interface CeremonyStatusPayload {
  // EXISTING fields (already in scripts/ceremony-coord/src/types.ts)
  round: number;             // last completed round; 0 = round-zero only
  totalRounds: number;       // typically 10
  contributors: Array<{
    round: number;
    name: string;            // e.g. "alik.eth", "PSE-research"
    attestationSha256: string;
    imageDigest: string | null;
    timestamp: string;       // ISO-8601 UTC
  }>;
  startedAt: string;         // ISO-8601, when round-zero seeded
  beacon: {
    applied: boolean;
    sha256: string | null;
    appliedAt: string | null;
  };

  // NEW field (v2 adds)
  phase: 'recruiting' | 'ceremony-live' | 'live';
}
```

The `phase` field is the single user-visible state. Backwards compatibility: frontends that don't know about `phase` derive from `(round === totalRounds && beacon.applied)` → `live`, `(round > 0)` → `ceremony-live`, else `recruiting`. New frontends prefer the explicit field.

### 7.2 `publish-status.ts` updates

Add `--phase {recruiting,ceremony-live,live}` flag. When flag absent, derive from round count + beacon (backwards-compat). When present, override + atomic write.

Phase transitions:
- `round-zero.ts --commit` writes `phase: 'recruiting'` explicitly
- `publish-status.ts --round 1 --commit` (and onwards) writes `phase: 'ceremony-live'` (auto, by round count)
- `finalize.ts --commit` (post-beacon-applied) writes `phase: 'live'` explicitly

Frontend cache: 30s polling on the live URL; HEAD-then-GET via `If-Modified-Since` to avoid full transfers when unchanged.

## 8. Sequencing implications

### 8.1 Recruitment is gated on testnet-live

Founder constraint (locked 2026-05-04 brainstorm): recruitment doesn't start until everything is live on Sepolia testnet. This means:

1. Contracts deploy to Sepolia (with stub verifier).
2. App goes live at `app.zkqes.org` pointing at Sepolia.
3. /ceremony page goes live at `zkqes.org/ceremony` (already up but populated only post-round-zero).
4. Sepolia E2E §9.4 acceptance gate clears.
5. **Founder fires recruitment** (DMs go out).
6. Round-zero seeds (writes `phase: 'recruiting'`); /ceremony populates with 10 placeholder rounds.
7. Round 1 starts; phase auto-transitions to `ceremony-live`.

The pre-recruitment phase (today) has the site up but the founder hasn't fired DMs. Visitors who find the URL early see the `recruiting` state with the recruitment cards in /ceremony — that's fine; passive recruitment is OK.

### 8.2 Critical path reorder

This re-prioritizes contracts-eng's #15 task. **It moves up the critical path.** New ordering:

1. v2 implementation — web-eng builds landing + /ceremony + app surfaces from this spec
2. **#15 contracts-eng — Sepolia deploy with stub verifier** (was gated on Phase B ceremony; now deploys with stub upfront, real verifier post-ceremony)
3. Round-zero seeding — needs r1cs + ptau + admin entropy
4. **#18 Sepolia E2E §9.4 acceptance gate** — verifies the full pipeline end-to-end including /register against stub
5. **Founder fires recruitment** (Phase A outreach DMs)
6. Ceremony rounds 1–10 run; /ceremony populates; phase = `ceremony-live`
7. Final-round beacon + real verifier deploys to Sepolia (replaces stub)
8. Phase = `live`; /register switches to real verifier in `fixtures/contracts/sepolia.json`
9. Mainnet deploy gated on audit + go-live decision

### 8.3 Consequence for the existing task list

- **#15 contracts-eng** — currently described as "Base Sepolia live deploy (GATED on circuits §11)". Update gating note: "deploy with stub verifier upfront; real verifier replaces stub post-ceremony per v2 spec §8.2"
- **#8 Phase B real Phase 2 ceremony** — gated on contracts-eng Sepolia deploy + app deploy (was inverted in earlier sequencing)
- **#17 GH Pages migration** — unchanged; still gated on §9.4
- **#18 Sepolia E2E §9.4 acceptance gate** — moves up the critical path; runs against stub-deployed contract
- **#58 Launch arc drafts** — re-creation gates on phase = `live` (mainnet pre-launch)

Lead updates the task list note for #15 + #18 to reflect this sequencing.

## 9. Out of scope (v2 specifically)

- **Mobile-app port** (web only; iOS/Android Mopro deferred)
- **i18n beyond EN+UK** (already supported per existing pattern; no new languages)
- **Per-user customization of palette/density/lang** (the wireframes' "tweaks panel" — deferred, not productized)
- **Custom theming or theme switching** (light/dark/system — civic-terminal is one theme; deferred)
- **/about, /faq, /research, /grant landing pages** — no design here; can be added later if content needs emerge
- **Blog template** — out of scope; if a blog ships, it lives at `docs.zkqes.org` with VitePress
- **Ceremony attestation viewer for individual rounds** (e.g., `zkqes.org/ceremony/round/3`) — interesting, not yet
- **Any change to BRAND.md amendment text** (v1 spec §6 owns; v2 doesn't reopen)
- **Token grammar evolution** (v1 spec §4 is locked; new primitives require a separate amendment)
- **Real-time event-stream beyond the 30s status.json polling** (no WebSocket; no Server-Sent Events)
- **CLI installation flow** (already lives at `/ua/cli`; not part of this rebrand)

## 10. Acceptance gates

This spec is locked when:
- [x] Brainstorm complete (founder + lead, 2026-05-04)
- [x] Spec drafted (this document)
- [ ] Lead self-review pass (placeholder scan / consistency / scope check)
- [ ] User reviews + locks
- [ ] Marketer review pass (positioning/copy spot-check on /ceremony body copy + /register sticky-strip copy + /verify result copy + state-progression phase labels)
- [ ] Spec merges to main via `chore/civic-terminal-v2-spec`

After lock:
1. **Orchestration plan** drafted at `docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-orchestration.md` — covers per-worker scope (web-eng owns implementation; lead owns BRAND.md amendment + status.json schema bump in ceremony-coord; contracts-eng owns Sepolia stub deploy)
2. **Per-worker plan** drafted for web-eng — bite-sized TDD tasks per surface
3. **BRAND.md amendment** committed by lead (v1 spec §6 text + v2's surface-grammar additions)
4. **Implementation branches** dispatched per orchestration plan

## 11. References

- v1 design spec: [`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md @ 85bc85e`](2026-05-04-zkqes-civic-terminal-rebrand-design.md)
- v1 prototype branch: `feat/v5_3-zkqes-d-prototype @ c242778` (live at `https://zkqes.org/?variant=civic-terminal`)
- BRAND.md (post-amendment, pending): the text lives in v1 spec §6.1–6.3 + §3.5 ready to lift
- Token layer source: `packages/web/src/styles/civic-terminal.css` (lifted verbatim from Claude Design handoff bundle 2026-05-04)
- Ceremony coord: `scripts/ceremony-coord/{src/types.ts,scripts/{round-zero,publish-status,finalize}.ts}`
- README "Help with the ceremony" section — recruitment-page copy that informs /ceremony's left-column path cards
- Wireframe bundle: `/tmp/zkqes-design/{,v2/}zk-qes-3/` (15 artboards across 5 surfaces; reference, not blueprint)

## 12. Open questions / future work

- **Q (defer)**: Should /ceremony's right-column verify widget run the actual `snarkjs zkey verify` in-browser (~5 min, ~30 GB peak — same constraint as ceremony itself), or just verify the attestation hash chain (cheaper, less proof of soundness)? My lean: **chain verification only** in v2 (full snarkjs verify is gated by the same memory constraints as ceremony participation; not viable for casual visitors). Full verify is offered as `zkqes verify-ceremony` CLI command instead. Confirm at implementation time.
- **Q (defer)**: Pre-recruitment public visibility: should the site be discoverable today (passive recruitment via search/HN) or hidden until founder fires? Default: discoverable. Founder can flip a build-flag to hide if desired.
- **Q (defer)**: Mainnet phase — does `live` phase split into `live-sepolia` vs `live-mainnet` for the period both chains are active? Probably yes; addable to the schema later without breaking compat.
