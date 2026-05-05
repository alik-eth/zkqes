# Multi-QTSP Facade — Design

> Date: 2026-05-05. Status: design target. Scope: UI surface on
> `zkqes.org` + frozen trust-list-ingestion file contract. No circuits,
> no contracts, no ceremony, no per-QTSP deploys.
>
> Builds on:
> - `2026-04-24-per-country-registries-design.md` (per-jurisdiction
>   registry architecture — the chain layer this facade fronts).
> - `2026-05-04-zkqes-civic-terminal-v2-design.md` (Landing surface this
>   spec extends).

## 1. Motivation

The civic-terminal v2 surface positions zkqes as a UA-flavored protocol
because UA/Diia is the only QTSP we have proven end-to-end. The actual
goal is eIDAS-Europe-wide qualified-electronic-signature support. The
gap between "we eventually want all of Europe" and "we ship UA-only"
needs an honest, structured surface that:

1. Lets us claim European breadth without lying about what works today.
2. Gives contributors and partner QTSPs a clear path to add their
   country/QTSP via PR, without having to touch circuits or contracts.
3. Stays safe in the presence of the BER-vs-DER risk surfaced during
   brainstorming — non-strict-DER `.p7s` inputs from any QTSP should
   fail loudly with actionable user copy, not silently produce invalid
   proofs.

This spec freezes the surface + ingestion contract. Per-QTSP chain work
(circuits, ceremony, registry deploy) lands as followup specs as each
QTSP earns promotion.

## 2. Tile model

The unit of support is a **(country, QTSP) pair**, not a country. Each
QTSP is a separate trust anchor with its own intermediate chain,
signing-tool quirks, and parser status. Tiles are labeled
`🇮🇹 Italy / Aruba PEC` rather than `🇮🇹 Italy`. This matches how the
protocol actually treats trust anchors and avoids the dishonest
"country supported" framing where only one of N national QTSPs works.

### 2.1 Four states

| State | Bar | UI affordance |
|---|---|---|
| **bronze** | QTSP publicly documented as ETSI EN 319 411-2 conformant | drawer-only on click; bounty-issue link |
| **silver** | DER-strict confirmed on ≥3 current samples + parser walks the structure | per-QTSP page; "in active integration" badge |
| **gold** | Witness gen + on-chain register succeeds end-to-end on testnet | per-QTSP page; "ready for testnet" CTA |
| **live** | Same as gold + production registry deployed + ceremony output | per-QTSP page; entry to register flow |

Tiles render as distinct civic-terminal chrome variants per state — the
visual progression is part of the credibility surface.

### 2.2 Initial partition is founder-curated

Day-zero state: Diia/UA `gold` (live-on-testnet), a founder-curated
list of bronze QTSPs the founder can defend in conversation, and a
help-wanted bucket for countries we don't have a defensible QTSP claim
for yet. The spec freezes the schema and UI; populating the initial
index is a content commit landing alongside or after this spec.

## 3. Trust-list ingestion contract

### 3.1 Layout

```
fixtures/trust/<cc>/<qtsp-slug>/
├── meta.json              # display, country, QTSP URL, signing-tool, tile state
├── intermediates/         # PEM files, one per active intermediate cert
│   ├── <fingerprint>.pem
│   └── ...
├── trusted-cas.json       # flattened intermediate-cert anchor set (Poseidon-friendly)
├── root.json              # Poseidon Merkle root over trusted-cas.json
└── samples.json           # public-only metadata about real samples (NO .p7s)
```

`<cc>` is ISO 3166-1 alpha-2 lowercase. `<qtsp-slug>` is lowercase ASCII
(`aruba-pec`, `d-trust`, `diia`, `fnmt`). One country directory may
contain multiple QTSP subdirectories.

### 3.2 `meta.json` (frozen)

```jsonc
{
  "country": "IT",                       // ISO 3166-1 alpha-2 uppercase
  "qtspSlug": "aruba-pec",
  "displayName": "Aruba PEC",
  "qtspUrl": "https://www.pec.it/",
  "tslEntry": "https://eidas.ec.europa.eu/efda/...",
  "signingTool": {
    "name": "ArubaSign",
    "url": "https://www.pec.it/firma-digitale.aspx",
    "minVersion": "8.0"                  // optional; null if no constraint
  },
  "state": "silver",                     // "bronze" | "silver" | "gold" | "live"
  "addedAt": "2026-05-12",
  "promotedAt": "2026-05-20",            // null until first promotion
  "lastVerified": "2026-05-20",
  "notes": "..."                         // freeform, surfaces in drawer/page
}
```

