# Web-eng handoff — civic-terminal v3 surface arc, Rotate B resume

**Date:** 2026-05-05
**From:** web-eng (this session, context-fatigued)
**To:** web-eng (next fresh session, you)
**Status:** ▶ **Resume here for Rotate B**

---

## TL;DR

You are mid-arc landing five civic-terminal v3 surfaces. **One done, four to go.**
Pick up at **Rotate B Diagram** (`/account/rotate`) — it's the smallest of the four
remaining and the second-easiest. Do not skim the rotation auth-hash machinery; the
failure mode is silent (passes tests, reverts at chain submit). Read this whole note
before touching code.

## Pin first (before any other tool call)

```bash
git -C /data/Develop/qkb-wt-v5/deploy-web branch --show-current
# expect: feat/deploy-fly-subdomains

git -C /data/Develop/qkb-wt-v5/deploy-web log --oneline -3
# expect HEAD = a584d56 (or later if subsequent commits landed)
```

If the branch is wrong or HEAD is not what you expect, **do not proceed.** The
codex daemon may have hard-reset the branch (this happened once already this arc;
recovery via reflog cherry-pick succeeded — see "Daemon hard-reset playbook" below).

## Worktree topology

| Path | Branch | Purpose |
|------|--------|---------|
| `/data/Develop/identityescroworg` | main | lead's checkout, do **not** edit here |
| `/data/Develop/qkb-wt-v5/deploy-web` | feat/deploy-fly-subdomains | **your home for this arc** |
| `/data/Develop/qkb-wt-v5/web` | feat/multi-qtsp-facade | retired (merged into deploy via `12a3525`); leave alone |

Operate exclusively in `/data/Develop/qkb-wt-v5/deploy-web`. Use absolute paths or
`git -C <abs-path>` — the shell's `cd` does not persist across tool calls.

## The arc — surface landings

Founder pick (2026-05-05) per the Claude Design handoff bundle at
`/tmp/zkqes-design/zk-qes-3/` (extracted from
`https://api.anthropic.com/v1/design/h/SLl7hLmSyQdSbXYGH9YPCA?open_file=zkqes+Wireframes.html`).
Five flagship surfaces, sequenced low-risk → high-risk:

| # | Surface | Route | Wireframe ref | LoC | Status |
|---|---------|-------|---------------|-----|--------|
| 1 | Verify A Lookup | `/verify` | `register-variants.jsx::VerifyA_Lookup` (lines 453–497) | ~190 | ✅ done — `a584d56` |
| 2 | **Rotate B Diagram** | `/account/rotate` | `register-variants.jsx::RotateB_Diagram` (lines 400–449) | ~250 | ▶ **YOU ARE HERE** |
| 3 | Ceremony D Split | `/ceremony` | `ceremony-variants.jsx::CeremonyD_Split` (lines 231–299) | ~400 | pending |
| 4 | Home C Document | `/` (landing-target) | `home-variants.jsx::HomeC_Document` (lines 116–171) | ~500 | dispatch as subagent |
| 5 | Register C Document | `/ua/registerV5` | `register-variants.jsx::RegisterC_Document` (lines 121–346) | ~700+ | dispatch as subagent |

After surface 5 lands, **full gauntlet** (typecheck web+sdk + tests web+sdk + build
landing+app + bundle-size + playwright smoke+chromium) → roll-up to team-lead.

## Rotate B specifics

**Wireframe summary** (`register-variants.jsx::RotateB_Diagram`):
- SiteHeader active="/account"
- h2.ct-display "Rotate a wallet"
- Lede paragraph (rotation = new binding under same nullifier; old wallet inert; chain sees them as unrelated)
- ct-panel with ASCII figure: `OLD WALLET 0x91A2…fE` → nullifier (you) → `NEW WALLET 0x77c4…01`, with "CHAIN view: two unrelated nullifier-uses · NO LINK" framed below
- ct-grid-2: FROM field (existing wallet input, "Mark as inert after rotation" checkbox) | TO field (new wallet input, "Wallet must counter-sign the binding statement" hint)
- Bottom row: Cancel button | "Requires QES re-signature" tag | "Sign rotation with QES" primary CTA

**Adapt to live surface** (existing `routes/account/rotate.tsx` already wires
`RotateWalletFlow` w/ multi-step state machine):
- The wireframe is single-screen flat-layout. Reality is multi-step (connect new
  wallet → verify ownership → re-sign QES → submit). **Do NOT collapse the steps
  into a single screen.** Instead: render the design's chrome (ASCII diagram + civic
  panel framing + dual FROM/TO field layout) as a persistent header/explainer that
  surrounds the existing step machine, and let the steps swap inside.
- The ASCII OLD→nullifier→NEW figure goes above the step machine — explanatory,
  not interactive.
- "FROM" auto-populates from `connectedAddress` (the wallet you're rotating away
  from) — this is the only safe place to read `useAccount().address` directly per
  invariant #10. The existing `useState`-locked `newWalletAddress` is the TO value
  and **must not be replaced**.

