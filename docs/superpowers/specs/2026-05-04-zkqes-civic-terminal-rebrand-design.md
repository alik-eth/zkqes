# zkqes civic-terminal rebrand — design spec

**Date:** 2026-05-04
**Status:** draft, marketer-review-pending, lead-review-pending
**Wireframe bundle reference:** `/tmp/zkqes-design/zk-qes-3/` (Claude Design handoff, decompressed; the 326-line `civic-terminal.css` token layer + 15 wireframe artboards across 5 surfaces)
**Founder direction reference:** 2026-05-04 thread — variant D selected; full rebrand · replace · amend
**Prior visual baseline:** civic-monumental (`#60` LandingHero, `--bone` / `--ink` / `--sovereign` / `--seal`, EB Garamond + Inter Tight)
**Prior prototype (superseded by lead, retained as reference):** `feat/v5_3-zkqes-d-prototype @ c242778` — gated `?variant=civic-terminal` opt-in route, will not ship
**Orchestration plan:** TBD — `2026-05-04-zkqes-civic-terminal-orchestration.md` (lands after this spec locks)
**Per-worker plan (web):** TBD — `2026-05-04-zkqes-civic-terminal-web.md` (lands after orchestration plan)
**BRAND.md amendment commit:** TBD — `chore/brand-civic-terminal` from main, founder-reviewed in isolation; **gate** for landing/docs implementation branches

## 0. Goal (one sentence)

Replace the civic-monumental visual identity (EB Garamond + bone/ink/sovereign/seal palette, currently shipped at `zkqes.org` via `LandingHero`) with the civic-terminal direction (Curve.fi-era panel chrome × UA + EU civic-document × pure monospace VT323/IBM Plex Mono) across all three subdomains, sequenced BRAND.md → landing → docs → app.

## 1. Locked decisions (founder confirmed 2026-05-04)

| Q | Decision | Implication |
|---|---|---|
| **Q1** | **Variant D ("Curve router · dense")** as the home shape | Marquee status bar + 3-column 260/1fr/260 (prereqs / binding statement / attestation chain). Heavy chrome, terminal-density data layout. |
| **Q2** | **Full rebrand** across landing + docs.zkqes.org + (post-§9.4) app.zkqes.org | All three subdomains carry the same token layer + grammar. Brand fragmentation across surfaces is rejected. |
| **Q3** | **Replace `LandingHero`** outright (no A/B layer) | The `?variant=civic-terminal` flag prototype shipped at `c242778` is **superseded** per lead 2026-05-04. Implementation branches replace `LandingHero` directly. The prototype branch may be deleted at lead's discretion or kept as a frozen reference. |
| **Q4** | **Amend BRAND.md** before any implementation | Token table + component grammar lock in `BRAND.md` before code consumes them. Three sections added (Visual Language, Type Stack, Component Grammar); no existing sections rewritten. Founder reviews the amendment in isolation. |

## 2. Surface inventory

| Surface | Domain | Build target | Hosting | Scope this rebrand | Implementation cost |
|---|---|---|---|---|---|
| Landing | `zkqes.org` | `VITE_TARGET=landing` | GH Pages, `pages.yml` | Replace `LandingHero` with `CivicTerminalLanding`; preserve all current routes (`/ceremony`, `/ceremony/contribute`, etc.); pre-launch empty-states for the marquee + ledger + tabs (see §3) | ~3-4 days web-eng |
| Docs | `docs.zkqes.org` | VitePress | GH Pages branch (`gh-pages-docs`, `pages-docs.yml`) | Rewrite `docs/.vitepress/theme/custom.css` to rebind `--vp-c-*` tokens against civic-terminal palette; webfont swap (EB Garamond → VT323 + IBM Plex Mono); nav/sidebar treatment to mirror landing's `.ct-tab` grammar | ~2 days web-eng |
| App | `app.zkqes.org` | `VITE_TARGET=app` | TBD post-§9.4 (Cloudflare Pages or Vercel candidates) | Full register / rotate / verify / account / escrow flow port onto `.ct-panel` / `.ct-field` / `.ct-tab` / `.ct-btn--primary` grammar; ~30 React components touched | ~3-5 days web-eng (deferred; **gated on Sepolia §9.4 / `#18`**) |

**Out of scope (regardless of subdomain):**
- VS Code / IntelliJ extension UI (no extension exists)
- README / changelog visual treatment (markdown rendering, GitHub-side; out of brand control)
- Email templates (no email surface in current product)
- Marketing collateral PDFs / X-thread / HN-launch graphics (handled by marketer; spec calls out the token reference path so marketer can pull tokens for any visual deliverables)
- Any backend service UI (no admin dashboards exist; ceremony coordinator is markdown + status JSON)

## 3. Pre-launch adaptation

The wireframe bundle was designed as POST-launch UI: marquee shows "round 2/3 · provers online: 12 · ● live", right column shows recent **bindings** (i.e., users who have already registered onchain), middle-column tabs (Register / Rotate / Verify) are active. We are pre-launch: no ceremony rounds run, no bindings exist, register flow blocked on §9.4. Adapt copy + data sources without touching chrome.

### 3.1. Marquee status bar