Validated at build time via Zod. CI fails on schema drift.

### 3.3 `samples.json` (frozen)

Public-only metadata. **Never the `.p7s` itself** — `.p7s` carries
natural-person legal-identity material per eIDAS Article 3(12) and
the project's gitignore rule. Each entry:

```jsonc
{
  "p7sSha256": "0x…",                    // audit trail, public-safe
  "leafCertNotBefore": "2024-03-12",
  "leafCertNotAfter":  "2026-03-12",
  "parserWalk": "pass",                  // "pass" | "fail-<reason>"
  "derStrict":  "pass",                  // "pass" | "fail-<DerStrictReason>"
  "witnessGen": "n/a",                   // "pass" | "fail-<reason>" | "n/a" (silver)
  "contributor": "@github-handle",
  "addedAt": "2026-05-20"
}
```

A third party asking "what evidence underlies this silver tile?"
inspects `samples.json` and gets a real answer. The `p7sSha256`
fingerprint lets a contributor independently corroborate that the
sample they sent is what's logged.

### 3.4 File-set requirements per state

| State | Required files |
|---|---|
| bronze | `meta.json` only |
| silver | `meta.json`, `intermediates/*.pem`, `samples.json` (≥3 entries; every entry must have both `parserWalk:pass` AND `derStrict:pass`) |
| gold | silver + `trusted-cas.json` + `root.json` + ≥1 `samples.json` entry with `witnessGen:pass` |
| live | gold + per-QTSP registry deploy address (tracked in chain-fixture file, not here) |

### 3.5 Bundling

A Vite plugin (`packages/web/vite/plugin-qtsp-index.ts`) walks
`fixtures/trust/` at build time, parses every `meta.json`, validates
the schema, and emits `src/generated/qtsp-index.ts`:

```ts
export const QTSP_INDEX: ReadonlyArray<QtspMeta> = Object.freeze([
  { country: 'UA', qtspSlug: 'diia', displayName: 'Diia', state: 'live', ... },
  ...
]);
```

The generated file is gitignored; a checked-in snapshot is regenerated
each release for unit tests. `samples.json` and `intermediates/*.pem`
are NOT bundled — served as static assets under
`dist/qtsp-data/<cc>/<qtsp-slug>/` and fetched on demand from the
per-QTSP page.

## 4. Surface integration

### 4.1 Landing extension

A new section between the v2 civic-terminal hero and the existing path
cards:

```
[v2 civic-terminal hero — phase-driven]
[NEW] ── EUROPEAN COVERAGE ──────────────────────────
        Country grid, grouped by ISO region:
          NORDICS   |  CENTRAL EU  |  SOUTHERN EU  |  EASTERN EU
        Each cell = one tile (country, QTSP), state-styled.
        Filter chips: [all] [live] [gold] [silver] [bronze] [help-wanted]
        Anchor: #coverage  →  /countries aliases here
[existing path cards — unchanged]
[existing footer ribbon — unchanged]
```

Hero copy shifts from "zkqes — UA QES" to "zkqes — qualified
electronic signatures across eIDAS Europe." Path cards stay UA-centric
until ≥2 live tiles, then promote to a tile-aware switcher (out of
scope here).

### 4.2 Tile interaction

- **bronze** → drawer slides from right edge: QTSP name, country flag,
  state badge, the `meta.notes` blurb, "Help us verify this QTSP" →
  opens GitHub issue from a per-QTSP template, "Notify me when live" →
  form (writes to `localStorage` for now; out-of-band integration is a
  followup).
- **silver / gold / live** → navigate to `/qtsp/<cc>/<qtsp-slug>`.

### 4.3 Per-QTSP page template

```
/qtsp/it/aruba-pec
├── header strip       — country flag, QTSP display name, state badge,
│                        chain target (Base Sepolia | Base mainnet)
├── about              — qtspUrl link, eIDAS LOTL entry link, notes
├── signing            — recommended signing tool + minVersion + portal link
├── parser status      — silver: "DER-strict confirmed on N samples"
│                        gold:   "Witness gen + register succeeds end-to-end"
│                        live:   "Production registry: 0x… on Base"
├── samples ledger     — table of samples.json entries (public metadata only)
├── trust anchors      — list of intermediates/*.pem with fingerprints
└── CTA                — silver: "Notify me when ready"
                         gold:   "Try on testnet" → register flow (qtsp-scoped)
                         live:   "Register" → register flow (qtsp-scoped)
```