### **CRITICAL: Invariant #10 — newWalletAddress is LOCKED at connect step**

From `packages/web/CLAUDE.md`:

> Every later stage must reference the React-state value, never `useAccount().address`
> directly — the user switches between new and old wallets between stages, and
> reading `connectedAddress` would bind the rotation auth payload to whatever wallet
> is connected at that moment (catastrophic — contract reverts `InvalidRotationAuth`).
> The rotation auth hash MUST byte-match contracts-eng `_rotateAuthSig`:
> `keccak256(abi.encodePacked("qkb-rotate-auth-v1", chainId, registry, fingerprint, newWallet))`.

**The unit test at `tests/unit/rotationAuthHash.test.ts` pins this against a
manual byte-level reconstruction; if you touch `computeRotationAuthHash`, keep
that test green and re-run codex against the diff.**

Concretely: when adding the Rotate B chrome, **do not**:
- Wire the "TO" field's display value to `useAccount().address` instead of the
  React-state-locked `newWalletAddress`.
- Re-derive the auth hash inside any new component you add — use the existing
  `computeRotationAuthHash` helper.
- Change the `qkb-` prefix in the auth domain string. That's a ProtocolBytes
  invariant — see the V6.1 ProtocolBytes section in repo-root `CLAUDE.md`.

**Do**:
- Read `tests/unit/rotationAuthHash.test.ts` first; understand the byte-level shape.
- Run that test after every commit during Rotate B.
- Render the existing step-machine UI inside the new chrome. Don't rewrite the steps.

## CSS / primitive availability

`packages/web/src/styles/civic-terminal.css` is byte-identical to the design
bundle's `civic-terminal.css`. All primitives are live:
`.ct-panel` / `--raised` / `--inset`, `.ct-field` (dashed-legend frame),
`.ct-civic-stripe`, `.ct-flag-ua`/`-eu`, `.ct-seal`, `.ct-tab`, `.ct-tag`
variants, `.ct-radio`, `.ct-check`, `.ct-btn` variants, `.ct-display` /
`.ct-mono` headings (VT323 + IBM Plex Mono), `.ct-ascii` / `--dense`.
**Net: no CSS work needed.**

Existing component primitives:
- `<Marquee phase round totalRounds sidebarText />` — top status bar; phase via
  `useCeremonyPhase`, status via `useCeremonyPhase().status?.{round,totalRounds}`,
  fallbacks `'recruiting' / 0 / 1`.
- `<FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />` — bottom strip.
- Build constants pattern: see top of `routes/ua/registerV5.tsx`.

## i18n discipline

`packages/web/src/i18n/{en,uk}.json` must stay key-parity. Test
`tests/unit/i18n-coverage.test.ts` enforces. Add new keys in **both files in the
same commit**, no exceptions. Translate the UK side properly — use the existing
file's translation register (formal civic register, "ви" not "ти", proper
Ukrainian punctuation `«»`).

For Rotate B, expected new keys live under `account.rotate.v3.*` (or whatever
namespace `routes/account/rotate.tsx` already uses — check first, extend
in-place). Verify the i18n parity test passes before committing.

## Mock-data → live-data convention

