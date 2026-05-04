import { describe, expect, it } from 'vitest';
import {
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
