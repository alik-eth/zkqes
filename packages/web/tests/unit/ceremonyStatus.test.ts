import { describe, expect, it } from 'vitest';
import {
  KNOWN_CIRCUITS,
  derivePhase,
  parseStatusPayload,
  validateStatusPayload,
  type CeremonyStatusPayload,
} from '../../src/lib/ceremonyStatus';

const baseRecruiting: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('derivePhase', () => {
  it('returns recruiting when round=0 + finalZkey null', () => {
    expect(derivePhase({ round: 0, finalZkeySha256: null })).toBe('recruiting');
  });

  it('returns ceremony-live when round>=1 + finalZkey null', () => {
    expect(derivePhase({ round: 3, finalZkeySha256: null })).toBe('ceremony-live');
  });

  it('returns live when finalZkey populated', () => {
    expect(derivePhase({ round: 10, finalZkeySha256: '0xabc' })).toBe('live');
  });
});

describe('validateStatusPayload', () => {
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

  it('rejects non-object input', () => {
    expect(() => validateStatusPayload(null)).toThrow();
    expect(() => validateStatusPayload('string')).toThrow();
  });
});

describe('parseStatusPayload (backwards-compat read)', () => {
  it('returns the payload as-is when phase is present', () => {
    const parsed = parseStatusPayload(baseRecruiting);
    expect(parsed.phase).toBe('recruiting');
    expect(parsed.totalRounds).toBe(10);
  });

  it('derives phase=recruiting when missing on legacy payload (round=0)', () => {
    const { phase: _omit, ...legacy } = baseRecruiting;
    expect(parseStatusPayload(legacy).phase).toBe('recruiting');
  });

  it('derives phase=ceremony-live when missing + round>=1', () => {
    const { phase: _omit, ...legacy } = { ...baseRecruiting, round: 4 };
    expect(parseStatusPayload(legacy).phase).toBe('ceremony-live');
  });

  it('derives phase=live when missing + finalZkey populated', () => {
    const { phase: _omit, ...legacy } = {
      ...baseRecruiting,
      round: 10,
      finalZkeySha256: '0xfinal',
    };
    expect(parseStatusPayload(legacy).phase).toBe('live');
  });

  it('rejects malformed phase string when present (does not silently coerce)', () => {
    const bad = { ...baseRecruiting, phase: 'pre-launch' };
    expect(() => parseStatusPayload(bad)).toThrow(/phase/);
  });
});

// ── v3 schema bump — per-circuit map (V5.4 plan T5) ────────────────────
describe('CeremonyStatusPayload v3 — per-circuit map', () => {
  it('exposes KNOWN_CIRCUITS tuple matching the source-of-truth', () => {
    expect(KNOWN_CIRCUITS).toEqual(['v5.3-identity', 'v5.4-age-diia-ua']);
  });

  it('v2 payload (no circuits field) parses unchanged', () => {
    const parsed = parseStatusPayload(baseRecruiting);
    expect(parsed.circuits).toBeUndefined();
    expect(parsed.round).toBe(0);
  });

  it('v3 payload (with circuits map) parses with all entries visible', () => {
    const v3 = {
      ...baseRecruiting,
      round: 3,
      phase: 'ceremony-live' as const,
      circuits: {
        'v5.3-identity': {
          round: 3,
          lastContributor: 'alik.eth',
          lastContributedAt: '2026-05-08T14:22:00Z',
        },
        'v5.4-age-diia-ua': {
          round: 2,
          lastContributor: 'pse.research',
          lastContributedAt: '2026-05-08T14:30:00Z',
        },
      },
    };
    const parsed = parseStatusPayload(v3);
    expect(parsed.circuits).toBeDefined();
    expect(parsed.circuits!['v5.3-identity']!.round).toBe(3);
    expect(parsed.circuits!['v5.3-identity']!.lastContributor).toBe('alik.eth');
    expect(parsed.circuits!['v5.4-age-diia-ua']!.round).toBe(2);
    expect(parsed.circuits!['v5.4-age-diia-ua']!.lastContributedAt).toBe(
      '2026-05-08T14:30:00Z',
    );
  });

  it('v3 payload accepts null lastContributor + lastContributedAt for never-yet-advanced circuit', () => {
    const v3 = {
      ...baseRecruiting,
      circuits: {
        'v5.4-age-diia-ua': {
          round: 0,
          lastContributor: null,
          lastContributedAt: null,
        },
      },
    };
    expect(() => validateStatusPayload(v3)).not.toThrow();
  });

  it('v3 payload accepts finalZkeySha256 per-circuit when ceremony for that circuit closes', () => {
    const v3 = {
      ...baseRecruiting,
      phase: 'live' as const,
      finalZkeySha256: '0xparenthash',
      circuits: {
        'v5.3-identity': {
          round: 10,
          lastContributor: 'final-contributor',
          lastContributedAt: '2026-05-09T00:00:00Z',
          finalZkeySha256: '0xidentity-final',
        },
      },
    };
    const parsed = parseStatusPayload(v3);
    expect(parsed.circuits!['v5.3-identity']!.finalZkeySha256).toBe(
      '0xidentity-final',
    );
  });

  it('accepts unknown circuit names (forward-compat for V5.5+ entries)', () => {
    // V5.5+ may add 'v5.5-age-rfc3739' / 'v5.5-age-cf-italy' / etc.
    // Validator should NOT enforce KNOWN_CIRCUITS membership at the
    // map-key level — that's a synchronized type bump on every web
    // release; the source-of-truth comment documents this.
    const future = {
      ...baseRecruiting,
      circuits: {
        'v5.5-age-rfc3739': {
          round: 1,
          lastContributor: 'd-trust',
          lastContributedAt: '2027-01-01T00:00:00Z',
        },
      },
    };
    expect(() => validateStatusPayload(future)).not.toThrow();
  });

  it('rejects circuits-as-array (must be a plain object)', () => {
    const bad = { ...baseRecruiting, circuits: [] };
    expect(() => validateStatusPayload(bad)).toThrow(/circuits.*plain object/);
  });

  it('rejects non-numeric round inside a circuit entry', () => {
    const bad = {
      ...baseRecruiting,
      circuits: {
        'v5.3-identity': {
          round: 'three',
          lastContributor: null,
          lastContributedAt: null,
        },
      },
    };
    expect(() => validateStatusPayload(bad)).toThrow(/round/);
  });

  it('rejects non-string|null lastContributor inside a circuit entry', () => {
    const bad = {
      ...baseRecruiting,
      circuits: {
        'v5.3-identity': {
          round: 1,
          lastContributor: 42,
          lastContributedAt: null,
        },
      },
    };
    expect(() => validateStatusPayload(bad)).toThrow(/lastContributor/);
  });

  it('null circuits is treated as absent (forwards-compat with explicit-null writers)', () => {
    const tolerated = { ...baseRecruiting, circuits: null };
    expect(() => validateStatusPayload(tolerated)).not.toThrow();
  });
});
