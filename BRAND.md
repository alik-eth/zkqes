# Brand

**Date locked:** 2026-05-03 (rename baseline)
**Decision reference:** `docs/superpowers/specs/2026-05-03-zkqes-rename-design.md` + `docs/superpowers/research/2026-05-03-zkqes-rename-analysis.md`

A one-page reference for anyone writing public-facing copy, talks, slides, or third-party documentation about this project. Read once; carry forward.

## Name

**`zkqes`** — lowercase noun, no expansion needed in casual use. Matches the domain (`zkqes.org`) and the descriptor.

When introducing the project to an outside reader who's seeing it for the first time, the two-second descriptor is **"a zero-knowledge proof of a qualified electronic signature"** (the literal expansion of zk-QES, eIDAS-aware audiences will recognize it). After the first use, just `zkqes`.

There is no protocol-vs-project-vs-descriptor split. The repo, the protocol, the website, the package scope, the CLI binary, the contract namespace — all named `zkqes`. One name, one thing.

## What this brand REVERSED

The 2026-05-03 morning lock briefly used a three-tier hierarchy: `QKB` (protocol noun, structurally locked), `zk-QES` (descriptor), `Identity Escrow` (project umbrella). That decision was reversed the same day, on the explicit reasoning that:

- Nothing was actually shipped under the QKB name yet (zero npm publishes, zero contracts deployed, zero ceremony rounds run).
- The three-name split was confusing for a single-thing project.
- The cost of renaming was strictly minimal at this point in the lifecycle.

So the structural rename to a single noun happened before any of those names left the repo. Future readers seeing this section can ignore the prior brand split entirely; it never reached production.

## How to write about the project

**Do:**
- Lead with the single name: "zkqes is a zero-knowledge protocol over qualified electronic signatures."
- Use `zkqes` in install commands, code references, contract addresses, ceremony command paths.
- When invoking an outside reader, expand to "a zero-knowledge proof of a qualified electronic signature (zk-QES)" once at first introduction, then drop the expansion.

**Don't:**
- Don't introduce additional names, sub-brands, or umbrella terms.
- Don't reintroduce "QKB", "Qualified Key Binding", "Identity Escrow", "QIE", or "Qualified Identity Escrow" anywhere in public-facing copy. (The 9 frozen consensus byte strings inside the protocol — see invariant below — are not branding; they're protocol-internal hash inputs that predate the rename.)
- Don't expand `zkqes` in headlines or branding except as one-shot context.

## Frozen consensus bytes (NOT branding)

A small set of string literals inside the codebase begin with `qkb-` and look like brand artifacts but are NOT branding. They are protocol-internal byte strings hashed (keccak256 / SHA-256 / Poseidon) into circuit publics, contract storage, or off-chain deterministically-derived values. Renaming them invalidates the V5 circuit + Phase B ceremony + every existing fixture.

The frozen tags are documented in **`docs/superpowers/specs/2026-05-03-zkqes-rename-design.md` §3** — keep them; never touch. Each occurrence in code carries a freeze comment pointing back at that spec section. If you're writing a new amendment that needs a new domain-separation tag, name it with a `zkqes-` prefix; existing tags stay frozen.

## Domains

The public-facing surface uses three subdomains under `zkqes.org`. Locked 2026-05-03.

| Subdomain | Purpose | Lifecycle |
|---|---|---|
| `zkqes.org` (root) | Pre-ceremony hero + ceremony recruitment CTA + three contribution paths (snarkjs local / VPS / Fly launcher) | Live pre-recruitment; persists post-launch as the project landing |
| `app.zkqes.org` | The actual register flow — `/ua/registerV5` + `/account/rotate`. Hosts the SPA. End users come here only after Phase B ceremony completes + Sepolia E2E §9.4 green | Live post-ceremony |
| `docs.zkqes.org` | VitePress-rendered docs from the `docs/` tree — install instructions, specs, ceremony attestations, SDK reference, this BRAND.md | Live pre-recruitment |
| `prove.zkqes.org` | Ceremony coordinator (R2-backed status feed + manifest hosting) | Live post-DNS migration; bucket name `prove-zkqes-org` |

Old `prove.identityescrow.org` host + `prove-identityescrow-org` R2 bucket remain frozen as a read-only mirror for V3/V4 historical artifacts; new ceremony rounds publish at `prove.zkqes.org`.