Current wireframe:
```
▣ ZKQES.ROUTER · round 2/3 · provers online: 12 · ● live · net: BASE-SEPOLIA · gas: 0.04 gwei
```

Pre-launch adapted form:
```
▣ ZKQES.ROUTER · round {N} of {TOTAL} · {STATE} · net: BASE-SEPOLIA · phase: {PHASE}
```

Bindings:
- `{N}` ← `status.round` from `prove.zkqes.org/ceremony/status.json`. Defaults to `0` when feed is unreachable or pre-feed-publication.
- `{TOTAL}` ← `status.totalRounds`. Phase B is currently scoped to **5–10 contributors** (per task `#8`, `circuits §11`); the canonical number is set when the ceremony coordinator publishes the first status JSON. Render literally what the feed says; do not hardcode.
- `{STATE}` ← derived from `status` via `lib/ceremonyStatus.ts::deriveCeremonyState()`:
  - `planned` → `recruiting` (yellow dot, `var(--ua-yellow)`)
  - `in-progress` → `● live` (green dot, `var(--ok)`)
  - `complete` → `complete` (green dot, `var(--ok)`)
  - feed unreachable → `recruiting` (yellow dot)
- `{PHASE}` ← static, two values:
  - `pre-ceremony` (current): no contributors have completed a round
  - `phase-b-live`: at least one contributor in chain
  - `pre-launch` (post-ceremony, pre-§9.4): final zkey published but Sepolia E2E `#18` not yet green
  - `live` (post-§9.4): register flow open

The phase tag is derived in code: `pre-ceremony` if `status.contributors.length === 0`; `phase-b-live` if `> 0` and `status.finalZkeySha256 === null`; `pre-launch` if `finalZkeySha256 !== null` and §9.4 not green; `live` after §9.4. The §9.4-green check reads from a build-time env var (e.g., `VITE_SEPOLIA_E2E_GREEN=1`) or a runtime probe of the deployed `app.zkqes.org`; spec calls for build-time for simplicity.

The "gas: 0.04 gwei" segment from the wireframe is **dropped** — gas reads need an RPC subscription and add wallet-stack dependencies the landing build deliberately excludes. Replaced with `phase: {PHASE}`. If founder later wants gas-on-landing, that's a follow-up that brings in a server-side gas oracle (cheap; no wallet-stack import needed).

### 3.2. Three-column body

| Column | Wireframe (post-launch) | Pre-launch adaptation |
|---|---|---|
| LEFT 260px | "YOU WILL NEED" + "PROVER MODE" radios | Same prereq list (Diia + EU QTSP + Base wallet + ≥38GB RAM); `PROVER MODE` radios deferred — radios imply choosing a prover for the active register flow, which is disabled. Replace with "CONTRIBUTE NOW" CTA panel (recruitment-shaped). |
| MIDDLE 1fr | Tabs (Register / Rotate / Verify) active; BINDING STATEMENT field with editable wallet input + Sign-with-QES CTA | Tabs DISABLED (line-through, opacity 0.5, `cursor: not-allowed`, hover `title="Available after Phase B ceremony + Sepolia §9.4"`); BINDING STATEMENT shows preview copy ("Post-launch, holders will sign…") with PRE-LAUNCH `ct-tag--warn`; ASCII pipeline below. |
| RIGHT 260px | "RECENT BINDINGS" log: timestamp / country / wallet / ✓ rows | "CEREMONY ATTESTATIONS" log: round / contributor / truncated attestation / ✓ rows. Source: `prove.zkqes.org/ceremony/status.json` `contributors[]`. Empty-state: "awaiting first contributor (10 needed · 32 GB RAM each)". |

### 3.3. CTAs

Pre-launch routes the user toward the only meaningful action available: ceremony contribution, then docs reading. Post-launch flips to register entry.

| CTA | Pre-launch target | Post-launch target |
|---|---|---|
| Primary green button | `/ceremony` ("▶ Help with the ceremony") | (unchanged from wireframe) "Sign with QES ▸" → register flow |
| Secondary | `https://docs.zkqes.org` ("Read the docs ▸") | `/verify` ("▶ Open verifier") |

### 3.4. Post-launch flip

When `#18` Sepolia E2E §9.4 clears + Phase B ceremony completes, **one follow-up commit** swaps the pre-launch state for the wireframe's post-launch state:

- Re-enable Register / Rotate / Verify tabs (remove `DisabledTab` styling, point to actual route components)
- Swap BINDING STATEMENT preview → live form (editable wallet input + Sign-with-QES CTA)
- Rename right column "CEREMONY ATTESTATIONS" → "RECENT BINDINGS"; data source switches from status feed → on-chain event subscription (subscribed to `ZkqesRegistryV5_2.BindingRegistered` event via wagmi or viem)
- Change marquee phase tag from `pre-launch` → `live`

The post-launch flip is itself a per-worker plan amendment that lands AFTER the rebrand spec is locked + implemented. It does not block the pre-launch shipping.

## 4. Token grammar

The civic-terminal CSS is **lifted verbatim** from the wireframe bundle — `/tmp/zkqes-design/zk-qes-3/project/civic-terminal.css`, 326 lines, ported to `packages/web/src/styles/civic-terminal.css` with no token-layer refactor in this pass (per lead 2026-05-04). If broader adoption surfaces a need for refactor (e.g., a token rename for clarity, or splitting into `tokens.css` + `components.css`), that's a follow-up commit AFTER all three surfaces ship.