### 4.4 Register-flow scoping

The existing `/v5/registerV5` route accepts a new optional query
parameter `?qtsp=<cc>/<slug>`. The flow reads the param, looks up the
QTSP's `meta.json` from the bundled index, and pre-fills:
- The trust anchor selection (no UA hardcode).
- The signing-tool recommendation copy.
- The per-QTSP `cert.berInput` error string when the DER-strict guard
  fires.

When the param is absent, malformed, refers to a slug not in the
QTSP index, or refers to a bronze tile (which has no register-flow
support), the route falls back to UA-default behavior (current
shipping behavior). Wiring this for non-UA QTSPs at runtime is
per-QTSP followup work; this spec only locks the param shape so
per-QTSP pages can link to it now.

## 5. Routing and build

### 5.1 Route registration

`packages/web/src/router.tsx`:

- New shared route `/qtsp/$country/$qtsp` rendered by `<QtspPage>`.
  Loader pulls `meta.json` from the bundled index; 404s on bronze
  tiles or unknown slugs (drawer is the only entry for bronze).
- New shared route `/countries` redirects to `/#coverage` via
  client-side `<Navigate>`.
- Existing `/v5/registerV5` accepts optional `?qtsp=<cc>/<slug>`.

Both new routes go in `sharedRoutes` (visible on `VITE_TARGET=landing`
and `app`). The `appOnlyRoutes` partition is untouched.

### 5.2 Bundle impact

Per-QTSP pages use `lazyRouteComponent(() => import('./routes/qtspPage'))`
per CLAUDE.md invariant 21. The QTSP index ships in the entry chunk
(small — `meta.json` × N where N is currently <30). `samples.json` and
intermediates are static assets, fetched on demand.

**Budget:** Landing entry chunk ≤2.7 MB. A reach test in
`tests/build/landing-bundle-size.test.ts` fails CI on overrun.

### 5.3 i18n

New `qtsp.*` namespace in `src/i18n/{en,uk}.json` covering:
- Tile state labels (`bronze`, `silver`, `gold`, `live`).
- Drawer copy (states, CTAs).
- Page section headers.
- Generic and per-QTSP `cert.berInput` error strings.

QTSP-specific freeform copy (`meta.notes`, `meta.signingTool.name`,
`meta.displayName`) is **not** localized — stays in the data file in
source language.

Both files MUST have the same key set per CLAUDE.md invariant 2.

## 6. DER-strict guard

The load-bearing piece of the per-QTSP-scoping risk model. Without
this, silver/gold tiles can silently regress when a QTSP ships a
non-strict-DER batch or when a buggy signing tool emits non-canonical
SignedAttrs.

### 6.1 Module

`packages/sdk/src/cert/der-strict.ts` (new file). Pure function over
`Uint8Array`; no pkijs dependency (operates on raw bytes — using pkijs
would re-encode and lose the BER signal).

### 6.2 Checks performed

Per X.690 §10 (DER restrictions on top of BER):

1. **Length encoding canonical.** Shortest length form only. Reject
   `0x82 0x00 0xff` when `0x81 0xff` would suffice.
2. **No indefinite-length encoding.** Reject the `0x80` length octet.
3. **INTEGER canonical.** No leading `0x00` unless needed for
   sign-bit; no leading `0xFF` for negatives; no all-zero except the
   canonical single `0x00`.
4. **BIT STRING padding.** "Unused bits" octet 0–7, consistent with
   bit length; trailing zeros must be zero.
5. **SET ordering.** SET-OF members sorted by their DER encoding
   lexicographically (RFC 5280 §4.1.2.4, recursive).
6. **OID canonical.** No redundant leading subidentifier bytes.
7. **String canonical.** PrintableString / UTF8String / IA5String
   character checks per spec; no embedded NUL in PrintableString.
8. **BOOLEAN canonical.** TRUE encoded as `0xFF`.

### 6.3 API

