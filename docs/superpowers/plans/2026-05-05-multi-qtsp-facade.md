# Multi-QTSP Facade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the multi-QTSP facade design to `zkqes.org`: per-QTSP tile grid on Landing, per-QTSP pages for silver/gold/live tiles, drawer for bronze, frozen trust-list-ingestion file contract, and a strict-DER guard at the `.p7s` parse boundary.

**Architecture:** UI surface in `@zkqes/web`; ingestion-validation Vite plugin in `@zkqes/web/vite/`; DER-strict guard module in `@zkqes/sdk` (consumed by SDK's `parse-p7s.ts`); per-QTSP fixtures under `fixtures/trust/<cc>/<qtsp-slug>/`. Founder-curated initial seed lands as a content commit. No circuits, no contracts, no per-QTSP deploys — those are followup specs.

**Tech Stack:** TanStack Router, React 18, Vite 5, Zod, asn1js (raw byte inspection only), pkijs (existing). Tests: vitest (unit + integration), Playwright (existing UA happy-path unaffected).

**Spec ref:** `docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md`.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `packages/sdk/src/cert/der-strict.ts` | `isStrictDER()` guard, pure-byte inspection, no pkijs |
| `packages/sdk/src/cert/der-strict.test.ts` | Hand-crafted byte fixtures per `DerStrictReason` |
| `packages/sdk/src/country/qtspMeta.ts` | Zod schema for `QtspMeta` + `SignerToolMeta` + `QtspState` |
| `packages/sdk/src/country/qtspMeta.test.ts` | Schema validation tests |
| `packages/sdk/scripts/promote-qtsp.ts` | Stub script for bronze→silver promotion (reads `.p7s`, emits `samples.json` + `intermediates/*.pem`) |
| `packages/web/vite/plugin-qtsp-index.ts` | Walks `fixtures/trust/`, emits `src/generated/qtsp-index.ts` |
| `packages/web/vite/plugin-qtsp-index.test.ts` | Plugin output tests on synthetic fixture trees |
| `packages/web/src/components/qtsp/QtspTile.tsx` | Single tile component, state-styled |
| `packages/web/src/components/qtsp/QtspDrawer.tsx` | Right-edge drawer for bronze tiles |
| `packages/web/src/components/qtsp/CountryGrid.tsx` | Grid + filter chips, regional grouping |
| `packages/web/src/routes/qtspPage.tsx` | Per-QTSP page (silver/gold/live) |
| `packages/web/src/routes/countriesRedirect.tsx` | `/countries` → `/#coverage` |
| `packages/web/src/lib/qtspIndex.ts` | Helpers: `getQtspByPath()`, `groupByRegion()`, `filterByState()` |
| `packages/web/tests/unit/qtspIndex.test.ts` | Helper tests |
| `packages/web/tests/unit/QtspTile.test.tsx` | Tile rendering per state |
| `packages/web/tests/unit/QtspDrawer.test.tsx` | Drawer rendering + interactions |
| `packages/web/tests/unit/CountryGrid.test.tsx` | Grid + filter chips behavior |
| `packages/web/tests/integration/qtsp-index.test.ts` | Build-time index validation against real fixtures/trust/ |
| `packages/web/tests/build/landing-bundle-size.test.ts` | Reach test: landing entry chunk ≤2.7 MB |
| `.github/ISSUE_TEMPLATE/help-add-qtsp.md` | Per-QTSP "help us verify" issue template |
| `fixtures/trust/ua/diia/meta.json` | First live-tile meta, written during migration |
| `fixtures/trust/<cc>/<qtsp-slug>/meta.json` | Founder-curated bronze tiles (≥3) |

### Modified files

| Path | Change |
|---|---|
| `packages/sdk/src/witness/v5/parse-p7s.ts` | Call `isStrictDER()` after `fromBER`; throw `cert.berInput` on fail |
| `packages/sdk/src/index.ts` | Re-export `isStrictDER`, `QtspMeta`, `QTSP_STATES` |
| `packages/sdk/src/errors/codes.ts` | Add `'cert.berInput'` to `ZkqesErrorCode` union |
| `packages/sdk/src/country/index.ts` | Re-export QTSP types alongside existing `SUPPORTED_COUNTRIES` |
| `packages/web/vite.config.ts` | Register `qtspIndexPlugin()` |
| `packages/web/src/router.tsx` | Add `/qtsp/$country/$qtsp` + `/countries` to `sharedRoutes` |
| `packages/web/src/routes/index.tsx` (Landing) | Insert `<CountryGrid>` between hero and path cards |
| `packages/web/src/routes/v5/registerV5.tsx` | Read `?qtsp=<cc>/<slug>`, look up meta, scope copy |
| `packages/web/src/i18n/en.json` | New `qtsp.*` namespace + `errors.cert.berInput` |
| `packages/web/src/i18n/uk.json` | Parity with en.json (lead reviews UA copy with native speaker) |
| `packages/web/scripts/compute-policy-root.mjs:25` | Path: `fixtures/trust/ua/diia/policy-root.json` |
| `packages/web/tests/unit/verify-policy-root.test.ts:9` | Path: `fixtures/trust/ua/diia/policy-root.json` |
| `packages/circuits/scripts/gen-zkqes-v2-core-binding.mjs:36` | Comment update only |
| `fixtures/trust/ua/{root,trusted-cas,policy-root}.json` | Move to `fixtures/trust/ua/diia/` |
| `.gitignore` | Add `packages/web/src/generated/qtsp-index.ts` |

### Out of scope

- Circuits / contracts / ceremony / per-QTSP deploys.
- Real-`.p7s` collection or CI-side ingestion of private samples.
- "Notify me" backend (writes to `localStorage` only).
- App-target deploy of the new routes — inherits when `app.zkqes.org` ships post-§9.4.
- Pan-EU LOTL ingestion (dropped from production trust path).

---

## Task 1: Migrate UA fixtures to per-QTSP layout

**Files:**
- Move: `fixtures/trust/ua/{root,trusted-cas,policy-root}.json` → `fixtures/trust/ua/diia/`
- Modify: `packages/web/scripts/compute-policy-root.mjs:25`
- Modify: `packages/web/tests/unit/verify-policy-root.test.ts:9`
- Modify: `packages/circuits/scripts/gen-zkqes-v2-core-binding.mjs:36` (comment only)
- Create: `fixtures/trust/ua/diia/meta.json`

- [ ] **Step 1: Run baseline tests to confirm green pre-migration**

```bash
pnpm -F @zkqes/web test tests/unit/verify-policy-root.test.ts
```

Expected: PASS. Capture output as the byte-equivalent target.

- [ ] **Step 2: Move the three fixtures**

```bash
mkdir -p fixtures/trust/ua/diia
git mv fixtures/trust/ua/root.json fixtures/trust/ua/diia/root.json
git mv fixtures/trust/ua/trusted-cas.json fixtures/trust/ua/diia/trusted-cas.json
git mv fixtures/trust/ua/policy-root.json fixtures/trust/ua/diia/policy-root.json
```

- [ ] **Step 3: Update consumer paths**

`packages/web/scripts/compute-policy-root.mjs:25`:
```js
const OUT_PATH = resolve(REPO_ROOT, 'fixtures/trust/ua/diia/policy-root.json');
```

`packages/web/tests/unit/verify-policy-root.test.ts:9`:
```ts
const OUT_PATH = resolve(REPO_ROOT, 'fixtures/trust/ua/diia/policy-root.json');
```

`packages/circuits/scripts/gen-zkqes-v2-core-binding.mjs:36`:
```js
// -- Committed UA policy leaf hash (from fixtures/trust/ua/diia/policy-root.json) --
```

- [ ] **Step 4: Create `fixtures/trust/ua/diia/meta.json`**

```json
{
  "country": "UA",
  "qtspSlug": "diia",
  "displayName": "Diia",
  "qtspUrl": "https://diia.gov.ua/",
  "tslEntry": null,
  "signingTool": {
    "name": "Diia mobile app",
    "url": "https://diia.gov.ua/",
    "minVersion": null
  },
  "state": "live",
  "addedAt": "2026-05-05",
  "promotedAt": "2026-05-05",
  "lastVerified": "2026-05-05",
  "notes": "Ukrainian Ministry of Digital Transformation; ECDSA-P256 leaves with subjectSerialNumber TIN/PNO prefix per ETSI EN 319 412-1."
}
```

- [ ] **Step 5: Verify tests still pass byte-for-byte**

```bash
pnpm -F @zkqes/web test tests/unit/verify-policy-root.test.ts
```

Expected: PASS, identical to baseline.

- [ ] **Step 6: Commit**

```bash
git add fixtures/trust/ua packages/web/scripts/compute-policy-root.mjs \
        packages/web/tests/unit/verify-policy-root.test.ts \
        packages/circuits/scripts/gen-zkqes-v2-core-binding.mjs
git commit -m "fixtures(trust): migrate ua/ to ua/diia/ layout for per-QTSP facade"
```

---

## Task 2: QtspMeta Zod schema

**Files:**
- Create: `packages/sdk/src/country/qtspMeta.ts`
- Create: `packages/sdk/src/country/qtspMeta.test.ts`
- Modify: `packages/sdk/src/country/index.ts` (re-exports)
- Modify: `packages/sdk/src/index.ts` (top-level re-exports)

- [ ] **Step 1: Write the failing test**

`packages/sdk/src/country/qtspMeta.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { QtspMetaSchema, QTSP_STATES } from './qtspMeta';

describe('QtspMeta', () => {
  const valid = {
    country: 'UA',
    qtspSlug: 'diia',
    displayName: 'Diia',
    qtspUrl: 'https://diia.gov.ua/',
    tslEntry: null,
    signingTool: { name: 'Diia mobile app', url: 'https://diia.gov.ua/', minVersion: null },
    state: 'live',
    addedAt: '2026-05-05',
    promotedAt: '2026-05-05',
    lastVerified: '2026-05-05',
    notes: 'short note',
  };

  it('accepts canonical valid input', () => {
    expect(QtspMetaSchema.parse(valid)).toMatchObject({ country: 'UA', state: 'live' });
  });

  it('rejects lowercase country', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, country: 'ua' })).toThrow();
  });

  it('rejects unknown state', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, state: 'platinum' })).toThrow();
  });

  it('rejects non-ISO date', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, addedAt: 'May 5 2026' })).toThrow();
  });

  it('rejects qtspSlug with uppercase', () => {
    expect(() => QtspMetaSchema.parse({ ...valid, qtspSlug: 'D-Trust' })).toThrow();
  });

  it('exposes QTSP_STATES tuple', () => {
    expect(QTSP_STATES).toEqual(['bronze', 'silver', 'gold', 'live']);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/sdk test src/country/qtspMeta.test.ts
```

Expected: FAIL with "Cannot find module ./qtspMeta".

- [ ] **Step 3: Implement schema**

`packages/sdk/src/country/qtspMeta.ts`:
```ts
import { z } from 'zod';

export const QTSP_STATES = ['bronze', 'silver', 'gold', 'live'] as const;
export type QtspState = (typeof QTSP_STATES)[number];

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const Iso3166Alpha2Upper = z.string().regex(/^[A-Z]{2}$/, 'must be ISO 3166-1 alpha-2 uppercase');
const QtspSlug = z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'must be lowercase ASCII slug');
const HttpUrl = z.string().url();

export const SignerToolMetaSchema = z.object({
  name: z.string().min(1),
  url: HttpUrl,
  minVersion: z.string().nullable(),
});
export type SignerToolMeta = z.infer<typeof SignerToolMetaSchema>;

export const QtspMetaSchema = z.object({
  country: Iso3166Alpha2Upper,
  qtspSlug: QtspSlug,
  displayName: z.string().min(1),
  qtspUrl: HttpUrl,
  tslEntry: HttpUrl.nullable(),
  signingTool: SignerToolMetaSchema,
  state: z.enum(QTSP_STATES),
  addedAt: IsoDate,
  promotedAt: IsoDate.nullable(),
  lastVerified: IsoDate,
  notes: z.string(),
});
export type QtspMeta = z.infer<typeof QtspMetaSchema>;
```

- [ ] **Step 4: Re-export from country/index.ts and top-level**

`packages/sdk/src/country/index.ts` — add:
```ts
export {
  QTSP_STATES,
  QtspMetaSchema,
  SignerToolMetaSchema,
  type QtspMeta,
  type QtspState,
  type SignerToolMeta,
} from './qtspMeta';
```

`packages/sdk/src/index.ts` — verify the new exports flow through.

- [ ] **Step 5: Run tests to verify PASS**

```bash
pnpm -F @zkqes/sdk test src/country/qtspMeta.test.ts
```

Expected: PASS, all 6 cases.

- [ ] **Step 6: Run full SDK test suite**

```bash
pnpm -F @zkqes/sdk test
pnpm -F @zkqes/sdk typecheck
```

Expected: All green.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/country
git commit -m "feat(sdk): QtspMeta Zod schema for trust-list ingestion contract"
```

---

## Task 3: DER-strict guard module

**Files:**
- Create: `packages/sdk/src/cert/der-strict.ts`
- Create: `packages/sdk/src/cert/der-strict.test.ts`
- Modify: `packages/sdk/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing test (one per `DerStrictReason`)**

`packages/sdk/src/cert/der-strict.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isStrictDER } from './der-strict';

// Helper: hex → Uint8Array
const h = (s: string) => new Uint8Array(s.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

describe('isStrictDER', () => {
  it('accepts canonical SEQUENCE { INTEGER 1 }', () => {
    expect(isStrictDER(h('3003020101'))).toEqual({ ok: true });
  });

  it('rejects indefinite-length SEQUENCE', () => {
    const r = isStrictDER(h('3080020101000a'));
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: 'indefinite-length' });
  });

  it('rejects non-minimal length (0x82 0x00 0x05 instead of 0x05)', () => {
    const r = isStrictDER(h('3082000502010102010f'));
    expect(r).toMatchObject({ ok: false, reason: 'non-minimal-length' });
  });

  it('rejects INTEGER with redundant 0x00 prefix', () => {
    expect(isStrictDER(h('30050203000001'))).toMatchObject({
      ok: false, reason: 'non-canonical-integer',
    });
  });

  it('rejects SET-OF with unsorted members', () => {
    // SET-OF { INTEGER 2, INTEGER 1 } — must be sorted lex by encoding
    expect(isStrictDER(h('310602010202010 1'.replace(/\s/g, '')))).toMatchObject({
      ok: false, reason: 'non-canonical-set',
    });
  });

  it('rejects truncated TLV', () => {
    expect(isStrictDER(h('30'))).toMatchObject({
      ok: false, reason: 'truncated',
    });
  });

  it('round-trips a real DER SubjectPublicKeyInfo (Diia leaf)', async () => {
    const { default: spkiHex } = await import('../../tests/fixtures/diia-leaf-spki.json', {
      assert: { type: 'json' },
    });
    expect(isStrictDER(h(spkiHex.spki))).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/sdk test src/cert/der-strict.test.ts
```

Expected: FAIL with "Cannot find module ./der-strict".

- [ ] **Step 3: Implement guard module**

`packages/sdk/src/cert/der-strict.ts` — implement per spec §6.2 + §6.3. Pure-bytes recursive walker. Each tag-class handles its specific canonicality rule; primitive types (INTEGER, BIT STRING, BOOLEAN, OID, the printable strings) check canonical form; constructed types (SEQUENCE, SET) recurse into children. SET children sorted by their full encoding. Returns `{ ok, reason, offset, path }` with `path` accumulated as `<TAG_NAME>(.<INDEX>)*`.

Key tag handling (universal class, primitive):
- `0x01` BOOLEAN: 1-byte content; `0x00` (FALSE) or `0xFF` (TRUE) only.
- `0x02` INTEGER: signed two's-complement, no redundant sign-extension byte.
- `0x03` BIT STRING: first byte 0–7 (unused-bits count); trailing zero bits in the value cleared.
- `0x04` OCTET STRING: opaque bytes — no canonicality requirement on content.
- `0x05` NULL: zero-length content.
- `0x06` OID: arc-encoded subidentifiers; no leading 0x80 padding bytes.
- `0x0c` UTF8String, `0x13` PrintableString, `0x16` IA5String, `0x14` TeletexString, `0x1e` BMPString: encoding-specific allowed-byte ranges.
- `0x17` UTCTime, `0x18` GeneralizedTime: ASCII digits only, fixed canonical form.

Constructed class (high bit `0x20` of the tag set):
- `0x30` SEQUENCE: recurse children in order.
- `0x31` SET: recurse children, then verify the sequence of encoded child byte-strings is in lexicographic order.

Length parsing:
- `< 0x80`: single-byte length.
- `0x81..0x84`: multi-byte length, count of length-bytes is `(byte0 & 0x7F)`. Reject if `byte0 == 0x80` (indefinite-length).
- Reject if multi-byte length could fit in fewer bytes (non-minimal).

`offset` is the byte index of the failing TLV's tag. `path` accumulates as we recurse.

- [ ] **Step 4: Run tests to verify PASS**

```bash
pnpm -F @zkqes/sdk test src/cert/der-strict.test.ts
```

Expected: PASS, all 7 cases.

- [ ] **Step 5: Add the Diia SPKI fixture**

Extract from a known-good Diia cert: `packages/sdk/tests/fixtures/diia-leaf-spki.json`:
```json
{ "spki": "<hex>", "source": "synthetic-diia-template-2026-05-05" }
```

The fixture is synthetic — derived from the public test cert template, not a real signer's leaf.

- [ ] **Step 6: Re-export from sdk top-level**

`packages/sdk/src/index.ts`:
```ts
export {
  isStrictDER,
  type DerStrictResult,
  type DerStrictReason,
} from './cert/der-strict';
```

- [ ] **Step 7: Run full SDK test suite**

```bash
pnpm -F @zkqes/sdk test
pnpm -F @zkqes/sdk typecheck
```

Expected: All green.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/cert packages/sdk/tests/fixtures/diia-leaf-spki.json \
        packages/sdk/src/index.ts
git commit -m "feat(sdk): isStrictDER() guard for X.690 §10 canonicality"
```

---

## Task 4: Wire DER-strict into parse-p7s

**Files:**
- Modify: `packages/sdk/src/witness/v5/parse-p7s.ts`
- Modify: `packages/sdk/src/errors/codes.ts` (add `'cert.berInput'`)
- Create: `packages/sdk/src/witness/v5/parse-p7s.der-strict.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sdk/src/witness/v5/parse-p7s.der-strict.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Buffer } from 'buffer';
import { parseP7s } from './parse-p7s';
import { ZkqesError } from '../../errors';

