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