```ts
export type DerStrictResult =
  | { ok: true }
  | { ok: false; reason: DerStrictReason; offset: number; path: string };

export type DerStrictReason =
  | 'indefinite-length'
  | 'non-minimal-length'
  | 'non-canonical-integer'
  | 'non-canonical-bitstring'
  | 'non-canonical-set'
  | 'non-canonical-oid'
  | 'non-canonical-string'
  | 'non-canonical-boolean'
  | 'truncated'
  | 'unknown-tag';

export function isStrictDER(bytes: Uint8Array): DerStrictResult;
```

`offset` and `path` are diagnostic — `path` is dot-notated like
`Certificate.tbsCertificate.subject.serialNumber`. Best-effort; on
truncation, returns offset of the failing tag.

### 6.4 Call sites

- `parseP7s()` in `packages/sdk/src/witness/v5/parse-p7s.ts`: FIRST
  thing after `fromBER()` succeeds is `isStrictDER(p7sBuffer)`. On
  `ok: false`, throw `ZkqesError('cert.berInput', { reason, offset,
  path })` BEFORE any `.toBER(false)` re-encode.
- The leaf cert sliced from the parsed structure (cert may be DER
  even when outer envelope is BER, or vice versa — fail loudly on
  either).
- The `signedAttrs` re-tagged buffer (catches buggy-signing-tool case
  independent of cert encoding).

### 6.5 User-facing error

`ZkqesError('cert.berInput')` resolves through i18n, looked up by the
`?qtsp` route param when present:

```
"errors.cert.berInput": "Your {{qtspName}} certificate is non-canonically encoded ({{reason}}). zkqes currently requires strict DER encoding from {{qtspName}}; please re-issue from {{qtspUrl}} or contact the team if this persists."
```

When no `qtsp` param is in scope, fall back to a generic message
linking to `/countries` for diagnosis.

### 6.6 Tests

`packages/sdk/src/cert/der-strict.test.ts`:
- Hand-crafted byte fixtures (NOT real `.p7s`) covering each
  `DerStrictReason` — pass cases and fail cases.
- Round-trip against synthetic DER outputs from pkijs (MUST be
  `ok: true`).
- Negative cases against synthetic BER outputs (indefinite-length /
  non-minimal length / non-canonical SET ordering).

### 6.7 Performance

O(n) single-walk. Typical leaf cert (~1.5 KB) + signedAttrs (~200 B):
well under 1 ms. No blocking concern even on slowest in-scope device.

## 7. Contribution flow

### 7.1 Adding a bronze tile

Contributor opens a PR adding `fixtures/trust/<cc>/<qtsp-slug>/meta.json`,
no other files needed. CI runs the schema-validation Vite plugin; if
parse succeeds and the slug isn't a duplicate, the PR is mergeable.
Founder review confirms the QTSP claim is defensible (real eIDAS LOTL
entry, real signing tool, no obvious red flags). Bronze tile appears
on next deploy.

### 7.2 Promotion bronze → silver

Contributor (or team) collects ≥3 real `.p7s` samples from the QTSP —
each from a different signer, ideally across different issuance
batches — and runs:

```
pnpm -F @zkqes/sdk exec promote-qtsp \
  --country IT --qtsp aruba-pec \
  --samples ~/.zkqes-private-samples/aruba/*.p7s
```

The script:
1. Runs `isStrictDER()` on each sample's leaf + signedAttrs.
2. Walks the parser (asn1js → pkijs).
3. Extracts the intermediate certs.
4. Emits `intermediates/*.pem` + `samples.json` (public metadata only;
   never the `.p7s` itself).

Contributor opens a PR with the generated files. Lead reviews; if all
samples pass the guard and parser walks cleanly, `meta.state` flips to
`silver`.

`.p7s` files **never enter the repo** — the script never copies them,
only reads. The `samples.json` SHA-256s are the public audit trail.

### 7.3 Promotion silver → gold

Run the existing V5.2 witness builder + register flow against the
QTSP's samples on Base Sepolia. Requires per-QTSP circuit-coverage
which is out of scope here. The promotion script bones are stubbed
for forward compatibility; actual silver→gold operator is
"circuits-eng confirms witness gen succeeds for QTSP X" with a
followup spec.

### 7.4 Promotion gold → live

Per-QTSP registry deploy + ceremony output. Both out of scope —
tracked as followup specs once a QTSP earns gold.