The split exists because the three audiences are distinct: ceremony contributors (zkqes.org root), end users registering with their QES (app.zkqes.org, post-launch), and developers / integrators / researchers (docs.zkqes.org). Surfacing all three on one page would mute the call-to-action that matters at the current lifecycle stage.

## Defensive registrations

| Asset | Status | Action |
|---|---|---|
| `zkqes.org` | Live, canonical | Keep — primary public domain |
| `identityescrow.org` | Held (never published a working public surface) | No 301 needed at present; can be added later if any traffic appears |
| `alik-eth/zkqes` (GitHub) | Live | Repo (renamed 2026-05-03 from `identityescroworg`); GitHub auto-redirects the old URL |
| `zkqes.com` | Open call | Recommended defensive buy + 301 → `zkqes.org` |
| `@zkqes` (npm) | Open call — **claim before first publish** | Defensive squat + protocol scope |
| `@qkb` (npm) | Open call (no publishes ever) | No action — names are not used after the rename |

## When this document changes

This brand collapse is intentionally robust to future edits — the ship surface is single-name, the protocol is single-name, the domain is single-name. If founder later decides to introduce a sub-brand (e.g., a separate name for an EVM-native variant or a fork), it should land as a new noun under the same project, not a re-litigation of the three-tier split.

Do not edit this document without founder sign-off.

---

## Visual language

The visual identity is **civic-terminal**: Curve.fi-era panel chrome (beige/grey paper, raised/inset 3D borders, dashed inner frames with floating legends) crossed with Ukraine + EU civic-document signals (four-bar civic stripe, official-form letterhead structure, embossed seals). Pure monospace type. Heavy use of ASCII art.

The aesthetic positions the project as bureaucratic-credible (this is a thing that interfaces with real-world legal trust services under eIDAS and Ukrainian DSP law) AND engineering-credible: the system is built on Groth16/Circom against real eIDAS trust-service infrastructure.

