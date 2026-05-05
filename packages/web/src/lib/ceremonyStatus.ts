// V5 Phase 2 ceremony — status feed types + polling.
//
// The ceremony progress is a small JSON document the lead admin
// publishes to a known URL after each contributor's round closes.
// Frontend polls every 30 s and renders progress + contributor chain.
//
// Production URL (post-§9.4):
//   https://prove.zkqes.org/ceremony/status.json
//
// Dev fixture (this repo):
//   public/ceremony/status.json
//
// MIRROR of `scripts/ceremony-coord/src/types.ts`. Both files MUST stay
// byte-identical for the typed fields (CeremonyStatusPayload,
// CeremonyContributor, CeremonyPhase). The web side adds a
// `parseStatusPayload` wrapper that derives `phase` for backwards-compat
// reads of pre-v2 R2 payloads — the lead-side write path always sets
// `phase` explicitly.

export type CeremonyPhase = 'recruiting' | 'ceremony-live' | 'live';

/**
 * v3 (2026-05-05, V5.4 plan T5): per-circuit ceremony tracking enum.
 * V5.3 identity circuit + V5.4 age-Diia-UA circuit ride the same Phase B
 * ceremony per-contributor per orchestration §2.2 step 7. Each circuit's
 * round counter advances independently within
 * `CeremonyStatusPayload.circuits[name]` when `publish-status.ts
 * --circuit <name>` lands a contribution.
 *
 * The `circuits` map's keys are typed as plain `string` (not the
 * `CeremonyCircuit` literal union) so V5.5+ entries (e.g.,
 * `'v5.5-age-rfc3739'`, `'v5.5-age-cf-italy'`) round-trip without
 * forcing a synchronized type bump on every web read. Validator
 * shape-checks each entry but does not enforce membership in
 * `KNOWN_CIRCUITS`.
 */
export type CeremonyCircuit = 'v5.3-identity' | 'v5.4-age-diia-ua';

export const KNOWN_CIRCUITS: readonly CeremonyCircuit[] = [
  'v5.3-identity',
  'v5.4-age-diia-ua',
] as const;

/**
 * v3 (2026-05-05, V5.4 plan T5): per-circuit state tracker. Each circuit
 * in `CeremonyStatusPayload.circuits` carries its own round counter +
 * last-contributor metadata, isolated from other circuits. The parent
 * payload's top-level `round` / `contributors` fields remain the legacy
 * single-primary-circuit view (V5.3 identity for V5.4-era ceremonies);
 * web surfaces that pre-date the per-circuit map keep working unchanged.
 */
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

export interface CeremonyContributor {
  /** Display handle / email — what we show in the public chain. */
  readonly name: string;
  /** 1-indexed round position. */
  readonly round: number;
  /** Optional Twitter / GitHub / web profile for credibility surfacing. */
  readonly profileUrl?: string;
  /**
   * Optional attestation hash — the contributor's BLAKE2b of their
   * `zkey contribute` output, signed via PGP / X (whatever the admin
   * chose). Lets the public verify each link in the chain independently.
   */
  readonly attestation?: string;
  /** ISO-8601 of when the round was accepted by the admin. */
  readonly completedAt: string;
}

