// T6 — positive presence test for the multi-QTSP facade i18n keys.
//
// The pre-existing `i18n-coverage.test.ts` already enforces en/uk
// key-set parity + non-empty values, so adding a key only to en.json
// without uk.json (or vice versa) gets caught there. This file adds
// the *positive* assertion: the 17 specific keys the facade UI relies
// on must exist (and not be silently renamed). Catches the
// "refactor-renamed-the-key-without-noticing" failure mode that pure
// parity testing misses.
//
// Plan §T6, lead-confirmed scope: 15 `qtsp.*` namespace keys + 2
// `errors.cert.berInput*` keys = 17 total, both files.

import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import uk from '../../src/i18n/uk.json';

const REQUIRED_KEYS = [
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
] as const;

function get(obj: unknown, dotpath: string): unknown {
  return dotpath
    .split('.')
    .reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      obj,
    );
}

describe('qtsp.* + errors.cert.* i18n keys (T6)', () => {
  for (const key of REQUIRED_KEYS) {
    it(`en has ${key}`, () => {
      const v = get(en, key);
      expect(v).toBeDefined();
      expect(typeof v).toBe('string');
      expect(v).not.toBe('');
    });
    it(`uk has ${key}`, () => {
      const v = get(uk, key);
      expect(v).toBeDefined();
      expect(typeof v).toBe('string');
      expect(v).not.toBe('');
    });
  }

  // Lead's T6 heads-up: error templates carry placeholders that must
  // match the `cert.berInput` ZkqesError payload thread. T4 wires
  // `reason` directly; T13 will thread `qtspName` + `qtspUrl` from the
  // ?qtsp param. Catch any drift in placeholder names before T13.
  it('errors.cert.berInput template uses {{qtspName}}, {{qtspUrl}}, {{reason}}', () => {
    const enTpl = get(en, 'errors.cert.berInput') as string;
    const ukTpl = get(uk, 'errors.cert.berInput') as string;
    for (const ph of ['{{qtspName}}', '{{qtspUrl}}', '{{reason}}']) {
      expect(enTpl).toContain(ph);
      expect(ukTpl).toContain(ph);
    }
  });

  it('errors.cert.berInputGeneric uses {{reason}} only (no qtsp threading)', () => {
    const enTpl = get(en, 'errors.cert.berInputGeneric') as string;
    const ukTpl = get(uk, 'errors.cert.berInputGeneric') as string;
    expect(enTpl).toContain('{{reason}}');
    expect(ukTpl).toContain('{{reason}}');
    // The generic variant intentionally omits qtsp threading because
    // it surfaces in the QTSP-less envelope/leaf-cert detection
    // path — no QTSP context is known yet at that point.
    expect(enTpl).not.toContain('{{qtspName}}');
    expect(ukTpl).not.toContain('{{qtspName}}');
  });
});
