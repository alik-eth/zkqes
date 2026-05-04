# Civic-terminal v2 — lead worker plan

> **For agentic workers:** This is the **lead** plan. Lead executes inline (no subagent dispatch); steps use checkbox (`- [ ]`) syntax for tracking. Read [orchestration plan §2](2026-05-04-zkqes-civic-terminal-v2-orchestration.md#2-interface-contracts-frozen--do-not-drift-without-lead-broadcast) before starting Task 1.

**Goal:** Bump ceremony-coord status.json schema with a `phase` field, thread the phase write through `round-zero.ts` + `publish-status.ts`, and amend `BRAND.md` with v1+v2 surface grammar.

**Architecture:** Additive schema change — the existing `CeremonyStatusPayload` keeps every field; we add one optional-on-read, required-on-write `phase: 'recruiting' | 'ceremony-live' | 'live'` discriminator. Lead writes; web-eng reads. The web mirror at `packages/web/src/lib/ceremonyStatus.ts` is kept byte-identical.

**Tech Stack:** TypeScript (Node 20, tsx), R2 SDK (`@aws-sdk/client-s3`), pnpm 9.x, vitest.

**Tasks here:** 4 — L1 (schema bump in ceremony-coord), L2 (web mirror sync), L3 (round-zero + publish-status wire), L4 (BRAND.md amendment).

---

## File map

| File                                                  | Owner | Action                                                |
|-------------------------------------------------------|-------|-------------------------------------------------------|
| `scripts/ceremony-coord/src/types.ts`                 | lead  | Modify — add `phase` field + validator                |
| `scripts/ceremony-coord/src/types.test.ts`            | lead  | Create — vitest unit for phase validator              |
| `scripts/ceremony-coord/scripts/round-zero.ts`        | lead  | Modify — write `phase: 'recruiting'`                  |
| `scripts/ceremony-coord/scripts/publish-status.ts`    | lead  | Modify — add `--phase` flag + auto-derive            |
| `scripts/ceremony-coord/scripts/publish-status.test.ts` | lead | Create — vitest unit for `--phase` flag handling     |
| `packages/web/src/lib/ceremonyStatus.ts`              | lead  | Modify — mirror schema bump (web-side)                |
| `packages/web/src/lib/ceremonyStatus.test.ts`         | lead  | Modify — add backwards-compat phase derivation tests  |
| `BRAND.md`                                            | lead  | Modify — append v1+v2 surface-grammar section         |

## Task 1 — Add `phase` field to `CeremonyStatusPayload`

**Files:**
- Modify: `scripts/ceremony-coord/src/types.ts`
- Create: `scripts/ceremony-coord/src/types.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ceremony-coord/src/types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  validateStatusPayload,
  derivePhase,
  type CeremonyStatusPayload,
} from './types.ts';

const baseRecruiting: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('validateStatusPayload (phase)', () => {
  it('accepts a valid recruiting payload', () => {
    expect(() => validateStatusPayload(baseRecruiting)).not.toThrow();
  });

  it('accepts a valid ceremony-live payload', () => {
    const p = { ...baseRecruiting, round: 3, phase: 'ceremony-live' as const };
    expect(() => validateStatusPayload(p)).not.toThrow();
  });

  it('accepts a valid live payload', () => {
    const p = {
      ...baseRecruiting,
      round: 10,
      finalZkeySha256: '0xabc',
      beaconBlockHeight: 21000000,
      beaconHash: '0xdef',
      phase: 'live' as const,
    };
    expect(() => validateStatusPayload(p)).not.toThrow();
  });

  it('rejects unknown phase string', () => {
    const p = { ...baseRecruiting, phase: 'pre-launch' };
    expect(() => validateStatusPayload(p)).toThrow(/phase/);
  });

  it('rejects missing phase', () => {
    const { phase: _omit, ...p } = baseRecruiting;
    expect(() => validateStatusPayload(p)).toThrow(/phase/);
  });
});

describe('derivePhase (backwards-compat for old payloads)', () => {
  it('derives recruiting when round=0, beacon empty', () => {
    expect(derivePhase({ round: 0, finalZkeySha256: null })).toBe('recruiting');
  });

  it('derives ceremony-live when round>=1, finalZkey empty', () => {
    expect(derivePhase({ round: 3, finalZkeySha256: null })).toBe('ceremony-live');
  });

  it('derives live when finalZkey populated', () => {
    expect(derivePhase({ round: 10, finalZkeySha256: '0xabc' })).toBe('live');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /data/Develop/identityescroworg/scripts/ceremony-coord
pnpm vitest run src/types.test.ts
```

Expected: FAIL — `derivePhase` not exported, `validateStatusPayload` doesn't check `phase`.

- [ ] **Step 3: Implement schema bump**

Edit `scripts/ceremony-coord/src/types.ts`. Add `phase` to the interface and a `derivePhase` helper, and extend the validator:

```typescript
// Mirror of `packages/web/src/lib/ceremonyStatus.ts` — the JSON shape of
// `status.json` published to R2. The web frontend polls + parses this.
//
// Don't change types here without updating the web file in lockstep; both
// sides MUST byte-deserialize identical objects.

export type CeremonyPhase = 'recruiting' | 'ceremony-live' | 'live';

export interface CeremonyContributor {
  readonly name: string;
  readonly round: number;
  readonly profileUrl?: string;
  readonly attestation?: string;
  readonly completedAt: string;
}

export interface CeremonyStatusPayload {
  readonly round: number;
  readonly totalRounds: number;
  readonly contributors: readonly CeremonyContributor[];
  readonly currentRoundOpenedAt?: string;
  readonly finalZkeySha256: string | null;
  readonly beaconBlockHeight: number | null;
  readonly beaconHash: string | null;
  // v2 (2026-05-04 spec): phase discriminator drives all UI state machines.
  // `recruiting` = round-zero seeded but no Phase 2 round 1 yet.
  // `ceremony-live` = round 1+ in flight; `live` = final zkey + beacon applied.
  readonly phase: CeremonyPhase;
}

const KNOWN_PHASES: readonly CeremonyPhase[] = ['recruiting', 'ceremony-live', 'live'];

export type CeremonyState = 'planned' | 'in-progress' | 'complete';

export function deriveCeremonyState(p: CeremonyStatusPayload): CeremonyState {
  if (p.finalZkeySha256 !== null) return 'complete';
  if (p.round >= 1 && p.contributors.length > 0) return 'in-progress';
  return 'planned';
}

/**
 * Derives the v2 `phase` from legacy fields. Used as the read-side
 * fallback when an older R2 payload lacks the explicit `phase` field.
 * Forward-write paths must always set `phase` explicitly via
 * `publish-status.ts --phase` or via auto-derivation at write time.
 */
export function derivePhase(p: Pick<CeremonyStatusPayload, 'round' | 'finalZkeySha256'>): CeremonyPhase {
  if (p.finalZkeySha256 !== null) return 'live';
  if (p.round >= 1) return 'ceremony-live';
  return 'recruiting';
}

export function validateStatusPayload(p: unknown): asserts p is CeremonyStatusPayload {
  if (typeof p !== 'object' || p === null) throw new Error('not an object');
  const o = p as Record<string, unknown>;
  if (typeof o.round !== 'number') throw new Error('round not a number');
  if (typeof o.totalRounds !== 'number') throw new Error('totalRounds not a number');
  if (!Array.isArray(o.contributors)) throw new Error('contributors not an array');
  if (o.finalZkeySha256 !== null && typeof o.finalZkeySha256 !== 'string')
    throw new Error('finalZkeySha256 not string|null');
  if (o.beaconBlockHeight !== null && typeof o.beaconBlockHeight !== 'number')
    throw new Error('beaconBlockHeight not number|null');
  if (o.beaconHash !== null && typeof o.beaconHash !== 'string')
    throw new Error('beaconHash not string|null');
  if (typeof o.phase !== 'string' || !KNOWN_PHASES.includes(o.phase as CeremonyPhase))
    throw new Error(`phase must be one of ${KNOWN_PHASES.join('|')}; got ${String(o.phase)}`);
  for (const [i, c] of (o.contributors as unknown[]).entries()) {
    if (typeof c !== 'object' || c === null) throw new Error(`contributors[${i}] not object`);
    const cc = c as Record<string, unknown>;
    if (typeof cc.name !== 'string') throw new Error(`contributors[${i}].name not string`);
    if (typeof cc.round !== 'number') throw new Error(`contributors[${i}].round not number`);
    if (typeof cc.completedAt !== 'string') throw new Error(`contributors[${i}].completedAt not string`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /data/Develop/identityescroworg/scripts/ceremony-coord
pnpm vitest run src/types.test.ts
```

Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
cd /data/Develop/identityescroworg
git add scripts/ceremony-coord/src/types.ts scripts/ceremony-coord/src/types.test.ts
git commit -m "feat(ceremony-coord): add CeremonyPhase + status.json phase field

v2 civic-terminal: introduces 'recruiting' / 'ceremony-live' / 'live'
phase discriminator on status.json. Validator now requires phase;
derivePhase() helper for read-side backwards compat with pre-v2
R2 payloads. Web mirror updated in next commit."
```

---

## Task 2 — Mirror schema bump in web-side `ceremonyStatus.ts`

**Files:**
- Modify: `packages/web/src/lib/ceremonyStatus.ts`
- Modify: `packages/web/src/lib/ceremonyStatus.test.ts` (extend existing tests)

- [ ] **Step 1: Inspect the existing web file**

```bash
cat packages/web/src/lib/ceremonyStatus.ts | head -80
```

Note current shape — the file should be a near-byte-mirror of `scripts/ceremony-coord/src/types.ts`. If existing tests live at `packages/web/src/lib/ceremonyStatus.test.ts`, extend them; otherwise create a new test file alongside.

- [ ] **Step 2: Write failing tests for the web mirror**

Add to `packages/web/src/lib/ceremonyStatus.test.ts` (or create if absent):

```typescript
import { describe, expect, it } from 'vitest';
import {
  validateStatusPayload,
  derivePhase,
  parseStatusPayload,
  type CeremonyStatusPayload,
} from './ceremonyStatus';

const baseRecruiting: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('parseStatusPayload (web mirror; backwards-compat read)', () => {
  it('returns the payload as-is when phase is present', () => {
    const parsed = parseStatusPayload(baseRecruiting);
    expect(parsed.phase).toBe('recruiting');
  });

  it('derives phase=recruiting when phase is missing and round=0', () => {
    const { phase: _omit, ...legacy } = baseRecruiting;
    const parsed = parseStatusPayload(legacy);
    expect(parsed.phase).toBe('recruiting');
  });

  it('derives phase=ceremony-live when phase missing and round>=1', () => {
    const { phase: _omit, ...legacy } = { ...baseRecruiting, round: 4 };
    const parsed = parseStatusPayload(legacy);
    expect(parsed.phase).toBe('ceremony-live');
  });

  it('derives phase=live when phase missing and finalZkey populated', () => {
    const { phase: _omit, ...legacy } = {
      ...baseRecruiting,
      round: 10,
      finalZkeySha256: '0xabc',
    };
    const parsed = parseStatusPayload(legacy);
    expect(parsed.phase).toBe('live');
  });

  it('rejects malformed phase string when present', () => {
    const bad = { ...baseRecruiting, phase: 'pre-launch' };
    expect(() => parseStatusPayload(bad)).toThrow(/phase/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm -F @zkqes/web exec vitest run src/lib/ceremonyStatus.test.ts
```

Expected: FAIL — `parseStatusPayload` not exported.

- [ ] **Step 4: Implement the web mirror**

Edit `packages/web/src/lib/ceremonyStatus.ts` to mirror the ceremony-coord shape PLUS a `parseStatusPayload` wrapper that derives `phase` for legacy payloads:

```typescript
// MIRROR of `scripts/ceremony-coord/src/types.ts`. Both files MUST
// stay byte-identical for the typed fields (CeremonyStatusPayload,
// CeremonyContributor, CeremonyPhase). The web side adds a
// `parseStatusPayload` wrapper that derives `phase` for backwards-compat
// reads of pre-v2 R2 payloads — the lead-side write path always sets
// `phase` explicitly.

export type CeremonyPhase = 'recruiting' | 'ceremony-live' | 'live';

export interface CeremonyContributor {
  readonly name: string;
  readonly round: number;
  readonly profileUrl?: string;
  readonly attestation?: string;
  readonly completedAt: string;
}

export interface CeremonyStatusPayload {
  readonly round: number;
  readonly totalRounds: number;
  readonly contributors: readonly CeremonyContributor[];
  readonly currentRoundOpenedAt?: string;
  readonly finalZkeySha256: string | null;
  readonly beaconBlockHeight: number | null;
  readonly beaconHash: string | null;
  readonly phase: CeremonyPhase;
}

const KNOWN_PHASES: readonly CeremonyPhase[] = ['recruiting', 'ceremony-live', 'live'];

export type CeremonyState = 'planned' | 'in-progress' | 'complete';

export function deriveCeremonyState(p: CeremonyStatusPayload): CeremonyState {
  if (p.finalZkeySha256 !== null) return 'complete';
  if (p.round >= 1 && p.contributors.length > 0) return 'in-progress';
  return 'planned';
}

export function derivePhase(p: Pick<CeremonyStatusPayload, 'round' | 'finalZkeySha256'>): CeremonyPhase {
  if (p.finalZkeySha256 !== null) return 'live';
  if (p.round >= 1) return 'ceremony-live';
  return 'recruiting';
}

export function validateStatusPayload(p: unknown): asserts p is CeremonyStatusPayload {
  // Identical to scripts/ceremony-coord/src/types.ts validateStatusPayload.
  if (typeof p !== 'object' || p === null) throw new Error('not an object');
  const o = p as Record<string, unknown>;
  if (typeof o.round !== 'number') throw new Error('round not a number');
  if (typeof o.totalRounds !== 'number') throw new Error('totalRounds not a number');
  if (!Array.isArray(o.contributors)) throw new Error('contributors not an array');
  if (o.finalZkeySha256 !== null && typeof o.finalZkeySha256 !== 'string')
    throw new Error('finalZkeySha256 not string|null');
  if (o.beaconBlockHeight !== null && typeof o.beaconBlockHeight !== 'number')
    throw new Error('beaconBlockHeight not number|null');
  if (o.beaconHash !== null && typeof o.beaconHash !== 'string')
    throw new Error('beaconHash not string|null');
  if (typeof o.phase !== 'string' || !KNOWN_PHASES.includes(o.phase as CeremonyPhase))
    throw new Error(`phase must be one of ${KNOWN_PHASES.join('|')}; got ${String(o.phase)}`);
  for (const [i, c] of (o.contributors as unknown[]).entries()) {
    if (typeof c !== 'object' || c === null) throw new Error(`contributors[${i}] not object`);
    const cc = c as Record<string, unknown>;
    if (typeof cc.name !== 'string') throw new Error(`contributors[${i}].name not string`);
    if (typeof cc.round !== 'number') throw new Error(`contributors[${i}].round not number`);
    if (typeof cc.completedAt !== 'string') throw new Error(`contributors[${i}].completedAt not string`);
  }
}

/**
 * Read-side parser that tolerates pre-v2 R2 payloads (no `phase`). Derives
 * `phase` from `round`+`finalZkeySha256` when missing, then runs the strict
 * validator. New writes (lead-side) always set `phase` explicitly.
 */
export function parseStatusPayload(raw: unknown): CeremonyStatusPayload {
  if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.phase === 'string' && !KNOWN_PHASES.includes(o.phase as CeremonyPhase)) {
    throw new Error(`phase must be one of ${KNOWN_PHASES.join('|')}; got ${o.phase}`);
  }
  const withPhase: Record<string, unknown> = o.phase === undefined
    ? { ...o, phase: derivePhase({ round: o.round as number, finalZkeySha256: (o.finalZkeySha256 ?? null) as string | null }) }
    : { ...o };
  validateStatusPayload(withPhase);
  return withPhase as CeremonyStatusPayload;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm -F @zkqes/web exec vitest run src/lib/ceremonyStatus.test.ts
```

Expected: PASS — all 5 new tests + any pre-existing tests stay green.

- [ ] **Step 6: Run full web test suite to catch regressions**

```bash
pnpm -F @zkqes/web test
```

Expected: 340/340 (or higher if you added tests).

- [ ] **Step 7: Commit**

```bash
cd /data/Develop/identityescroworg
git add packages/web/src/lib/ceremonyStatus.ts packages/web/src/lib/ceremonyStatus.test.ts
git commit -m "feat(web): mirror status.json phase field + parseStatusPayload backcompat

Mirrors the ceremony-coord schema bump from prior commit. The web read path
gets a parseStatusPayload() wrapper that derives 'phase' from legacy
payloads (pre-v2) so the frontend keeps working through the rollout
window without a coordinated R2 flush. Lead-side writes always set
phase explicitly going forward."
```

---

## Task 3 — Wire `phase` write through `round-zero.ts` + `publish-status.ts`

**Files:**
- Modify: `scripts/ceremony-coord/scripts/round-zero.ts`
- Modify: `scripts/ceremony-coord/scripts/publish-status.ts`
- Create: `scripts/ceremony-coord/scripts/publish-status.test.ts`

- [ ] **Step 1: Inspect current `round-zero.ts` write site**

```bash
grep -n 'CeremonyStatusPayload\|status.json\|finalZkeySha256' scripts/ceremony-coord/scripts/round-zero.ts | head -20
```

Locate the spot where `round-zero.ts` constructs the initial `CeremonyStatusPayload` literal (search for `totalRounds:`).

- [ ] **Step 2: Add `phase: 'recruiting'` to the round-zero literal**

In `scripts/ceremony-coord/scripts/round-zero.ts`, find the initial-status-construction block (it constructs an object satisfying `CeremonyStatusPayload`) and add `phase: 'recruiting'`. Example diff:

```typescript
// Before:
const initialStatus: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
};

// After:
const initialStatus: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};
```

- [ ] **Step 3: Write failing tests for `publish-status.ts --phase` flag**

Create `scripts/ceremony-coord/scripts/publish-status.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  applyRoundUpdatePure,
  applyBeaconPure,
  applyFinalizePure,
  resolvePhase,
  type CeremonyStatusPayload,
} from './publish-status.helpers.ts';

const baseRecruiting: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('resolvePhase (auto-derive at write time)', () => {
  it('keeps explicit override when --phase=recruiting passed', () => {
    expect(resolvePhase({ ...baseRecruiting, round: 3 }, 'recruiting')).toBe('recruiting');
  });

  it('auto-promotes to ceremony-live after round-1 update', () => {
    const next = { ...baseRecruiting, round: 1, contributors: [{ name: 'a', round: 0, completedAt: 'x' } as never] };
    expect(resolvePhase(next, undefined)).toBe('ceremony-live');
  });

  it('auto-promotes to live after finalize', () => {
    const next = { ...baseRecruiting, round: 10, finalZkeySha256: '0xabc' };
    expect(resolvePhase(next, undefined)).toBe('live');
  });

  it('keeps phase=live after explicit --phase=live override', () => {
    expect(resolvePhase({ ...baseRecruiting, finalZkeySha256: '0xabc', round: 10 }, 'live')).toBe('live');
  });

  it('rejects unknown explicit phase', () => {
    expect(() => resolvePhase(baseRecruiting, 'invalid' as never)).toThrow(/phase/);
  });
});
```

- [ ] **Step 4: Extract pure helpers from `publish-status.ts` to make them testable**

Refactor `scripts/ceremony-coord/scripts/publish-status.ts` — pull the existing `applyRoundUpdate` / `applyBeacon` / `applyFinalize` functions plus a new `resolvePhase` helper into a sibling `publish-status.helpers.ts` so the test can import them without firing the R2 client. Re-import them at the entry point.

Create `scripts/ceremony-coord/scripts/publish-status.helpers.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type CeremonyContributor,
  type CeremonyStatusPayload,
  type CeremonyPhase,
  derivePhase,
} from '../src/types.ts';

const KNOWN_PHASES: readonly CeremonyPhase[] = ['recruiting', 'ceremony-live', 'live'];

export type { CeremonyStatusPayload, CeremonyPhase };

export function applyRoundUpdatePure(
  current: CeremonyStatusPayload,
  round: number,
  pendingDir: string,
): CeremonyStatusPayload {
  const pendingFile = join(pendingDir, `round-${round}.json`);
  const attestationFile = join(pendingDir, `round-${round}.attestation`);
  const pending = JSON.parse(readFileSync(pendingFile, 'utf-8')) as {
    name: string;
    profileUrl?: string;
  };
  const attestation = JSON.parse(readFileSync(attestationFile, 'utf-8')) as {
    sha256: string;
    verifiedAt: string;
  };
  const entry: CeremonyContributor = {
    name: pending.name,
    round,
    completedAt: attestation.verifiedAt,
    ...(pending.profileUrl ? { profileUrl: pending.profileUrl } : {}),
    attestation: attestation.sha256,
  };
  if (current.contributors.some((c) => c.round === round))
    throw new Error(`round ${round} already in chain`);
  if (round !== current.round)
    throw new Error(`expected round ${current.round}, got ${round}`);
  return {
    ...current,
    round: round + 1,
    contributors: [...current.contributors, entry],
    currentRoundOpenedAt: new Date().toISOString(),
  };
}

export function applyBeaconPure(
  current: CeremonyStatusPayload,
  height: number,
  hash: string,
): CeremonyStatusPayload {
  if (current.contributors.length < current.totalRounds)
    throw new Error('cannot beacon — chain incomplete');
  return { ...current, beaconBlockHeight: height, beaconHash: hash };
}

export function applyFinalizePure(
  current: CeremonyStatusPayload,
  finalSha: string,
): CeremonyStatusPayload {
  if (current.beaconBlockHeight === null)
    throw new Error('cannot finalize — beacon not applied');
  return { ...current, finalZkeySha256: finalSha };
}

/**
 * Resolves the next `phase` value for a write. Explicit `--phase` override
 * wins; otherwise auto-derives from the post-update payload.
 */
export function resolvePhase(
  next: CeremonyStatusPayload,
  override: CeremonyPhase | undefined,
): CeremonyPhase {
  if (override !== undefined) {
    if (!KNOWN_PHASES.includes(override))
      throw new Error(`--phase must be one of ${KNOWN_PHASES.join('|')}; got ${override}`);
    return override;
  }
  return derivePhase(next);
}
```

Then update `scripts/ceremony-coord/scripts/publish-status.ts` to import + use the helpers, add a `phase?: CeremonyPhase` field to `Args`, accept `--phase` in `parseCliArgs`, and call `resolvePhase` after the chosen `apply*Pure` call:

```typescript
// At top of publish-status.ts, replace the inline applyRoundUpdate /
// applyBeacon / applyFinalize with imports from helpers:
import {
  applyRoundUpdatePure,
  applyBeaconPure,
  applyFinalizePure,
  resolvePhase,
  type CeremonyStatusPayload,
} from './publish-status.helpers.ts';
import type { CeremonyPhase } from '../src/types.ts';

interface Args {
  round?: number;
  beacon?: { height: number; hash: string };
  finalize?: boolean;
  finalSha?: string;
  phase?: CeremonyPhase;
  commit: boolean;
}

// In parseCliArgs(), add `phase: { type: 'string' }` to options.
// After the existing parses, add:
if (typeof values.phase === 'string') {
  args.phase = values.phase as CeremonyPhase;
}

// In main(), after the apply*Pure call sets `next`, add:
const phasedNext: CeremonyStatusPayload = { ...next, phase: resolvePhase(next, args.phase) };

// Use `phasedNext` (not `next`) for the diff output and the conditional write.
```

The header comment block of `publish-status.ts` gets a usage line for the new flag:

```typescript
// Phase override (rare — auto-derive is right by default):
//   pnpm tsx scripts/publish-status.ts --round 4 --phase ceremony-live --commit
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /data/Develop/identityescroworg/scripts/ceremony-coord
pnpm vitest run scripts/publish-status.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 6: Run a dry-run against R2 to confirm the new `phase` write path**

```bash
cd /data/Develop/identityescroworg/scripts/ceremony-coord
# Dry-run round-1 (no --commit) — should print phase: 'ceremony-live' in the diff.
pnpm tsx scripts/publish-status.ts --round 1
```

Expected: console output shows `phase: { from: 'recruiting', to: 'ceremony-live' }` in the diff block. (If R2 is not provisioned in your env, this will fail at the R2 read step — that's fine; the unit tests cover the logic.)

- [ ] **Step 7: Commit**

```bash
cd /data/Develop/identityescroworg
git add scripts/ceremony-coord/scripts/round-zero.ts \
        scripts/ceremony-coord/scripts/publish-status.ts \
        scripts/ceremony-coord/scripts/publish-status.helpers.ts \
        scripts/ceremony-coord/scripts/publish-status.test.ts
git commit -m "feat(ceremony-coord): write phase through round-zero + publish-status

round-zero.ts seeds status.json with phase='recruiting'.
publish-status.ts auto-derives phase post-update, plus accepts a manual
--phase override for the lead-controlled live flip after final-verifier
deploys (per spec §6.3 + §7.2). Pure helpers extracted to
publish-status.helpers.ts for vitest coverage."
```

---

## Task 4 — BRAND.md amendment (v1 §6 + v2 surface grammar)

**Files:**
- Modify: `BRAND.md`

The amendment lifts v1 spec §6 (visual language, type stack, component grammar) verbatim and appends v2 surface-grammar additions (3-col vs single-long-form rules, phase-LED states, frozen marketer copy table).

- [ ] **Step 1: Read v1 spec §6 to lift verbatim**

```bash
sed -n '283,420p' docs/superpowers/specs/2026-05-04-zkqes-civic-terminal-rebrand-design.md > /tmp/v1-section-6.md
cat /tmp/v1-section-6.md
```

This is the canonical brand text. Append it (with light frame edits to fit `BRAND.md`'s tone) into `BRAND.md` under a new section `## Visual language` heading, BELOW the existing `## When this document changes` section so that future readers see the brand collapse rationale first, then the visual grammar.

- [ ] **Step 2: Add the v2 surface grammar appendix**

Append this section to `BRAND.md` after the lifted v1 §6 content:

```markdown
## Surface grammar (v2 amendment, 2026-05-04)

The civic-terminal grammar applies across four user-facing surface families. Each family has a fixed body shape; the chrome (marquee + footer ribbon) is shared.

| Surface family       | Body shape           | Why                                                                |
|----------------------|----------------------|--------------------------------------------------------------------|
| Landing              | 3-col shell (variant D) | gateway feel; multiple peripheral concerns visible at once       |
| `/ceremony`          | 3-col shell           | data-rich dashboard; chain + recruit-cards + verify-widget cleanly split |
| `/register`          | single long form (max-width 720px) | 6-step flow needs reading-order; columns would compete for attention |
| `/account/rotate`    | single long form (3 sections, max-width 720px) | Symmetric with `/register`; reused for visual consistency |
| `/verify`            | 3-col shell           | inspector/explorer (paste + result); siblings with `/ceremony`   |

Body shapes are immutable per surface family. Token grammar (palette, type, `.ct-*` primitives) is consistent across all surfaces. Only the body layout differs.

### Phase-LED states

The marquee phase indicator uses a coloured LED + text:

| Phase           | LED color    | Text             |
|-----------------|--------------|------------------|
| `recruiting`    | yellow ●     | recruiting       |
| `ceremony-live` | green ●      | ceremony-live    |
| `live`          | blue ●       | live             |

The LED has `aria-label="phase: <phase>"` so the colour is informational, not decorative. `prefers-reduced-motion: reduce` replaces the pulse animation with a static dot.

### Footer ribbon

`{BUILD_SHA_7} · {BUILD_DATE} · zkqes.org` — locked 2026-05-04. Build-time `VITE_BUILD_SHA` (7-char SHA) + `VITE_BUILD_DATE` (ISO date) env vars. Renders on every surface family.

### Frozen marketer-locked copy

These strings are NOT to be rephrased. Lifted into code as-is from v1 spec §3 + v2 spec §3 / §4.

| Surface           | Element                  | Copy                                                                                                                                       |
|-------------------|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Landing           | Binding-statement preview | "Holders sign a binding statement that names a wallet, and prove the signature in zk — without disclosing it."                            |
| Landing           | Marquee count, recruiting | `round 0 of {TOTAL}` — or `round — of —` if `totalRounds === 0` (HN-screenshot mitigation)                                                |
| Landing           | Disabled-tab tooltip     | `Available after trusted setup ceremony + Base Sepolia testnet deploy`                                                                    |
| Landing           | Marquee right sidebar, recruiting | `awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)`                                                          |
| `/ceremony`       | Coord attribution         | `COORD: alik.eth · DM for round assignment`                                                                                                |

Marketer reviews any new public-facing copy before lock. v2 spec PR has the marketer review trail.
```

- [ ] **Step 3: Validate the amendment renders correctly**

```bash
# Visual / structural check
head -200 BRAND.md
markdown-link-check BRAND.md 2>/dev/null || true   # if installed; not required
```

- [ ] **Step 4: Commit**

```bash
cd /data/Develop/identityescroworg
git add BRAND.md
git commit -m "docs(brand): append visual language + v2 surface grammar

Lifts v1 spec §6 (visual language, type stack, component grammar)
verbatim into BRAND.md under '## Visual language'. Appends v2 surface-
grammar amendment: per-surface body-shape rules, phase-LED state
table, footer ribbon spec, and the frozen marketer-locked copy table
that web-eng must not rephrase.

Per v1 spec acceptance gate + v2 spec §3 lineage."
```

---

## Acceptance gate (lead self-check)

After the four tasks land:

- [ ] `pnpm -F @zkqes/web test` → 340/340 (or higher), 0 failures
- [ ] `pnpm -F @zkqes/web typecheck` → green
- [ ] `cd scripts/ceremony-coord && pnpm vitest run` → all schema + helper tests green
- [ ] `BRAND.md` contains both v1 §6 lift AND v2 amendment block
- [ ] All four commits pushed to `main` (lead works in main checkout, not a worker branch)

After all four are green, broadcast to workers:

```
SendMessage({to: "*", text: "Lead L1-L4 complete on main. Schema bump on status.json (phase field) is live. BRAND.md amendment merged. web-eng + contracts-eng — proceed per your per-worker plans."})
```

## Self-review notes

- **Spec coverage:** L1+L2 cover spec §7.1 (schema bump). L3 covers spec §7.2 (write paths). L4 covers spec §10 acceptance gate item "BRAND.md amendment committed by lead".
- **No placeholders:** every step has runnable code or explicit commands.
- **Type consistency:** `CeremonyPhase` type name + values (`'recruiting'|'ceremony-live'|'live'`) are identical across types.ts, ceremonyStatus.ts, and the helpers file.
- **Frozen copy:** the marketer-locked table in BRAND.md mirrors what web-eng plan §0.1 enumerates — both reference the same source-of-truth strings.