### 4.1. Token table (CSS variables)

Locked. Don't introduce new tokens without amending this spec.

| Token | Value | Role |
|---|---|---|
| `--ct-paper` | `#d8d4c4` | Primary panel fill (Curve-era beige/grey) |
| `--ct-paper-2` | `#e6e2d2` | Lighter inset / secondary panel fill |
| `--ct-paper-3` | `#c8c4b4` | Darker outer / panel hover state |
| `--ct-ink` | `#1a1a1a` | Primary text + frame border |
| `--ct-ink-2` | `#3a352c` | Secondary ink (hover state body text) |
| `--ct-mute` | `#6b6558` | Muted body text + dashed-rule subtle |
| `--ct-mute-2` | `#8a8273` | Tertiary mute (form labels, dim metadata) |
| `--ct-rule` | `#1a1a1a` | Solid rule + frame border |
| `--ct-rule-soft` | `rgba(26,26,26,.35)` | Dashed-rule + log-row separator |
| `--ua-blue` | `#0057B7` | Ukrainian flag blue, primary civic accent |
| `--ua-yellow` | `#FFD700` | Ukrainian flag yellow, primary civic accent |
| `--eu-blue` | `#003399` | EU flag blue, secondary civic accent |
| `--eu-gold` | `#FFCC00` | EU stars gold, secondary civic accent |
| `--ok` | `#2e7d32` | Success state (✓ marks, "live" dot, ok tags) |
| `--warn` | `#b8860b` | Warn state (PRE-LAUNCH tag, attention surfaces) |
| `--err` | `#b00020` | Error state (failed-attestation marks, error tags) |
| `--hilite` | `#2f4a8a` | Curve-era selection blue (active tabs, focused inputs) |
| `--hilite-text` | `#f5f1e2` | Text on `--hilite` background |

The civic-monumental palette (`--bone` / `--ink` / `--sovereign` / `--seal`) is **deprecated** post-amendment. Existing usages across `index.css` + `LandingHero.tsx` + `DocumentFooter.tsx` + `routes/index.tsx::AppRegisterLanding` get migrated as part of the landing implementation. The deprecation is total — no parallel-token-layer compatibility shim.

### 4.2. Type stack (CSS custom properties)

| Custom property | Value | Use case |
|---|---|---|
| `--mono` | `'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace` | All body text, code, log lines, form input, button labels |
| `--display` | `'VT323', 'IBM Plex Mono', monospace` | Display headings (`<h1>`, `<h2>`, large numerics) |

Webfonts loaded via Google Fonts CSS @import in `civic-terminal.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=VT323&display=swap');
```

Implementation note: the existing landing build also @imports EB Garamond + Inter Tight. Post-rebrand both become unused; remove from `index.html` `<link rel="preconnect">` and any preload tags simultaneously with the landing implementation. Deferred webfonts (Inter Tight `wght@400;500;600`) carry meaningful CWV cost — removing saves ~30-50 KB initial load.

### 4.3. Component grammar (the `.ct-*` namespace)

Component primitives (~12 named classes) listed below. The HTML is plain DOM elements with `className` strings; no React abstraction layer is mandated. If we extract to a `components/civic-terminal/` shared library after broader adoption, it's a follow-up.