Per the arc agreement with team-lead: layout / chrome / copy / ASCII / palette
**verbatim**, but mock data strings ("0x91A2…fE", "47 contributors", "1 284
bindings") get replaced with live-source values from the appropriate hook
(`useAccount`, `useReadContract`, `useChainDeployment`, `useCeremonyPhase`).
If live data isn't available in the current pre-launch state, render an empty /
"awaiting" surface — **never** ship the mock string in production.

When the design's data shape doesn't match what's wirable, **flag the gap in the
commit message**: "Design said X, wired Y because Z." Audit-trail discipline.

## Verify A as reference

Commit `a584d56`: `redesign(verify): /verify Verify-A-Lookup civic-terminal v3
surface`. Read it for the established pattern:
- `Marquee` w/ `useCeremonyPhase` fallbacks
- `<main className="ct ct-page">` wrapper
- Centered `maxWidth: 960` content column with `padding: '28px 24px'`
- `Link` back-to-overview with `className="ct-link"`
- `h1.ct-display` heading + lede paragraph
- `ct-panel--inset` for input panels, `.ct-field` for output panels
- `cert-no` minWidth 80 labels (e.g. "QUERY")
- `ct-grid-2` for split panes
- Three-state result rendering (idle / invalid / pre-launch)
- `data-testid="..."` on every interactive element + state-discriminator
- `FooterRibbon` w/ build constants

## Discipline pins

1. **Branch-pin every turn.** Run `git -C /data/Develop/qkb-wt-v5/deploy-web branch --show-current` at turn-open + before each tool block. Codex daemon flips happen.
2. **Commit early/often.** Every uncommitted edit is at-risk for a daemon reset. The window between writing code and committing is the danger zone.
3. **Verify SHA stuck.** After every commit, `git log feat/deploy-fly-subdomains --oneline -1`. If it's not your commit, see "Daemon hard-reset playbook" below.
4. **`SKIP_CODEX_REVIEW=1`** env var when running any codex-adjacent command (see auto-memory `project_codex_daemon_corruption.md`).
5. **Per-commit `<sha>: <subject>` async ping** to team-lead. No greenlight needed between surfaces — only ping if you hit a copy-spec gap or layout decision needing founder/lead input.

## Daemon hard-reset playbook

If you commit, `git log` shows your commit, then a later `git log` shows a
prior commit (your work appears reverted), the codex daemon hard-reset the
branch. Recovery is mechanical:

```bash
# 1. Find the orphaned commit
git -C /data/Develop/qkb-wt-v5/deploy-web reflog | head -10
# Look for "HEAD@{N}: commit: redesign(...)" — that's the orphan

# 2. Cherry-pick it back
git -C /data/Develop/qkb-wt-v5/deploy-web cherry-pick <orphan-sha>
# New SHA, same diff. Update your tracking notes.

# 3. Verify stuck
git -C /data/Develop/qkb-wt-v5/deploy-web log feat/deploy-fly-subdomains --oneline -3
```

This happened mid-Verify-A; original `7b68ae4` orphaned, recovered as `a584d56`.
The cherry-pick was clean (no conflicts) because the daemon's reset only moves
the ref, doesn't touch the commit object — git preserves the orphan in
`refs/stash` or unreachable objects until gc.

## Subagent dispatch (Home C + Register C, after Ceremony D)

Per team-lead's instruction, **after Rotate B + Ceremony D land solo**, dispatch
fresh subagents for the heaviest two surfaces:

- One subagent per surface (not bundled), `superpowers:subagent-driven-development` type
- Brief includes:
  - Path to wireframe in design bundle
  - This handoff note as background reading
  - The five `packages/web/CLAUDE.md` invariants that bite for Register C
    specifically: **#9** (V5.1 walletSecret byte-locked), **#10** (newWalletAddress
    LOCKED at connect step), **#14** (V5.2 drops msgSender from circuit publics),
    **#15** (V5.2 22-field public-signal layout FROZEN), **#20** (V5.3
    subjectSerialOidOffsetInTbs witness emission)
  - QtspScope T13 wiring — **don't touch** that integration; #83 polish task
    tracks deeper coverage
  - `?qtsp=<cc>/<slug>` search-param shape from spec §4.4
  - Per-Article FILE STATE tags + marginalia rail + redacted-name strip layout
  - Mock → live tradeoff convention (mock strings out, empty surface acceptable)
  - The branch-pin discipline + daemon-reset playbook above
  - Per-commit `<sha>: <subject>` ping pattern back to team-lead

Compact your context **before** Home C if the running token count crosses 100k
(per CLAUDE.md "compact don't respawn").

## After all five surfaces land

Full gauntlet from the worktree:

```bash
cd /data/Develop/qkb-wt-v5/deploy-web

# Per-package
pnpm -F @zkqes/web typecheck && pnpm -F @zkqes/web test
pnpm -F @zkqes/sdk typecheck && pnpm -F @zkqes/sdk test

# Build both targets
VITE_TARGET=landing pnpm -F @zkqes/web build
VITE_TARGET=app pnpm -F @zkqes/web build

# Bundle ceiling
pnpm -F @zkqes/web test:bundle-size

# Playwright tiers per #77 CI gate convention
pnpm -F @zkqes/web exec playwright test --project=smoke --project=chromium
```

Then roll-up message to team-lead with the SHA list (one per surface), gauntlet
matrix (✅/❌ per step), bundle-size delta, and any copy-spec gaps you flagged.
Team-lead reviews, merges to main, tags.

## Open trail / context

- Verify A pre-launch state cross-links to `/ceremony/verify` for users with
  attestation hashes today — pattern reusable for Rotate B if you need an empty/
  fallback state ("ceremony not yet live; no rotations possible until §9.4").
- Bundle-size ceiling is 2.85 MB; Verify A landed at ~2.77 MB (no movement
  expected from Rotate B since rotate.tsx is already in the app bundle).
- Tasks #85, #87, #88 are completed (founder-direction + GH-secrets gates
  resolved). The arc you're on is post-merge to main + tag once gauntlet green.
- `feat/deploy-fly-subdomains` parent of `a584d56` is `95b5087`; `95b5087`'s
  parent is `80e65a3`; `80e65a3`'s parent is `3a2ac89` (Base Sepolia wiring).

---

**Resume here.** Read this note → branch-pin → read
`/tmp/zkqes-design/zk-qes-3/project/register-variants.jsx` lines 400–449 →
read `packages/web/src/routes/account/rotate.tsx` end-to-end → read
`tests/unit/rotationAuthHash.test.ts` → land Rotate B with the chrome wrapping
the existing step machine, ASCII diagram above. Ping `<sha>: <subject>` to
team-lead async when committed.