**Date locked:** 2026-05-04 (replaces the prior civic-monumental direction shipped 2026-05-03 in #60). Decision references:
- `docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md` (v1 — landing-only)
- `docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-v2-design.md` (v2 — full surface family)

**Wireframe reference:** Founder-curated Claude Design bundle, variant D ("Curve router · dense"). The marquee + 3-column data-grid layout is the canonical home shape; other surfaces inherit the same chrome grammar at appropriate density.

**Subdomain consistency:** All three subdomains (`zkqes.org`, `docs.zkqes.org`, `app.zkqes.org`) consume the same token layer (`packages/web/src/styles/civic-terminal.css`). Cross-subdomain visual drift is a regression.

## Type stack

| Role | Typeface | Weights | CSS variable |
|---|---|---|---|
| Display (h1, h2, h3, large numerics, brand mark) | VT323 | 400 only | `--display` |
| Body (paragraphs, log lines, form input, button labels, code) | IBM Plex Mono | 400, 500, 600, 700 | `--mono` |

Webfonts loaded via Google Fonts CDN with `font-display: swap`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=VT323&display=swap"
  rel="stylesheet"
  crossorigin
/>
```

`crossorigin` is set on every `<link>` so the browser performs a CORS fetch (matches the server's `Access-Control-Allow-Origin: *` and deduplicates against later font-file CORS requests). `font-display: swap` is encoded in the URL query (`&display=swap`) and produces a brief fallback-font flash on first paint instead of a blocked-render window.

Subresource Integrity hashes are NOT used: Google Fonts does not publish stable hashes for the dynamically-generated CSS (content varies by user-agent). Self-hosting the fonts (which would let us pin SRI) is a follow-up polish pass post-adoption, not load-bearing for the v0.6.x recruitment window.

VT323 size band: 22–72px. Below 22px VT323 renders fuzzy; below 18px do not use VT323 — fall through to `--mono` 600-weight. Body copy constrained to ≤65ch line length to mitigate monospace readability tax.

The prior civic-monumental type stack (EB Garamond + Inter Tight + JetBrains Mono) is deprecated as of 2026-05-04. Existing references in `packages/web/index.html` `<link>` preconnects must be removed **in the same commit that adds VT323 + Plex Mono** — atomic transition, no dead-preconnect window.

## Component grammar

The visual surface is built from a stable set of class-based primitives. These are CSS classes consumed by JSX `className` strings; they are NOT React components by default. If a future broader adoption surfaces a need for component extraction, that's a follow-up.

**Source of truth:** `packages/web/src/styles/civic-terminal.css`. The class namespace is stable; new primitives require a BRAND.md amendment + a corresponding entry in the rebrand spec.

**Token table:** see v1 spec §4.1 for the full CSS-variable reference (`--ct-paper` / `--ct-ink` / `--ua-blue` / `--ua-yellow` / `--eu-blue` / `--eu-gold` / `--ok` / `--warn` / `--err` / `--hilite` + 5 more).

**Primary primitives:**
- `.ct-panel` (solid panel chrome) + `.ct-panel--raised` / `.ct-panel--inset` (3D variants)
- `.ct-field` (dashed inner frame) + `.ct-legend` (floating label)
- `.ct-tab` / `.ct-tab--off` (Curve-era tabs)
- `.ct-btn` + variants (`--primary`, `--ua`, `--eu`, `--ghost`, `--sm`, `--lg`)
- `.ct-civic-stripe` (4-bar UA + EU stripe — decorative, `aria-hidden`)
- `.ct-flag-ua` / `.ct-flag-eu` (16×24 glyphs)
- `.ct-tag` + variants (`--ua` / `--eu` / `--ok` / `--warn` / `--err`)
- `.ct-seal` (rotated 96×96 civic seal)
- `.ct-cert-no` / `.ct-kicker` (cert-number / eyebrow text styles)
- `.ct-ascii` / `.ct-ascii--dense` (ASCII art containers)
- `.ct-log` / `.ct-row` / `.ct-row-h` / `.ct-stack` / `.ct-grid-2` / `.ct-grid-3` (layout helpers)

Adding a new primitive is a BRAND.md amendment + a CSS edit + a spec entry.

## Surface grammar (v2 amendment, 2026-05-04)

The civic-terminal grammar applies across four user-facing surface families. Each family has a fixed body shape; the chrome (marquee + footer ribbon) is shared.

| Surface family       | Body shape                                       | Why                                                                |
|----------------------|--------------------------------------------------|--------------------------------------------------------------------|
| Landing              | 3-col shell (variant D)                          | gateway feel; multiple peripheral concerns visible at once         |
| `/ceremony`          | 3-col shell                                      | data-rich dashboard; chain + recruit-cards + verify-widget cleanly split |
| `/register`          | single long form (max-width 720px, 6 sections)   | 6-step flow needs reading-order; columns would compete for attention |
| `/account/rotate`    | single long form (max-width 720px, 3 sections)   | symmetric with `/register`; reused for visual consistency          |
| `/verify`            | 3-col shell                                      | inspector/explorer (paste + result); siblings with `/ceremony`     |

Body shapes are immutable per surface family. Token grammar (palette, type, `.ct-*` primitives) is consistent across all surfaces. Only the body layout differs.

### Phase-LED states

The marquee phase indicator uses a coloured LED + text:

| Phase           | LED color  | Text          |
|-----------------|------------|---------------|
| `recruiting`    | yellow ●   | recruiting    |
| `ceremony-live` | green ●    | ceremony-live |
| `live`          | blue ●     | live          |

The LED has `aria-label="phase: <phase>"` so the colour is informational, not decorative. `prefers-reduced-motion: reduce` replaces the pulse animation with a static dot.

### Footer ribbon

`{BUILD_SHA_7} · {BUILD_DATE} · zkqes.org` — locked 2026-05-04. Build-time `VITE_BUILD_SHA` (7-char SHA) + `VITE_BUILD_DATE` (ISO date) env vars. Renders on every surface family.

### Frozen marketer-locked copy

These strings are NOT to be rephrased. Lifted into code as-is from v1 spec §3 + v2 spec §3 / §4.

| Surface           | Element                          | Copy                                                                                                                                  |
|-------------------|----------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| Landing           | Binding-statement preview        | "Holders sign a binding statement that names a wallet, and prove the signature in zk — without disclosing it."                       |
| Landing           | Marquee count, recruiting        | `round 0 of {TOTAL}` — or `round — of —` if `totalRounds === 0` (HN-screenshot mitigation)                                            |
| Landing           | Disabled-tab tooltip             | `Available after trusted setup ceremony + Base Sepolia testnet deploy`                                                                |
| Landing           | Marquee right sidebar, recruiting| `awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)`                                                             |
| `/ceremony`       | Coord attribution                | `COORD: alik.eth · DM for round assignment`                                                                                           |
| App routes        | PreviewModeBanner                | `PREVIEW MODE — ceremony in progress · verifications use stub verifier · proofs are NOT trusted for production`                       |

Marketer reviews any new public-facing copy before lock. The v2 spec PR has the marketer review trail.