| Class | Role | HTML structure example |
|---|---|---|
| `.ct` | Base utility — sets `--mono` font, `--ct-fs` size, `--ct-ink` color, `--ct-paper` background. Wraps the page root. | `<div className="ct ct-page">…</div>` |
| `.ct-page` | Full-page background fill + min-height. | `<div className="ct ct-page">` |
| `.ct-panel` | Solid border container, panel chrome. | `<div className="ct-panel">…</div>` |
| `.ct-panel--raised` | 3D raised chrome (`white-top + dark-bottom 1.5px borders + 1px outline`). | `<div className="ct-panel ct-panel--raised">` |
| `.ct-panel--inset` | 3D inset chrome (inverse of raised). | `<div className="ct-panel ct-panel--inset">` |
| `.ct-field` | Dashed inner frame with floating `.ct-legend`. | `<div className="ct-field"><span className="ct-legend">LEGEND</span>…</div>` |
| `.ct-tab` | Curve dark-blue tab (active). | `<span className="ct-tab">Register</span>` |
| `.ct-tab--off` | Inactive/disabled tab. | `<span className="ct-tab ct-tab--off">…</span>` |
| `.ct-btn` | Default button with raised chrome. | `<button className="ct-btn">…</button>` |
| `.ct-btn--primary` | Curve "green Sell" primary button (`#6cd960`). | `<button className="ct-btn ct-btn--primary">…</button>` |
| `.ct-btn--ua` | UA-yellow background, UA-blue text. | `<button className="ct-btn ct-btn--ua">…</button>` |
| `.ct-btn--eu` | EU-blue background, EU-gold text. | `<button className="ct-btn ct-btn--eu">…</button>` |
| `.ct-btn--ghost` | Transparent background, ink border. | `<button className="ct-btn ct-btn--ghost">…</button>` |
| `.ct-btn--sm` / `--lg` | Size modifiers (11px / 16px font). | `<button className="ct-btn ct-btn--lg">…</button>` |
| `.ct-input` | Form input with `--hilite` background + `--hilite-text` (Curve-era selection-color form fill). | `<input className="ct-input" />` |
| `.ct-input--paper` | Paper-background variant of `.ct-input`. | `<input className="ct-input ct-input--paper" />` |
| `.ct-civic-stripe` | Four-bar civic stripe (UA-blue / UA-yellow / EU-blue / EU-gold). | `<div className="ct-civic-stripe"><i/><i/><i/><i/></div>` |
| `.ct-flag-ua` | Ukrainian flag glyph (16×24, two-bar). | `<div className="ct-flag-ua"><i/><i/></div>` |
| `.ct-flag-eu` | EU flag glyph (16×24, blue with `★`). | `<div className="ct-flag-eu">★</div>` |
| `.ct-tag` | Tiny pill / chip (10.5px, uppercase, 0.06em letter-spacing). | `<span className="ct-tag ct-tag--ok">…</span>` |
| `.ct-tag--ua` / `--eu` / `--ok` / `--warn` / `--err` | Color variants. | (combine) |
| `.ct-seal` | 96×96 round civic seal at -6° rotation, `<b>` for bold inner. | `<div className="ct-seal"><div><b>zkQES</b>QUALIFIED · 2026</div></div>` |
| `.ct-row` / `.ct-row-h` / `.ct-grid-2` / `.ct-grid-3` | Layout helpers (vertical rows, horizontal flex, 2-col / 3-col grids). | `<div className="ct-row-h">…</div>` |
| `.ct-stack` | Vertical flex with `var(--ct-gap)` gap. | `<div className="ct-stack">…</div>` |
| `.ct-spacer` | `flex: 1` filler. | `<span className="ct-spacer" />` |
| `.ct-divider` / `.ct-divider--dashed` | Solid / dashed top-border row. | `<div className="ct-divider--dashed" />` |
| `.ct-cert-no` | Cert-number text style (10.5px, 0.12em letter-spacing). | `<span className="ct-cert-no">CERT. NO. ZK·2026·00001</span>` |
| `.ct-kicker` | Eyebrow text (10.5px, 0.18em letter-spacing, uppercase, `--ct-mute`). | `<div className="ct-kicker">…</div>` |
| `.ct-ascii` / `.ct-ascii--dense` | Pre-formatted ASCII art (11px / 9.5px line-height 1.05/1.0). | `<pre className="ct-ascii">…</pre>` |
| `.ct-radio` / `.ct-check` | Form-y bits: `( )` / `(•)` radios; `[ ]` / `[x]` checkboxes (text-based, not native). | `<label className="ct-radio on"><span className="b" /><span>…</span></label>` |
| `.ct-log` | Log-line container (11.5px). With `.t` / `.ok` / `.warn` / `.err` / `.b` modifiers for timestamp / status / bold. | `<div className="ct-log"><div className="ct-row-h"><span className="t">12:04</span>…</div></div>` |
| `.ct-corners` | Decorative `+` glyphs at top-left + bottom-right. | `<div className="ct-corners">…</div>` |
| `.ct-link` | Underlined link, `--ua-blue` color, pointer cursor. | `<a className="ct-link">…</a>` |

### 4.4. Tweak attributes (data-* on `:root`)

The CSS supports three runtime tweak axes via data attrs on `:root`. Implementation includes a default in source (`medium` / `regular`); runtime swap is OPTIONAL for landing/docs but should be wired so future internal-tooling tweaks don't need code edits.

| Attribute | Values | Default | Effect |
|---|---|---|---|
| `data-density` | `dense` / `regular` / `sparse` | `regular` | Padding + gap + base font-size scaling |
| `data-chrome` | `minimal` / `medium` / `thick` | `medium` | Border weight + dashed-stroke pattern |

A third axis from the wireframe (`data-palette` for `blended` / `ua` / `eu` / `bw`) is **dropped from production** — palette is locked to the EU variant per founder direction (already applied in the wireframe via the `palette: 'eu'` default). The blended/ua/bw variants are review-time-only artifacts.

## 5. Accessibility mitigations

VT323 + IBM Plex Mono shifts the type stack from a serif/sans/mono mix to all-monospace. That carries readability + accessibility risk that the wireframe (single-page artboards reviewed in design canvas) doesn't surface but a real shipping landing does.

### 5.1. VT323 size-band caveats

VT323 is a bitmap-style display font. Legible sizes from the wireframe inspection: 22 / 26 / 28 / 36 / 44 / 64px. Below ~18px the bitmap renders fuzzy on most screens. Above ~72px it becomes blocky. Locked usage:

| Tier | Element | px | Token reference |
|---|---|---|---|
| Hero | `<h1>` lead statement | 64 | `font-family: var(--display)` + inline `fontSize: 64` |
| Section | `<h2>` section heading | 36 | `var(--display)` + `fontSize: 36` |
| Subsection | `<h3>` minor heading | 28 | `var(--display)` + `fontSize: 28` |
| Logo | site header brand | 26 | `var(--display)` + `fontSize: 26` |
| Step number | `STEP 01` numeric | 26 | (where used) |