describe('parseP7s — DER-strict guard', () => {
  it('rejects an indefinite-length-encoded outer ContentInfo', () => {
    // Hand-crafted minimal CMS envelope with indefinite-length outer SEQUENCE
    const berEnvelope = Buffer.from('3080...0000', 'hex');
    expect(() => parseP7s(berEnvelope)).toThrow(ZkqesError);
    try {
      parseP7s(berEnvelope);
    } catch (e) {
      expect((e as ZkqesError).code).toBe('cert.berInput');
      expect((e as ZkqesError).context).toMatchObject({ reason: 'indefinite-length' });
    }
  });

  it('still parses a known-good DER .p7s', async () => {
    const { synthDiiaP7s } = await import('../../../tests/fixtures/synth-diia-p7s');
    const parsed = parseP7s(synthDiiaP7s);
    expect(parsed.leafCertDer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/sdk test src/witness/v5/parse-p7s.der-strict.test.ts
```

Expected: FAIL with "ZkqesError code 'cert.berInput' not recognized" or similar.

- [ ] **Step 3: Add error code**

`packages/sdk/src/errors/codes.ts` — add `'cert.berInput'` to the union.

- [ ] **Step 4: Wire isStrictDER into parse-p7s**

`packages/sdk/src/witness/v5/parse-p7s.ts` — add at the very top of `parseP7s()`, BEFORE any `.toBER(false)` re-encode call:

```ts
import { isStrictDER } from '../../cert/der-strict';
import { ZkqesError } from '../../errors';

export function parseP7s(p7sBuffer: Buffer): CmsExtraction {
  const guard = isStrictDER(new Uint8Array(p7sBuffer.buffer, p7sBuffer.byteOffset, p7sBuffer.length));
  if (!guard.ok) {
    throw new ZkqesError('cert.berInput', {
      reason: guard.reason,
      offset: guard.offset,
      path: guard.path,
      where: 'p7s-envelope',
    });
  }

  const asn = fromBER(bufferToArrayBuffer(p7sBuffer));
  // ... rest unchanged ...
```

- [ ] **Step 5: Add a second guard call against the leaf cert post-extraction**

After the leaf extraction (around current `:133`), and BEFORE the `leaf.toSchema().toBER(false)` re-encode, slice the leaf cert bytes from the original `p7sBuffer` using asn1js's offset metadata, then call `isStrictDER` on the slice with `where: 'leaf-cert'`. (The outer envelope being DER-strict doesn't guarantee the cert inside is — they're separately encoded.)

Same pattern for `signedAttrsDer` after `reTagSignedAttrs` (the `where: 'signed-attrs'` slot).

- [ ] **Step 6: Run tests to verify PASS**

```bash
pnpm -F @zkqes/sdk test src/witness/v5/parse-p7s.der-strict.test.ts
pnpm -F @zkqes/sdk test  # full suite
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src
git commit -m "feat(sdk): wire isStrictDER guard into parseP7s; throw cert.berInput on BER input"
```

---

## Task 5: Vite plugin to walk fixtures/trust/ and emit qtsp-index.ts

**Files:**
- Create: `packages/web/vite/plugin-qtsp-index.ts`
- Create: `packages/web/vite/plugin-qtsp-index.test.ts`
- Modify: `packages/web/vite.config.ts`
- Modify: `.gitignore` (add `packages/web/src/generated/qtsp-index.ts`)

- [ ] **Step 1: Write the failing test**

`packages/web/vite/plugin-qtsp-index.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { qtspIndexPlugin } from './plugin-qtsp-index';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'qtsp-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function write(rel: string, content: string) {
  const full = join(tmp, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

describe('qtspIndexPlugin', () => {
  it('emits qtsp-index.ts with all valid meta.json files sorted by country+slug', async () => {
    write('fixtures/trust/ua/diia/meta.json', JSON.stringify({
      country: 'UA', qtspSlug: 'diia', displayName: 'Diia', qtspUrl: 'https://diia.gov.ua/',
      tslEntry: null,
      signingTool: { name: 'Diia mobile app', url: 'https://diia.gov.ua/', minVersion: null },
      state: 'live', addedAt: '2026-05-05', promotedAt: '2026-05-05', lastVerified: '2026-05-05',
      notes: '',
    }));
    write('fixtures/trust/it/aruba-pec/meta.json', JSON.stringify({
      country: 'IT', qtspSlug: 'aruba-pec', displayName: 'Aruba PEC', qtspUrl: 'https://www.pec.it/',
      tslEntry: null,
      signingTool: { name: 'ArubaSign', url: 'https://www.pec.it/firma-digitale.aspx', minVersion: null },
      state: 'bronze', addedAt: '2026-05-05', promotedAt: null, lastVerified: '2026-05-05',
      notes: '',
    }));
    const plugin = qtspIndexPlugin({ root: tmp, outFile: join(tmp, 'out/qtsp-index.ts') });
    await plugin.buildStart!.call({} as never);
    const out = readFileSync(join(tmp, 'out/qtsp-index.ts'), 'utf8');
    expect(out).toContain("country: 'IT'");
    expect(out).toContain("country: 'UA'");
    expect(out.indexOf("'IT'")).toBeLessThan(out.indexOf("'UA'"));
  });

  it('throws on invalid meta.json', async () => {
    write('fixtures/trust/it/aruba-pec/meta.json', JSON.stringify({ country: 'lowercase' }));
    const plugin = qtspIndexPlugin({ root: tmp, outFile: join(tmp, 'out/qtsp-index.ts') });
    await expect(plugin.buildStart!.call({} as never)).rejects.toThrow(/aruba-pec/);
  });

  it('throws on duplicate (country, qtspSlug)', async () => {
    // ... two meta.json with same country+slug under different paths
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/web test vite/plugin-qtsp-index.test.ts
```

Expected: FAIL with "Cannot find module ./plugin-qtsp-index".

- [ ] **Step 3: Implement plugin**

`packages/web/vite/plugin-qtsp-index.ts`:
```ts
import type { Plugin } from 'vite';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { QtspMetaSchema, type QtspMeta } from '@zkqes/sdk';

export interface QtspIndexPluginOptions {
  root: string;       // repo root
  outFile: string;    // typically packages/web/src/generated/qtsp-index.ts
}

export function qtspIndexPlugin(opts: QtspIndexPluginOptions): Plugin {
  return {
    name: 'qtsp-index',
    enforce: 'pre',
    buildStart() {
      const trustRoot = resolve(opts.root, 'fixtures/trust');
      if (!existsSync(trustRoot)) throw new Error(`fixtures/trust/ not found at ${trustRoot}`);

      const entries: QtspMeta[] = [];
      const seen = new Set<string>();
      for (const cc of readdirSync(trustRoot)) {
        const ccDir = join(trustRoot, cc);
        for (const slug of readdirSync(ccDir)) {
          const metaPath = join(ccDir, slug, 'meta.json');
          if (!existsSync(metaPath)) continue;
          let raw: unknown;
          try { raw = JSON.parse(readFileSync(metaPath, 'utf8')); }
          catch (e) { throw new Error(`qtsp-index: parse failed: ${metaPath}: ${e}`); }
          const result = QtspMetaSchema.safeParse(raw);
          if (!result.success) {
            throw new Error(`qtsp-index: schema fail at ${metaPath}: ${result.error.message}`);
          }
          const key = `${result.data.country}/${result.data.qtspSlug}`;
          if (seen.has(key)) throw new Error(`qtsp-index: duplicate (country,slug) ${key}`);
          seen.add(key);
          entries.push(result.data);
        }
      }
      entries.sort((a, b) =>
        a.country !== b.country ? a.country.localeCompare(b.country) : a.qtspSlug.localeCompare(b.qtspSlug)
      );

      const out = [
        '// AUTO-GENERATED by qtspIndexPlugin — do not edit by hand.',
        "import type { QtspMeta } from '@zkqes/sdk';",
        '',
        'export const QTSP_INDEX: ReadonlyArray<QtspMeta> = Object.freeze([',
        ...entries.map((e) => `  ${JSON.stringify(e)},`),
        ']);',
        '',
      ].join('\n');

      mkdirSync(dirname(opts.outFile), { recursive: true });
      writeFileSync(opts.outFile, out);
      this.addWatchFile(trustRoot);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
pnpm -F @zkqes/web test vite/plugin-qtsp-index.test.ts
```

Expected: PASS, all 3 cases.

- [ ] **Step 5: Wire into vite.config.ts**

`packages/web/vite.config.ts` — add to plugins array:
```ts
import { qtspIndexPlugin } from './vite/plugin-qtsp-index';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

plugins: [
  qtspIndexPlugin({
    root: repoRoot,
    outFile: resolve(__dirname, 'src/generated/qtsp-index.ts'),
  }),
  // ... existing plugins
],
```

- [ ] **Step 6: Add generated file to .gitignore**

`.gitignore`:
```
packages/web/src/generated/qtsp-index.ts
```

- [ ] **Step 7: Verify build emits the index**

```bash
pnpm -F @zkqes/web build 2>&1 | head -10
ls -la packages/web/src/generated/qtsp-index.ts
```

Expected: file exists, contains UA/Diia entry.

- [ ] **Step 8: Commit**

```bash
git add packages/web/vite/plugin-qtsp-index.ts packages/web/vite/plugin-qtsp-index.test.ts \
        packages/web/vite.config.ts .gitignore
git commit -m "feat(web): vite plugin emits qtsp-index.ts from fixtures/trust/"
```

---

## Task 6: i18n keys for facade

**Files:**
- Modify: `packages/web/src/i18n/en.json`
- Modify: `packages/web/src/i18n/uk.json`

- [ ] **Step 1: Write the failing parity test**

The existing `tests/unit/i18n.parity.test.ts` already tests parity. Add a new test file or extend existing for `qtsp.*` namespace presence:

`packages/web/tests/unit/i18n.qtsp.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import uk from '../../src/i18n/uk.json';

describe('qtsp.* i18n keys', () => {
  const required = [
    'qtsp.state.bronze',
    'qtsp.state.silver',
    'qtsp.state.gold',
    'qtsp.state.live',
    'qtsp.tile.notLive',
    'qtsp.drawer.helpVerify',
    'qtsp.drawer.notifyMe',
    'qtsp.page.about',
    'qtsp.page.signing',
    'qtsp.page.parserStatus',
    'qtsp.page.samplesLedger',
    'qtsp.page.trustAnchors',
    'qtsp.page.cta.silver',
    'qtsp.page.cta.gold',
    'qtsp.page.cta.live',
    'errors.cert.berInput',
    'errors.cert.berInputGeneric',
  ];

  for (const key of required) {
    it(`en has ${key}`, () => {
      expect(get(en, key)).toBeDefined();
    });
    it(`uk has ${key}`, () => {
      expect(get(uk, key)).toBeDefined();
    });
  }
});

function get(obj: unknown, dotpath: string): unknown {
  return dotpath.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/web test tests/unit/i18n.qtsp.test.ts
```

Expected: FAIL with all 17 keys missing.

- [ ] **Step 3: Add keys to en.json**

```jsonc
{
  "qtsp": {
    "state": { "bronze": "Documented", "silver": "In integration", "gold": "Ready for testnet", "live": "Live" },
    "tile": { "notLive": "Click for status & contribute" },
    "drawer": {
      "helpVerify": "Help us verify this QTSP",
      "notifyMe": "Notify me when {{qtspName}} is ready"
    },
    "page": {
      "about": "About this QTSP",
      "signing": "Recommended signing tool",
      "parserStatus": "Parser status",
      "samplesLedger": "Verified samples",
      "trustAnchors": "Trust anchors",
      "cta": {
        "silver": "Notify me when ready",
        "gold": "Try on testnet",
        "live": "Register"
      }
    }
  },
  "errors": {
    "cert": {
      "berInput": "Your {{qtspName}} certificate is non-canonically encoded ({{reason}}). zkqes currently requires strict DER. Please re-issue from {{qtspUrl}} or contact us if this persists.",
      "berInputGeneric": "Your certificate is non-canonically encoded ({{reason}}). zkqes currently requires strict DER. See /countries for supported QTSPs."
    }
  }
}
```

- [ ] **Step 4: Add parity keys to uk.json**

Translate the strings into Ukrainian. Lead reviews with native speaker per CLAUDE.md invariant 2 before commit.

- [ ] **Step 5: Run parity tests**

```bash
pnpm -F @zkqes/web test tests/unit/i18n
```

Expected: PASS for both `i18n.parity.test.ts` and `i18n.qtsp.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/i18n packages/web/tests/unit/i18n.qtsp.test.ts
git commit -m "feat(web): qtsp.* i18n namespace + cert.berInput error keys"
```

---

## Task 7: QtspTile component

**Files:**
- Create: `packages/web/src/components/qtsp/QtspTile.tsx`
- Create: `packages/web/tests/unit/QtspTile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QtspTile } from '../../src/components/qtsp/QtspTile';
import { I18nProvider } from '../../src/i18n/I18nProvider'; // existing test util

const meta = {
  country: 'IT', qtspSlug: 'aruba-pec', displayName: 'Aruba PEC',
  state: 'bronze' as const, qtspUrl: 'https://www.pec.it/',
  /* ... rest of fixture ... */
};

describe('QtspTile', () => {
  it('renders displayName + flag for bronze tile', () => {
    render(<I18nProvider><QtspTile meta={meta} onClick={vi.fn()} /></I18nProvider>);
    expect(screen.getByText('Aruba PEC')).toBeInTheDocument();
    expect(screen.getByLabelText('Italy')).toBeInTheDocument();
    expect(screen.getByText('Documented')).toBeInTheDocument();
  });

  it('calls onClick with meta on click', () => {
    const onClick = vi.fn();
    render(<I18nProvider><QtspTile meta={meta} onClick={onClick} /></I18nProvider>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledWith(meta);
  });

  it('applies state-specific styling class', () => {
    const { container } = render(
      <I18nProvider><QtspTile meta={{ ...meta, state: 'live' }} onClick={vi.fn()} /></I18nProvider>
    );
    expect(container.querySelector('[data-state="live"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/web test tests/unit/QtspTile.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement QtspTile**

Civic-terminal aesthetic per BRAND.md surface grammar v2 — VT323 display font for the QTSP name, IBM Plex Mono for the state label. State-distinct chrome:
- bronze: dotted outline.
- silver: dashed outline + low-saturation accent stroke.
- gold: solid outline + accent stroke.
- live: solid outline + filled state badge (green-on-black).

Country flag rendered as a Twemoji `<img>` (pulled at build time, no runtime fetch). Tile is a `<button>` for keyboard accessibility.

- [ ] **Step 4: Run tests to verify PASS**

```bash
pnpm -F @zkqes/web test tests/unit/QtspTile.test.tsx
```

Expected: PASS, all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/qtsp/QtspTile.tsx packages/web/tests/unit/QtspTile.test.tsx
git commit -m "feat(web): QtspTile component for country-grid"
```

---

## Task 8: QtspDrawer component (bronze tile interaction)

**Files:**
- Create: `packages/web/src/components/qtsp/QtspDrawer.tsx`
- Create: `packages/web/tests/unit/QtspDrawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Test cases:
- Drawer renders QTSP displayName + country flag + state badge.
- "Help us verify" button has correct GitHub issue link with `template=help-add-qtsp.md&qtsp=it/aruba-pec` query.
- "Notify me" form writes to `localStorage` under `zkqes.qtsp.notify.<cc>/<slug>` on submit.
- Closing drawer clears focus to invocation point (a11y).

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm -F @zkqes/web test tests/unit/QtspDrawer.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement QtspDrawer**

Right-edge slide-in panel. Uses existing modal/drawer primitive from web's component library. Sections:
1. Header strip — flag, displayName, state badge.
2. About — `meta.notes` text.
3. CTAs — "Help us verify" (opens GitHub issue link in new tab) + "Notify me" (form + submit).
4. Close button (Esc + overlay click + button).

- [ ] **Step 4: Run tests to verify PASS**

```bash
pnpm -F @zkqes/web test tests/unit/QtspDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/qtsp/QtspDrawer.tsx packages/web/tests/unit/QtspDrawer.test.tsx
git commit -m "feat(web): QtspDrawer for bronze-tile interaction"
```

---

## Task 9: CountryGrid + filter chips

**Files:**
- Create: `packages/web/src/components/qtsp/CountryGrid.tsx`
- Create: `packages/web/src/lib/qtspIndex.ts` (helpers)
- Create: `packages/web/tests/unit/CountryGrid.test.tsx`
- Create: `packages/web/tests/unit/qtspIndex.test.ts`

- [ ] **Step 1: Write the failing test for qtspIndex helpers**

```ts
import { describe, it, expect } from 'vitest';
import { groupByRegion, filterByState, getQtspByPath } from '../../src/lib/qtspIndex';
import type { QtspMeta } from '@zkqes/sdk';

const fixtures: QtspMeta[] = [/* synthetic UA, IT, DE, FI tiles */];

describe('qtspIndex helpers', () => {
  it('groups by ISO region', () => {
    const groups = groupByRegion(fixtures);
    expect(Object.keys(groups)).toEqual(['EASTERN_EU', 'NORDICS', 'SOUTHERN_EU', 'CENTRAL_EU']);
    // ... assertions per region
  });
  it('filters by state', () => {
    expect(filterByState(fixtures, 'bronze')).toHaveLength(/* N */);
  });
  it('looks up by `<cc>/<slug>` path', () => {
    expect(getQtspByPath(fixtures, 'IT/aruba-pec')?.displayName).toBe('Aruba PEC');
  });
});
```

- [ ] **Step 2: Run test to verify FAIL → implement helpers → PASS**

Implement `qtspIndex.ts` with:
- `groupByRegion(metas)`: ISO region grouping (Nordics: NO/SE/DK/FI/IS, Central: AT/DE/CH/PL/CZ/SK, Southern: ES/IT/PT/GR/MT/CY, Eastern: BG/RO/HU/UA/EE/LV/LT/SI/HR, Western: FR/BE/NL/LU/IE).
- `filterByState(metas, state)`: simple filter.
- `getQtspByPath(metas, path)`: case-insensitive `<cc>/<slug>` lookup.

- [ ] **Step 3: Write the failing test for CountryGrid**

Test cases:
- Renders all tiles from `QTSP_INDEX`, grouped by region.
- Filter chip click filters tiles in real time.
- Clicking a bronze tile opens drawer.
- Clicking a silver/gold/live tile navigates to `/qtsp/<cc>/<slug>`.

- [ ] **Step 4: Implement CountryGrid → run tests → PASS**

Component reads `QTSP_INDEX` from `src/generated/qtsp-index.ts`. Filter chips set local state. Renders region sections with `QtspTile` children. Drawer state managed locally (one drawer at a time).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/qtsp packages/web/src/lib/qtspIndex.ts packages/web/tests/unit
git commit -m "feat(web): CountryGrid + filter chips + qtspIndex helpers"
```

---

## Task 10: Per-QTSP page route

**Files:**
- Create: `packages/web/src/routes/qtspPage.tsx`
- Create: `packages/web/tests/unit/qtspPage.test.tsx`
- Modify: `packages/web/src/router.tsx` (add to `sharedRoutes`)

- [ ] **Step 1: Write the failing test**

Test cases:
- Renders header strip + about + signing + parser status + CTA.
- Lazy-loads `samples.json` on mount (mock fetch); ledger renders rows.
- Lazy-loads `intermediates/*.pem` list (mock fetch).
- Bronze tile (404) → redirect to `/countries#coverage`.
- Unknown slug → 404 page.
- CTA respects state (silver: notify me, gold: testnet flow, live: register flow).

- [ ] **Step 2: Run test to verify FAIL**

- [ ] **Step 3: Implement QtspPage**

Route loader pulls meta from `QTSP_INDEX`. Lazy fetches happen via React Query (already in repo). Layout follows spec §4.3.

- [ ] **Step 4: Add route to `sharedRoutes`**

`packages/web/src/router.tsx`:
```ts
const qtspPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'qtsp/$country/$qtsp',
  component: lazyRouteComponent(() => import('./routes/qtspPage')),
});

sharedRoutes.push(qtspPageRoute);
```

Per CLAUDE.md invariant 21, `lazyRouteComponent` keeps the page out of the landing entry chunk.

- [ ] **Step 5: Run tests → PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/routes/qtspPage.tsx packages/web/src/router.tsx packages/web/tests
git commit -m "feat(web): per-QTSP page route /qtsp/\$country/\$qtsp"
```

---

## Task 11: /countries redirect

**Files:**
- Create: `packages/web/src/routes/countriesRedirect.tsx`
- Create: `packages/web/tests/unit/countriesRedirect.test.tsx`
- Modify: `packages/web/src/router.tsx` (add to `sharedRoutes`)

- [ ] **Step 1: Write the failing test**

```tsx
it('redirects /countries to /#coverage on mount', () => {
  // render with TanStack memory router at /countries
  // assert location after first frame is '/' with hash '#coverage'
});
```

- [ ] **Step 2: Run test → FAIL → implement → PASS**

`countriesRedirect.tsx` — `useEffect` calls `router.navigate({ to: '/', hash: 'coverage', replace: true })` on mount.

- [ ] **Step 3: Add route to sharedRoutes**

- [ ] **Step 4: Verify GH Pages compatibility**

The 404→index.html SPA fallback (CLAUDE.md invariant 22) ensures `/countries` direct loads work — index.html boots, TanStack resolves `/countries`, redirect fires.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): /countries redirect to landing #coverage anchor"
```

---

## Task 12: Land CountryGrid into Landing surface

**Files:**
- Modify: `packages/web/src/routes/index.tsx` (Landing)
- Modify: `packages/web/tests/unit/Landing.test.tsx` (existing — extend)

- [ ] **Step 1: Write the failing assertion in existing Landing test**

```tsx
it('renders European Coverage section between hero and path cards', () => {
  render(<Landing />);
  const sections = screen.getAllByRole('region');
  const heroIdx = sections.findIndex((s) => s.dataset.section === 'hero');
  const coverageIdx = sections.findIndex((s) => s.dataset.section === 'coverage');
  const pathCardsIdx = sections.findIndex((s) => s.dataset.section === 'path-cards');
  expect(coverageIdx).toBeGreaterThan(heroIdx);
  expect(coverageIdx).toBeLessThan(pathCardsIdx);
});

it('exposes #coverage anchor', () => {
  render(<Landing />);
  expect(document.getElementById('coverage')).not.toBeNull();
});
```

- [ ] **Step 2: Run test → FAIL → modify Landing → PASS**

Insert `<CountryGrid id="coverage" />` between hero and path cards.

Hero copy update — replace UA-only headline with "qualified electronic signatures across eIDAS Europe" (lead/marketer reviews wording before commit).

- [ ] **Step 3: Run Playwright smoke**

```bash
pnpm -F @zkqes/web exec playwright test --project=smoke
```

Expected: PASS (no boot regressions).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): land CountryGrid section on Landing between hero + path cards"
```

---

## Task 13: ?qtsp param threading in /v5/registerV5

**Files:**
- Modify: `packages/web/src/routes/v5/registerV5.tsx`
- Modify: `packages/web/tests/unit/registerV5.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('reads ?qtsp=ua/diia and scopes copy to Diia', () => {
  render(<RegisterV5Screen searchParams={{ qtsp: 'ua/diia' }} />);
  expect(screen.getByText(/Diia mobile app/)).toBeInTheDocument();
});

it('falls back to UA-default when ?qtsp is malformed', () => {
  render(<RegisterV5Screen searchParams={{ qtsp: 'this-is-garbage' }} />);
  expect(screen.getByText(/Diia/)).toBeInTheDocument(); // UA default
});

it('falls back to UA-default when ?qtsp refers to bronze tile', () => {
  render(<RegisterV5Screen searchParams={{ qtsp: 'it/aruba-pec' }} />); // bronze
  expect(screen.getByText(/Diia/)).toBeInTheDocument(); // UA default
});
```

- [ ] **Step 2: Run test → FAIL → wire param → PASS**

Use TanStack Router's search-param API. Look up via `getQtspByPath(QTSP_INDEX, param)`. Validate state ∈ {silver, gold, live}; on mismatch fall back. Thread the resolved `meta` through `RegisterV5Screen` props for signing-tool copy, error i18n context.

- [ ] **Step 3: Verify guard error i18n threading**

When `parseP7s` throws `cert.berInput`, the error boundary in registerV5 reads the active QTSP scope and resolves the i18n key with `qtspName`/`qtspUrl` interpolation. Add a test for this.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): /v5/registerV5 reads ?qtsp= and scopes copy to QTSP"
```

---

## Task 14: Build-time index integration tests

**Files:**
- Create: `packages/web/tests/integration/qtsp-index.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { QtspMetaSchema } from '@zkqes/sdk';

const REPO_ROOT = resolve(__dirname, '../../../..');
const TRUST = resolve(REPO_ROOT, 'fixtures/trust');

describe('fixtures/trust integrity', () => {
  const ccs = readdirSync(TRUST);

  for (const cc of ccs) {
    for (const slug of readdirSync(join(TRUST, cc))) {
      const dir = join(TRUST, cc, slug);
      if (!existsSync(join(dir, 'meta.json'))) continue;

      describe(`${cc}/${slug}`, () => {
        const raw = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
        const meta = QtspMetaSchema.parse(raw);

        it('country uppercase matches directory', () => {
          expect(meta.country.toLowerCase()).toBe(cc);
        });

        it('qtspSlug matches directory', () => {
          expect(meta.qtspSlug).toBe(slug);
        });

        if (meta.state === 'silver' || meta.state === 'gold' || meta.state === 'live') {
          it('has intermediates/', () => {
            expect(existsSync(join(dir, 'intermediates'))).toBe(true);
            expect(readdirSync(join(dir, 'intermediates')).length).toBeGreaterThan(0);
          });

          it('has samples.json with ≥3 entries', () => {
            const samples = JSON.parse(readFileSync(join(dir, 'samples.json'), 'utf8'));
            expect(Array.isArray(samples)).toBe(true);
            expect(samples.length).toBeGreaterThanOrEqual(3);
          });

          it('every sample is parserWalk:pass + derStrict:pass', () => {
            const samples = JSON.parse(readFileSync(join(dir, 'samples.json'), 'utf8'));
            for (const s of samples) {
              expect(s.parserWalk).toBe('pass');
              expect(s.derStrict).toBe('pass');
            }
          });
        }

        if (meta.state === 'gold' || meta.state === 'live') {
          it('has root.json + trusted-cas.json', () => {
            expect(existsSync(join(dir, 'root.json'))).toBe(true);
            expect(existsSync(join(dir, 'trusted-cas.json'))).toBe(true);
          });
        }
      });
    }
  }
});
```

- [ ] **Step 2: Run test → expected PASS for the migrated UA/Diia entry**

```bash
pnpm -F @zkqes/web test tests/integration/qtsp-index.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/integration/qtsp-index.test.ts
git commit -m "test(web): fixtures/trust integrity test"
```

---

## Task 15: Landing bundle size reach test

**Files:**
- Create: `packages/web/tests/build/landing-bundle-size.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

describe('landing bundle size budget', () => {
  it('entry chunk ≤ 2.7 MB', () => {
    execSync('pnpm -F @zkqes/web build', {
      env: { ...process.env, VITE_TARGET: 'landing', VITE_BASE: '/' },
      stdio: 'inherit',
    });
    const dist = resolve(__dirname, '../../dist/assets');
    const entries = readdirSync(dist).filter((f) => f.startsWith('index-') && f.endsWith('.js'));
    expect(entries).toHaveLength(1);
    const size = statSync(resolve(dist, entries[0]!)).size;
    expect(size).toBeLessThan(2.7 * 1024 * 1024);
  });
}, { timeout: 120_000 });
```

- [ ] **Step 2: Run → PASS (or fail loud if budget overrun)**

```bash
pnpm -F @zkqes/web test tests/build/landing-bundle-size.test.ts
```

If FAIL: investigate which lazy-import broke (likely a top-level `import` of `qtspPage` somewhere instead of `lazyRouteComponent`).

- [ ] **Step 3: Add to nightly Playwright workflow**

`.github/workflows/playwright.yml` nightly tier — extend to also run this test.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(web): landing bundle size budget test (≤2.7 MB)"
```

---

## Task 16: GitHub issue template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/help-add-qtsp.md`

- [ ] **Step 1: Write the template**

```markdown
---
name: Help add a QTSP
about: Help us verify support for a Qualified Trust Service Provider
title: "[QTSP] <country>/<qtsp-slug>"
labels: ['qtsp', 'help-wanted']
---

## Which QTSP?

- **Country (ISO 3166-1 alpha-2):**
- **QTSP display name:**
- **Public website:**
- **eIDAS LOTL entry:**
- **Recommended signing tool + URL:**

## Are you offering to contribute?

- [ ] I can collect ≥3 real `.p7s` samples from this QTSP (different signers).
- [ ] I can run the local `promote-qtsp` script and submit the resulting fixtures.
- [ ] I'm just flagging that this QTSP should be supported.

## Anything else we should know?

(Cert format quirks, signing-tool versions, partnership opportunities, etc.)
```

- [ ] **Step 2: Verify drawer "Help us verify" link works**

Drawer link format: `https://github.com/<owner>/<repo>/issues/new?template=help-add-qtsp.md&title=%5BQTSP%5D%20it%2Faruba-pec&body=Country%20...`. Smoke-test by clicking from the drawer in dev.

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/help-add-qtsp.md
git commit -m "ci: GitHub issue template for QTSP help-wanted contributions"
```

---

## Task 17: promote-qtsp stub script

**Files:**
- Create: `packages/sdk/scripts/promote-qtsp.ts`
- Create: `packages/sdk/scripts/promote-qtsp.test.ts`
- Modify: `packages/sdk/package.json` (script bin)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { promoteQtsp } from './promote-qtsp';
import { mintSyntheticP7s } from '../tests/fixtures/synth-p7s';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('promoteQtsp', () => {
  it('emits samples.json + intermediates/*.pem from synthetic .p7s files', async () => {
    const samples = [mintSyntheticP7s({ profile: 'diia' }), mintSyntheticP7s({ profile: 'diia' }), mintSyntheticP7s({ profile: 'diia' })];
    const out = mkdtempSync(join(tmpdir(), 'promote-'));
    await promoteQtsp({ country: 'UA', qtspSlug: 'diia', samples, outDir: out });
    const samplesJson = JSON.parse(readFileSync(join(out, 'samples.json'), 'utf8'));
    expect(samplesJson).toHaveLength(3);
    expect(samplesJson[0]).toMatchObject({ parserWalk: 'pass', derStrict: 'pass' });
  });

  it('flags non-strict-DER inputs in samples.json', async () => {
    const samples = [mintSyntheticP7s({ profile: 'diia', berCorrupt: true })];
    const out = mkdtempSync(join(tmpdir(), 'promote-'));
    await promoteQtsp({ country: 'UA', qtspSlug: 'diia', samples, outDir: out });
    const samplesJson = JSON.parse(readFileSync(join(out, 'samples.json'), 'utf8'));
    expect(samplesJson[0].derStrict).toMatch(/^fail-/);
  });
});
```

- [ ] **Step 2: Implement the script**

`packages/sdk/scripts/promote-qtsp.ts`:

```ts
import { Buffer } from 'buffer';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { isStrictDER } from '../src/cert/der-strict';
import { parseP7s } from '../src/witness/v5/parse-p7s';

export interface PromoteArgs {
  country: string;
  qtspSlug: string;
  samples: Buffer[];      // raw .p7s bytes; never written to disk
  outDir: string;         // writes samples.json + intermediates/*.pem here
}

export async function promoteQtsp(args: PromoteArgs): Promise<void> {
  mkdirSync(join(args.outDir, 'intermediates'), { recursive: true });

  const samplesJson = [];
  const seenIntermediates = new Map<string, Buffer>();

  for (const p7s of args.samples) {
    const sha = '0x' + createHash('sha256').update(p7s).digest('hex');
    const derGuard = isStrictDER(new Uint8Array(p7s.buffer, p7s.byteOffset, p7s.length));
    const derStrict = derGuard.ok ? 'pass' : `fail-${derGuard.reason}`;

    let parserWalk = 'pass';
    let leafCertNotBefore: string | null = null;
    let leafCertNotAfter: string | null = null;
    if (derGuard.ok) {
      try {
        const parsed = parseP7s(p7s);
        if (parsed.intCertDer) {
          const fp = createHash('sha256').update(parsed.intCertDer).digest('hex').slice(0, 16);
          if (!seenIntermediates.has(fp)) seenIntermediates.set(fp, parsed.intCertDer);
        }
        // ... extract leafCertNotBefore/After from parsed.leafCertDer
      } catch (e) {
        parserWalk = `fail-${(e as Error).message.slice(0, 80)}`;
      }
    }

    samplesJson.push({
      p7sSha256: sha,
      leafCertNotBefore,
      leafCertNotAfter,
      parserWalk,
      derStrict,
      witnessGen: 'n/a',
      contributor: process.env.GITHUB_ACTOR ?? 'unknown',
      addedAt: new Date().toISOString().slice(0, 10),
    });
  }

  for (const [fp, der] of seenIntermediates) {
    const pem = derToPem(der, 'CERTIFICATE');
    writeFileSync(join(args.outDir, 'intermediates', `${fp}.pem`), pem);
  }
  writeFileSync(join(args.outDir, 'samples.json'), JSON.stringify(samplesJson, null, 2) + '\n');
}

function derToPem(der: Buffer, label: string): string {
  const b64 = der.toString('base64').match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}
```

CLI wrapper in same file or a separate `bin.ts`:
```ts
#!/usr/bin/env tsx
// Reads --country, --qtsp, --samples (glob); never writes the .p7s out.
```

- [ ] **Step 3: Run tests → PASS**

- [ ] **Step 4: Add bin script to package.json**

```jsonc
{
  "bin": { "promote-qtsp": "scripts/promote-qtsp-bin.ts" }
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sdk): promote-qtsp script for bronze→silver evidence generation"
```

---

## Task 18: Initial founder-curated bronze seed

**Files:**
- Create: `fixtures/trust/it/aruba-pec/meta.json`
- Create: `fixtures/trust/de/d-trust/meta.json`
- Create: `fixtures/trust/es/fnmt/meta.json`
- (Or whichever 3+ QTSPs the founder defends — final list determined out-of-band.)

- [ ] **Step 1: Founder selects N≥3 bronze QTSPs**

Lead asks founder for the seed list. Each must be: real eIDAS LOTL entry, public signing tool, founder can defend the claim in a 1-minute conversation.

- [ ] **Step 2: Author each meta.json**

Per the schema, with `state: "bronze"`, `addedAt: "2026-05-05"`, `promotedAt: null`, accurate `qtspUrl` + `signingTool` fields, and a `notes` line summarizing the QTSP's eIDAS context.

- [ ] **Step 3: Run integration test**

```bash
pnpm -F @zkqes/web test tests/integration/qtsp-index.test.ts
```

Expected: PASS, all new entries validate.

- [ ] **Step 4: Verify Landing renders the new tiles**

```bash
pnpm -F @zkqes/web build
pnpm -F @zkqes/web preview
# Open localhost:4173, scroll to #coverage, confirm bronze tiles render
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/trust
git commit -m "fixtures(trust): founder-curated bronze seed (≥3 QTSPs)"
```

---

## Task 19: Final review + merge

- [ ] **Step 1: Full test suite**

```bash
pnpm -F @zkqes/sdk test typecheck
pnpm -F @zkqes/web test typecheck build
pnpm -F @zkqes/web exec playwright test --project=smoke --project=flow
```

Expected: All green.

- [ ] **Step 2: Bundle size verification**

```bash
pnpm -F @zkqes/web test tests/build/landing-bundle-size.test.ts
```

Expected: PASS, entry chunk well under 2.7 MB.

- [ ] **Step 3: Visual smoke against built bundle**

```bash
pnpm -F @zkqes/web preview
# Manual: open localhost:4173, scroll to #coverage, click bronze + live tiles, verify drawer + page render correctly.
```

- [ ] **Step 4: Lead reviews UA i18n with native speaker**

CLAUDE.md invariant 2 — uk.json `qtsp.*` keys reviewed before merge.

- [ ] **Step 5: Merge to main**

```bash
git checkout main
git merge --no-ff feat/multi-qtsp-facade -m "merge: multi-QTSP facade — per-QTSP tiles + DER-strict guard"
git tag v0.7.1-multi-qtsp-facade
```

- [ ] **Step 6: Deploy**

GH Pages workflow auto-runs on main. Verify `zkqes.org` renders the coverage section with all bronze + live tiles.

---

## Verification checklist (post-merge)

- [ ] zkqes.org renders the coverage section between hero and path cards.
- [ ] All bronze tiles open the drawer with correct QTSP info.
- [ ] All silver/gold/live tiles navigate to `/qtsp/<cc>/<qtsp-slug>`.
- [ ] `/countries` redirects to `/#coverage`.
- [ ] `/v5/registerV5?qtsp=ua/diia` scopes copy to Diia (live tile).
- [ ] `/v5/registerV5?qtsp=it/aruba-pec` falls back to UA-default (bronze tile).
- [ ] Existing UA happy-path Playwright e2e is byte-identical.
- [ ] Landing entry chunk ≤2.7 MB.
- [ ] DER-strict guard catches a hand-crafted BER `.p7s` upload with the right error string.

## Followup specs (NOT in scope here)

- Per-QTSP circuit-coverage (one followup spec per QTSP graduating bronze→silver→gold).
- Per-QTSP registry deploy (per CLAUDE.md per-country-registries plan).
- Phase B real Phase 2 ceremony bound into fresh registry redeploy (existing pending task #8).
- "Notify me" backend integration.
- App target deploy (`app.zkqes.org`) inheriting these routes post-§9.4.