## 8. Testing posture

- **Unit tests** walk synthetic fixtures only. Mint a synthetic
  strict-DER cert + synthetic CAdES envelope mimicking each QTSP's
  documented quirks. Same `beforeAll` pattern as V5 unit tests today.
- **Integration tests** check the build-time index: `qtsp-index.test.ts`
  confirms every `meta.json` parses, no duplicate slugs, every silver+
  tile has the required intermediate files, every promoted tile has
  matching `samples.json` evidence.
- **Smoke test for the guard** (Section 6.6).
- **Playwright e2e** unaffected — the existing UA happy-path remains
  the canonical e2e gate. Per-QTSP e2e gets added at gold promotion.
- **Real-`.p7s` validation** stays a manual founder/lead step run
  locally against the private sample set. The samples.json ledger
  captures the result; nothing in the repo or CI ever sees the bytes.

## 9. Mainnet posture

This spec ships only to the landing target (`zkqes.org` root). The
app target (`app.zkqes.org`) inherits new routes when its deploy
lands post-§9.4. Mainnet readiness is **per-QTSP** and gated on:

1. The QTSP reaching `live` state (gold + ceremony + registry deploy).
2. Phase B real Phase 2 ceremony output bound into a fresh registry
   redeploy.
3. Independent audit of the per-QTSP fixture set.

The facade itself is environment-agnostic and accurate on landing
regardless of whether app.zkqes.org points at testnet or mainnet.
State labels reference the chain target where relevant ("ready for
testnet" vs "live on Base mainnet").

## 10. Out of scope

- Per-QTSP circuit coverage — followup spec per QTSP.
- Per-QTSP ceremony output — extends `2026-04-24-per-country-registries-design.md`.
- Per-QTSP registry deploys — followup spec per QTSP.
- Pan-EU LOTL ingestion — dropped from production trust path per
  project memory; `meta.tslEntry` is informational only.
- Trustless eIDAS rotation gate — parked work
  (`2026-04-27-trustless-eidas.md`).
- Real-`.p7s` test fixtures — stays a manual local step.
- "Notify me" backend integration — `localStorage` only in this spec.

## 11. Success criteria

1. `fixtures/trust/` accepts new QTSP entries via PR with no code
   change required for bronze tiles.
2. The DER-strict guard rejects every BER input it sees with a
   per-QTSP actionable error; never re-encodes before the guard runs.
3. Landing entry chunk stays ≤2.7 MB after the QTSP grid + index ship.
4. The current UA/Diia happy-path register flow is byte-identical
   pre- and post-rollout (no live-tile regression).
5. Every silver+ tile has matching `samples.json` evidence; CI fails
   the build on schema drift or missing evidence files.
6. Founder-curated initial seed populates the index with ≥1 live tile
   (Diia/UA), ≥3 bronze tiles, and a help-wanted bucket for
   everything else.

## 12. Risks

- **Bounty-mechanism cold-start.** Bronze→silver requires real `.p7s`
  samples from country residents — high friction. Initial silver
  tiles likely come from team/founder network, not community. Watch:
  if no community contributions land in 3 months, revisit incentive
  design.
- **Per-QTSP page SEO.** As tile count grows, pages may need
  editorial care to avoid thin-content penalties. Out of scope here;
  flag for marketer review post-launch.
- **DER-strict guard false positives.** If our X.690 §10
  interpretation is too aggressive, we reject valid certs other
  libraries accept. Mitigate by running the guard against pkijs's
  canonical-DER outputs in unit tests (MUST pass) and against a
  large public corpus of real EU QTSP intermediates (informational,
  not CI-gated).
- **Silver-bar evidence integrity.** `samples.json` is contributor-
  asserted; we trust the contributor that the SHA-256 fingerprints
  correspond to real samples. A bad-faith contributor could fake
  evidence. Mitigation: founder/lead review of all silver-promotion
  PRs; the script's runtime output is reproducible by anyone with
  the same private samples.

---

## Cross-references

- Parent: `2026-04-24-per-country-registries-design.md` — chain layer.
- Parent: `2026-05-04-zkqes-civic-terminal-v2-design.md` — Landing
  surface this extends.
- Related (parked): `2026-04-27-trustless-eidas.md`.
- BER risk surfaced: this brainstorm session, 2026-05-05.