Body text, log lines, form input, button labels: **always `--mono`** (IBM Plex Mono), never VT323. Don't use VT323 below 22px; if a smaller display element is needed, fall through to `--mono` weight 600 with letter-spacing.

### 5.2. Mono-everywhere readability tax

IBM Plex Mono at 13px (the spec's `--ct-fs` regular) is dense for paragraphs of long-form copy. Mitigations:

- **Constrain max-width on body paragraphs to 65ch.** Mono characters are wider than proportional, so 65ch (~520px at 13px) is the comfortable line-length tier.
- **Use `line-height: 1.55`** for paragraph copy (current CSS sets 1.45 globally; bump to 1.55 specifically for `<p>` inside body content; leave 1.45 for compact log/table rows).
- **Break long copy into legend-fielded cards.** The `.ct-field` with `.ct-legend` floating label visually chunks paragraphs into bureaucratic-form chunks; reading 4 lines under a legend is easier than reading 12 lines flat. Reuse aggressively in the docs rebrand especially.
- **Use `--ct-mute` for paragraph copy that's optional reading.** Lower-contrast text reads as "supporting info" and visitors skip past without effort. Critical info stays at `--ct-ink` (full contrast).
- **No paragraphs longer than 4 sentences in landing copy.** Docs paragraphs can be longer (different audience), but landing visitors scan; 4 sentences is the upper bound before cognitive cost spikes.

### 5.3. Contrast checks (WCAG)

Required AA-level contrast ratio for body text: **4.5:1**. AAA is **7:1**. Tested against `--ct-paper` background (#d8d4c4):

| Foreground | Ratio against `#d8d4c4` | WCAG |
|---|---|---|
| `--ct-ink` (#1a1a1a) | **9.83:1** | AAA ✓ |
| `--ct-mute` (#6b6558) | **3.66:1** | AA fail for body; OK for 18px+ large text only |
| `--ua-blue` (#0057B7) on paper | **5.12:1** | AA ✓ |
| `--ok` (#2e7d32) on paper | **3.84:1** | AA fail for body; OK for 18px+ |
| `--warn` (#b8860b) on paper | **2.96:1** | AA FAIL — bump to `--ct-ink` for body text accompanied by `--warn` background |
| `--err` (#b00020) on paper | **6.18:1** | AA ✓ |
| White (`#fff`) on `--hilite` (#2f4a8a) | **8.79:1** | AAA ✓ |
| `--ua-yellow` (#FFD700) on `--ua-blue` (#0057B7) | **6.96:1** | AA ✓ |
| `--eu-gold` (#FFCC00) on `--eu-blue` (#003399) | **9.13:1** | AAA ✓ |

**Hard rules from the contrast audit:**
- `--ct-mute` is only used for ≥18px large text, captions, optional metadata. Never primary body.
- `--ok` (#2e7d32) on paper is only used for ≥18px (large status marks like ✓ at 18px+). Body text status: stick with `--ct-ink` and rely on positional grammar (e.g., the `.ok` modifier on log lines bumps the size to 14px+ and the contrast crosses AA).
- `--warn` (#b8860b) is **never** on `--ct-paper`. The `.ct-tag--warn` background is `#f3e1b3` (which has 17.3:1 against `--ct-ink`), so warn-tagged text uses ink-on-warn-bg.
- Active form input: `--hilite` background (#2f4a8a) with `--hilite-text` (#f5f1e2) — already 8.79:1, AAA. Disabled form input: `--ct-paper-2` (#e6e2d2) background with `--ct-mute` text — 4.21:1, AA at 14px+. Don't render disabled at smaller font.

### 5.4. Keyboard + screen reader

- The disabled tabs (Register / Rotate / Verify) ship with `aria-disabled="true"` and the `title` attribute repeated as `aria-label`. Screen readers announce "Register, dimmed, Available after Phase B ceremony + Sepolia §9.4". Keyboard focus skips them (test: Tab from "Help with the ceremony" should skip directly to "Open verifier", not stop on disabled tabs).
- ASCII art is wrapped in `<pre aria-hidden="true">` — meaningful to sighted users only; the surrounding `<div>` has visible-text descriptions for each pipeline stage as fallback.
- The `.ct-civic-stripe` is `aria-hidden="true"` (decorative).
- The `.ct-flag-ua` and `.ct-flag-eu` glyphs have `title` attributes (`Україна`, `EU`); add explicit `aria-label="Ukrainian flag"` / `aria-label="EU flag"` on render.
- The `.ct-seal` is decorative (`aria-hidden="true"`).
- Marquee status bar: live updates announced via `<div aria-live="polite">`. Don't use `aria-live="assertive"` — round transitions don't need to interrupt screen reader speech.

### 5.5. Reduced-motion

The CSS has no animation currently. If we add any (e.g., a scrolling marquee), wrap the animation in `@media (prefers-reduced-motion: no-preference) { … }` so reduced-motion users get the static state.

## 6. BRAND.md amendment scope

Three new sections appended to `BRAND.md` (between current §5 "Domains" and §6 "Defensive registrations"). No existing sections modified.

### 6.1. New section: "Visual language"

```markdown
## Visual language

The visual identity is **civic-terminal**: Curve.fi-era panel chrome
(beige/grey paper, raised/inset 3D borders, dashed inner frames with
floating legends) crossed with Ukraine + EU civic-document signals
(four-bar civic stripe, official-form letterhead structure,
embossed seals). Pure monospace type. Heavy use of ASCII art.

The aesthetic positions the project as bureaucratic-credible (this
is a thing that interfaces with real-world legal trust services
under eIDAS and Ukrainian DSP law) AND engineering-credible (this
is a thing built by people who understand the substrate).

**Date locked:** 2026-05-04 (replaces the prior civic-monumental
direction shipped 2026-05-03 in #60). Decision reference:
`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md`.

**Wireframe reference:** Founder-curated Claude Design bundle, variant D
("Curve router · dense"). The marquee + 3-column data-grid layout is
the canonical home shape; other surfaces inherit the same chrome
grammar at appropriate density.

**Subdomain consistency:** All three subdomains (`zkqes.org`,
`docs.zkqes.org`, `app.zkqes.org`) consume the same token layer
(`packages/web/src/styles/civic-terminal.css`). Cross-subdomain
visual drift is a regression.
```

### 6.2. New section: "Type stack"

```markdown
## Type stack

| Role | Typeface | Weights | CSS variable |
|---|---|---|---|
| Display (h1, h2, h3, large numerics, brand mark) | VT323 | 400 only | `--display` |
| Body (paragraphs, log lines, form input, button labels, code) | IBM Plex Mono | 400, 500, 600, 700 | `--mono` |

Webfonts loaded via Google Fonts:

```
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=VT323&display=swap');
```

VT323 size band: 22-72px. Below 22px VT323 renders fuzzy; below 18px
do not use VT323 — fall through to `--mono` 600-weight. Body copy
constrained to ≤65ch line length to mitigate monospace readability tax.

The prior civic-monumental type stack (EB Garamond + Inter Tight +
JetBrains Mono) is deprecated as of 2026-05-04. Existing references
in `packages/web/index.html` `<link>` preconnects must be removed
in lockstep with the landing implementation.
```

### 6.3. New section: "Component grammar"

```markdown
## Component grammar

The visual surface is built from a stable set of class-based
primitives. These are CSS classes consumed by JSX className
strings; they are NOT React components by default. If a future
broader adoption surfaces a need for component extraction, that's
a follow-up.

**Source of truth:** `packages/web/src/styles/civic-terminal.css`
(326 lines, lifted verbatim from the founder's Claude Design bundle
on 2026-05-04, reference at
`docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md`
§4.3).

**Token table:** see same spec §4.1 for the full CSS-variable
reference (--ct-paper / --ct-ink / --ua-blue / --ua-yellow /
--eu-blue / --eu-gold / --ok / --warn / --err / --hilite + 5 more).

**Primary primitives:**
- `.ct-panel` (solid panel chrome) + `.ct-panel--raised` /
  `.ct-panel--inset` (3D variants)
- `.ct-field` (dashed inner frame) + `.ct-legend` (floating label)
- `.ct-tab` / `.ct-tab--off` (Curve-era tabs)
- `.ct-btn` + variants (`--primary`, `--ua`, `--eu`, `--ghost`,
  `--sm`, `--lg`)
- `.ct-civic-stripe` (4-bar UA + EU stripe — decorative,
  `aria-hidden`)
- `.ct-flag-ua` / `.ct-flag-eu` (16×24 glyphs)
- `.ct-tag` + variants (--ua / --eu / --ok / --warn / --err)
- `.ct-seal` (rotated 96×96 civic seal)
- `.ct-cert-no` / `.ct-kicker` (cert-number / eyebrow text styles)
- `.ct-ascii` / `.ct-ascii--dense` (ASCII art containers)
- `.ct-log` / `.ct-row` / `.ct-row-h` / `.ct-stack` /
  `.ct-grid-2` / `.ct-grid-3` (layout helpers)

The spec's §4.3 lists the full set with HTML structure examples.
Adding a new primitive is a BRAND.md amendment + a CSS edit + a
spec entry.
```

### 6.4. Insertion point

The three sections insert in `BRAND.md` between current `## Domains` and current `## Defensive registrations`. So new TOC ordering:

1. Name
2. What this brand REVERSED
3. How to write about the project
4. Frozen consensus bytes (NOT branding)
5. Domains
6. **Visual language** (NEW)
7. **Type stack** (NEW)
8. **Component grammar** (NEW)
9. Defensive registrations
10. When this document changes

## 7. Sequencing rationale

Lead 2026-05-04 directive: **sequential** BRAND → landing → docs → app, NOT parallel.

### 7.1. BRAND.md amendment first

Reasons:
- BRAND.md is the source-of-truth for token names, type stack, component grammar. Implementation references it (the per-worker plan cites `BRAND.md §6.1` etc.).
- Founder must approve the amendment in isolation. A combined "BRAND + landing implementation" PR hides the brand pivot in a 600-line React diff and makes future audits harder (`git log --follow BRAND.md` should show the brand changes as discrete events, not embedded in feature commits).

Branch: `chore/brand-civic-terminal` from main. Single commit. Founder reviews + merges. Then landing implementation branches from updated main.

### 7.2. Landing-first beats landing+docs-parallel

Reasons:
- The token layer ports verbatim into `packages/web/src/styles/civic-terminal.css`. Both landing + docs consume that file. If landing implementation surfaces a need for token-layer amendment (e.g., a missing color or a chrome rule that doesn't translate), we learn it once and fix it before docs starts consuming. Parallel = two surfaces racing on possibly-changing tokens = wasted work.
- Landing has more visual variety (variant D's three columns + marquee + ASCII pipeline + ledger) than docs (which is mostly text-on-paper-with-chrome). Landing forces all primitives through their paces; docs is a token consumer with fewer novel uses.
- Landing is the recruitment surface, time-pressured. Docs is reference, not time-pressured. Parallel would slip landing for docs's sake.

Branch: `feat/civic-terminal-landing` from main (post-BRAND-merge). ~3-4 days. Single PR for review.

### 7.3. Docs after landing

Branch: `feat/civic-terminal-docs` from main (post-landing-merge). ~2 days. The `docs/.vitepress/theme/custom.css` rewrite is the bulk of the work — rebind `--vp-c-*` tokens against civic-terminal palette, swap webfonts, mirror landing's `.ct-tab` grammar in nav + sidebar.

### 7.4. App deferred to §9.4

The app rebrand (`VITE_TARGET=app` build, `app.zkqes.org` deploy) ports the same chrome to register / rotate / verify / account / escrow flows. ~30 React components touched. The implementation branch waits for `#18` Sepolia E2E §9.4 to clear — the register flow itself isn't deployable pre-§9.4, so rebranding it now is wasted work (the live URL doesn't exist; visual review can't happen against real app behavior).

The app spec + plan can land NOW, in this same dispatch (§4 of the orchestration plan). Implementation branch waits.

### 7.5. Concurrent with #62 wave-2 + Phase A recruitment

Per lead 2026-05-04: zkqes.org root DNS is live (#62 wave-1 done); rebrand work proceeds in parallel with #62 wave-2 (app + docs subdomain DNS) and founder's Phase A ceremony recruitment. Recruitment does NOT wait for variant D — the protocol pitch carries recruitment, not the chrome.

## 8. Out of scope

- **VS Code / IntelliJ extensions** — none exist
- **README / GitHub-side markdown rendering** — out of brand control (GitHub renders with their CSS)
- **Email templates** — no email surface
- **Marketing PDF / X-thread / HN graphics** — handled by marketer; spec lists the CSS path so marketer can pull tokens
- **Backend admin UIs** — none exist; ceremony coordinator is markdown + JSON
- **Token-layer refactor** — verbatim port for this pass; refactor (e.g., split into `tokens.css` + `components.css`) is a follow-up after all three surfaces ship
- **Component-extraction to React library** — inline JSX with className strings is sufficient; if broader patterns emerge, extract in a follow-up
- **Civic-monumental compatibility shim** — total deprecation, no parallel-token-layer
- **Internationalization of new copy** — UA + EN parity is invariant #2 in `packages/web/CLAUDE.md`. The landing implementation MUST add new keys to both `i18n/en.json` and `i18n/uk.json` in the same commit; this is per-worker plan responsibility, not spec-level.
- **Performance budgets beyond the existing landing build** — landing chunk size baseline is 2.52 MB (per #60); the rebrand should land within +10% (≤2.77 MB). If the implementation surfaces a larger blow-out, surface to lead before merge.

## 9. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| VT323 reads as "ironic / cosplay" not "engineering / civic" | Medium | High | Founder pre-approved variant D from wireframe review; the descriptor copy ("a zero-knowledge proof of a qualified electronic signature") provides the seriousness anchor that the chrome alone might not. Marketer review pass catches if copy doesn't carry. |
| Mono-everywhere body copy reads slow / heavy | High | Medium | Mitigations in §5.2: 65ch max-width, 1.55 line-height for paragraphs, `.ct-field` chunking, `--ct-mute` for optional reading, ≤4-sentence paragraph rule on landing. Real-browser preview during landing implementation surfaces specific paragraphs that need rework. |
| Win98 raised/inset chrome reads as "retro novelty" | Medium | Medium | The chrome subtlety knob is `data-chrome="medium"` (default) — minimal/medium/thick gives founder a runtime dial without a re-implementation. If post-launch user feedback skews "novelty," dial down to `minimal` via a one-line root-attr edit. |
| BRAND.md deprecation invalidates copy in marketer launch drafts | Low | Medium | Marketer review pass on the spec before BRAND.md amendment lands. Copy that uses old palette descriptors gets rewritten in the same wave. |
| `civic-terminal.css` Google Fonts @import slows initial paint | Medium | Low | Google Fonts CDN is a stable + cacheable resource; preconnect tags in `index.html` mitigate connection cost. Alternative: self-host fonts via `vite-plugin-fonts` (~80 KB added to bundle, but eliminates a 3rd-party dependency). Spec defers self-hosting to a follow-up unless founder explicitly asks. |
| Status feed schema drift breaks marquee or attestations | Low | High | `lib/ceremonyStatus.ts` is the consumer + locks the shape (`CeremonyStatusPayload` interface). Admin-script-side respects the same shape (per the existing `// Don't change types here without coordinating` comment). Any feed shape change requires an admin-script + frontend co-edit. |
| `data-chrome` / `data-density` runtime swap is unused → bit-rot | Low | Low | Wire it in production; expose via a hidden URL param `?ctChrome=thick` for internal testing. Founder/lead can dial without a rebuild. |
| App rebrand drifts from landing during the §9.4 wait | Medium | High | App spec + plan land NOW (§7.4), in this dispatch wave. When §9.4 clears, implementation reads the locked plan; visual cohesion is locked at spec time, not implementation time. |
| Pre-launch empty-state copy reads as "broken" not "pre-launch" | Medium | Medium | Explicit "RECRUITING" / "AWAITING FIRST CONTRIBUTOR" copy makes the state legible. PRE-LAUNCH `.ct-tag--warn` on the binding-statement field tells visitors "this isn't broken, this is a known stage." |
| Cached visitors carrying old EB Garamond webfont → flash of unstyled content | Low | Low | First-paint cost is one-time per visitor; caches expire on next dep update. Acceptable. |
| Founder later wants to revert to civic-monumental | Low | High | The full file diff is reversible — `git revert` of the merge commits restores the prior state. Worktree retention strategy: keep the prior branches (`feat/v5_3-zkqes-d-prototype @ c242778`, `chore/civic-terminal-spec @ this`) in repo until founder confirms post-launch. |

## 10. Open questions

- **Q1.** Self-host webfonts vs Google Fonts CDN? Spec defaults to CDN (lower bundle weight, free CDN). Self-hosting is a follow-up if privacy/no-3rd-party-fetch is a brand requirement. **Lead/founder call.**
- **Q2.** Drop EB Garamond + Inter Tight `<link>` preconnects from `packages/web/index.html` in the landing implementation commit, or in a separate cleanup commit? Spec proposes same-commit (atomic, lower diff scatter); revert simplicity favors same-commit too. **Lead call.**
- **Q3.** Should the marquee phase tag (`pre-ceremony` / `phase-b-live` / `pre-launch` / `live`) be founder-chosen copy or my proposal? Spec proposes the four tags above; founder may want tighter copy. **Founder call before BRAND.md lands.**
- **Q4.** Component-extraction trigger: at what surface count do the inline-JSX-with-className primitives get extracted to `components/civic-terminal/`? Spec proposes "after all three surfaces ship + a fourth surface (e.g., extension UI, marketing collateral) emerges." **Defer; revisit post-rebrand.**
- **Q5.** Per `packages/web/CLAUDE.md` invariant #2, all user-visible strings live in `i18n/en.json` + `i18n/uk.json`. Variant D's marquee, legend labels, button labels, ASCII pipeline captions all become i18n keys. **Confirmed scope:** every user-visible string in the new component goes through i18n in the same commit; no English-only landing. Per-worker plan locks the key namespace (proposal: `landing.civicTerminal.*`).
- **Q6.** The wireframe's "Form Revision 04 · May 2026" footer ribbon — keep verbatim, or replace with a project-honest equivalent (e.g., `BUILD SHA · DATE`)? Spec proposes the project-honest variant; bureaucratic-flavor is preserved. **Founder call.**

---

## Acceptance gate (when this spec is "locked")

- [ ] Marketer review pass complete (lead routes; ~30-60 min reviewer time)
- [ ] Founder confirms Q3 + Q6 above (open questions tagged founder-call)
- [ ] Lead confirms Q1 + Q2 (open questions tagged lead-call)
- [ ] Spec committed to main via `chore/civic-terminal-spec` merge

After lock:
- Orchestration plan drafts (`2026-05-04-zkqes-civic-terminal-orchestration.md`)
- Per-worker plan drafts (`2026-05-04-zkqes-civic-terminal-web.md`)
- BRAND.md amendment commit drafts (founder review)
- Implementation dispatch waves W1 (BRAND) → W2 (landing) → W3 (docs) → W4 (app spec/plan only, implementation deferred)

## References

- Wireframe bundle: `/tmp/zkqes-design/zk-qes-3/` (Claude Design handoff, decompressed locally)
- Variant D source: `/tmp/zkqes-design/zk-qes-3/project/home-variants.jsx::HomeD_Marquee` (lines 173-277)
- Token CSS verbatim: `/tmp/zkqes-design/zk-qes-3/project/civic-terminal.css` (326 lines)
- Prior prototype: `feat/v5_3-zkqes-d-prototype @ c242778` (superseded; reference for pre-launch adaptation logic)
- Prior visual baseline (now deprecated): `packages/web/src/components/LandingHero.tsx` (#60), `packages/web/src/index.css` civic-monumental tokens
- Status feed consumer: `packages/web/src/lib/ceremonyStatus.ts`
- Founder direction thread: 2026-05-04 user-DMs to web-eng (variant D · full rebrand · replace · amend)
- Lead dispatch: 2026-05-04 — option (3) brainstorm-spec-plan-implementation, sequential BRAND→landing→docs→app
- BRAND.md current state: 74 lines, 7 sections (no Visual Language / Type Stack / Component Grammar yet)
- `packages/web/CLAUDE.md` V5.21 invariant: VITE_TARGET landing/app slicing
- `packages/web/CLAUDE.md` V5.22 invariant: root-domain GH Pages SPA-fallback (relevant: any change to `dist/index.html` shape from the rebrand needs to keep the workflow's `cp dist/index.html dist/404.html` path working)
