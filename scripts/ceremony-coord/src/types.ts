// Mirror of `packages/web/src/lib/ceremonyStatus.ts` — the JSON shape of
// `status.json` published to R2. The web frontend polls + parses this.
//
// Don't change types here without updating the web file in lockstep; both
// sides MUST byte-deserialize identical objects.

export type CeremonyPhase = 'recruiting' | 'ceremony-live' | 'live';

// v3 (2026-05-05, V5.4 plan T5): per-circuit ceremony tracking enum.
// V5.3 identity circuit + V5.4 age-Diia-UA circuit ride the same Phase B
// ceremony per-contributor per orchestration §2.2 step 7. Each circuit's
// round counter advances independently within `CeremonyStatusPayload.circuits[name]`
// when `publish-status.ts --circuit <name>` lands a contribution.
//
// Adding a new circuit (V5.5+ onboarding e.g., AgeRFC3739, AgeCFItaly):
//   1. Add the literal to `KNOWN_CIRCUITS` below.
//   2. Update `publish-status.ts --circuit` flag's enum-validation message.
//   3. Web-eng's per-circuit UI surfaces (if any) render the new entry.
// No need to bump schema version for additive enum entries.
export type CeremonyCircuit = 'v5.3-identity' | 'v5.4-age-diia-ua';

export const KNOWN_CIRCUITS: readonly CeremonyCircuit[] = [
  'v5.3-identity',
  'v5.4-age-diia-ua',
];

export interface CeremonyContributor {
  readonly name: string;
  readonly round: number;
  readonly profileUrl?: string;
  readonly attestation?: string;
  readonly completedAt: string;
}

// v3 (2026-05-05, V5.4 plan T5): per-circuit state tracker. Each circuit
// in `CeremonyStatusPayload.circuits` carries its own round counter +
// last-contributor metadata, isolated from other circuits. The parent's
// top-level `round`/`contributors` fields remain the legacy single-
// primary-circuit view (V5.3 identity for V5.4-era ceremonies); web
// surfaces that pre-date the per-circuit map keep working unchanged.
export interface CeremonyCircuitState {
  /** 1-indexed round counter for this circuit. */
  readonly round: number;
  /** Display handle of the last contributor who advanced this circuit's
   *  round. Null until the first contribution lands. */
  readonly lastContributor: string | null;
  /** ISO-8601 of when this circuit's round last advanced. Null until the
   *  first contribution lands. */
  readonly lastContributedAt: string | null;
  /** Final-zkey sha256 for this circuit; non-null once the ceremony for
   *  THIS circuit closes (beacon applied + finalize ran for this
   *  circuit). Different circuits can finalize independently if their
   *  Phase B contributor sets diverge — currently expected to land
   *  together per orchestration §2.2 single-session decision. */
  readonly finalZkeySha256?: string | null;
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
  // v3 (2026-05-05, V5.4 plan T5): per-circuit round counters. Optional for
  // backwards compat with v2 payloads — readers fall through to top-level
  // round/contributors when this field is absent or empty. Forward writes
  // from `publish-status.ts --circuit <name>` populate per-circuit entries.
  readonly circuits?: Readonly<Record<string, CeremonyCircuitState>>;
}

const KNOWN_PHASES: readonly CeremonyPhase[] = ['recruiting', 'ceremony-live', 'live'];

/**
 * Pure-function update for a single circuit's per-circuit state. Lifts the
 * legacy `applyRoundUpdate` shape into the per-circuit map without touching
 * top-level fields. Used by `publish-status.ts --circuit <name> --round N`.
 *
 * Isolation invariant: callers MUST be able to call this twice with two
 * different `circuit` values and observe each entry in the resulting map
 * unchanged from its prior state (other than the targeted entry). The
 * `_test-publish-status.ts` smoke test asserts this directly.
 */
export function applyCircuitUpdate(
  current: CeremonyStatusPayload,
  circuit: CeremonyCircuit,
  round: number,
  contributor: string,
  contributedAt: string,
): CeremonyStatusPayload {
  if (!Number.isInteger(round) || round < 1) {
    throw new Error(`applyCircuitUpdate: round must be ≥ 1, got ${round}`);
  }
  const prevMap: Record<string, CeremonyCircuitState> = {
    ...(current.circuits ?? {}),
  };
  const prevEntry = prevMap[circuit];
  // Per-circuit round invariant: round must advance from previous +1, OR be 1
  // if no prior entry. Mirrors legacy applyRoundUpdate's `round !== current.round`
  // gate but scoped to this circuit's counter.
  const expectedRound = prevEntry ? prevEntry.round + 1 : 1;
  if (round !== expectedRound) {
    throw new Error(
      `applyCircuitUpdate: circuit=${circuit} expected round ${expectedRound}, got ${round}`,
    );
  }
  prevMap[circuit] = {
    round,
    lastContributor: contributor,
    lastContributedAt: contributedAt,
    ...(prevEntry?.finalZkeySha256 !== undefined
      ? { finalZkeySha256: prevEntry.finalZkeySha256 }
      : {}),
  };
  return { ...current, circuits: prevMap };
}

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
  // v3 (V5.4 plan T5): `circuits` is OPTIONAL. v2 payloads pre-date it
  // and round-trip through this validator unchanged. When present, every
  // entry must be a well-formed CeremonyCircuitState.
  if (o.circuits !== undefined) {
    if (typeof o.circuits !== 'object' || o.circuits === null || Array.isArray(o.circuits)) {
      throw new Error('circuits must be an object|undefined');
    }
    for (const [name, st] of Object.entries(o.circuits as Record<string, unknown>)) {
      if (typeof st !== 'object' || st === null) {
        throw new Error(`circuits[${name}] not object`);
      }
      const s = st as Record<string, unknown>;
      if (typeof s.round !== 'number' || !Number.isInteger(s.round) || s.round < 0) {
        throw new Error(`circuits[${name}].round must be a non-negative integer`);
      }
      if (s.lastContributor !== null && typeof s.lastContributor !== 'string') {
        throw new Error(`circuits[${name}].lastContributor must be string|null`);
      }
      if (s.lastContributedAt !== null && typeof s.lastContributedAt !== 'string') {
        throw new Error(`circuits[${name}].lastContributedAt must be string|null`);
      }
      if (
        s.finalZkeySha256 !== undefined &&
        s.finalZkeySha256 !== null &&
        typeof s.finalZkeySha256 !== 'string'
      ) {
        throw new Error(`circuits[${name}].finalZkeySha256 must be string|null|undefined`);
      }
    }
  }
}