export interface CeremonyStatusPayload {
  /** Current round in flight (1-indexed). When `round > totalRounds`,
   *  ceremony is complete and `finalZkeySha256` is non-null. */
  readonly round: number;
  /** Planned total contributors. */
  readonly totalRounds: number;
  /** Chain of completed rounds in order. */
  readonly contributors: readonly CeremonyContributor[];
  /** ISO-8601 of when the current round opened (for "awaiting next contributor" UX). */
  readonly currentRoundOpenedAt?: string;
  /** Final zkey hash; non-null once ceremony is complete + attested. */
  readonly finalZkeySha256: string | null;
  /** Public-randomness beacon — block height + hash from the agreed
   *  Bitcoin / Ethereum mainnet block consumed as a randomness commit
   *  AFTER the last contributor. Per §11 spec. */
  readonly beaconBlockHeight: number | null;
  readonly beaconHash: string | null;
  /** v2 spec §6.3 + §7.1: phase discriminator drives every UI state machine. */
  readonly phase: CeremonyPhase;
  /**
   * v3 (2026-05-05, V5.4 plan T5): per-circuit round counters. Optional
   * for backwards compat with v2 payloads — readers fall through to
   * top-level `round` / `contributors` when this field is absent or
   * empty. Forward writes from `publish-status.ts --circuit <name>`
   * populate per-circuit entries.
   *
   * Map keys are plain `string` (not `CeremonyCircuit` literal) so V5.5+
   * additions parse without a synchronized web-side type bump; the
   * validator shape-checks each entry but does not enforce
   * `KNOWN_CIRCUITS` membership.
   */
  readonly circuits?: Readonly<Record<string, CeremonyCircuitState>>;
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
 * Lead-side writes always set `phase` explicitly.
 */
export function derivePhase(
  p: Pick<CeremonyStatusPayload, 'round' | 'finalZkeySha256'>,
): CeremonyPhase {
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
  // v3: optional per-circuit map. Shape-validate entries when present;
  // accept absent / empty map for backwards compat with v2 payloads.
  // Map keys are NOT enforced against `KNOWN_CIRCUITS` so V5.5+ entries
  // round-trip without a synchronized web release.
  if (o.circuits !== undefined && o.circuits !== null) {
    if (typeof o.circuits !== 'object' || Array.isArray(o.circuits)) {
      throw new Error('circuits must be a plain object');
    }
    for (const [name, raw] of Object.entries(o.circuits as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) {
        throw new Error(`circuits[${name}] not object`);
      }
      const e = raw as Record<string, unknown>;
      if (typeof e.round !== 'number') {
        throw new Error(`circuits[${name}].round not number`);
      }
      if (e.lastContributor !== null && typeof e.lastContributor !== 'string') {
        throw new Error(`circuits[${name}].lastContributor not string|null`);
      }
      if (e.lastContributedAt !== null && typeof e.lastContributedAt !== 'string') {
        throw new Error(`circuits[${name}].lastContributedAt not string|null`);
      }
      // finalZkeySha256 is optional — when present, must be string|null.
      if (
        e.finalZkeySha256 !== undefined &&
        e.finalZkeySha256 !== null &&
        typeof e.finalZkeySha256 !== 'string'
      ) {
        throw new Error(`circuits[${name}].finalZkeySha256 not string|null|undefined`);
      }
    }
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
    ? {
        ...o,
        phase: derivePhase({
          round: o.round as number,
          finalZkeySha256: (o.finalZkeySha256 ?? null) as string | null,
        }),
      }
    : { ...o };
  validateStatusPayload(withPhase);
  return withPhase as CeremonyStatusPayload;
}

/**
 * Fetch the published status JSON. Network failures surface as `null`
 * so the caller can render a "feed unavailable" state without crashing.
 *
 * `cacheBust` adds a query param so polling doesn't get cached by the
 * CDN — R2 / Cloudflare honour `?t=<ms>` cache busting.
 */
export async function fetchCeremonyStatus(
  url: string,
  signal?: AbortSignal,
): Promise<CeremonyStatusPayload | null> {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}t=${Date.now()}`, signal ? { signal } : {});
    if (!r.ok) return null;
    const raw = (await r.json()) as unknown;
    return parseStatusPayload(raw);
  } catch {
    return null;
  }
}

/** Polling interval — 30 s per founder dispatch. */
export const CEREMONY_POLL_MS = 30_000;

/** Production status feed URL. Override via `VITE_CEREMONY_STATUS_URL` for
 *  local dev (defaults to the bundled fixture). */
export const CEREMONY_STATUS_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_CEREMONY_STATUS_URL) ||
  '/ceremony/status.json';
