// Multi-QTSP facade T14 — `fixtures/trust/` integrity test.
//
// Walks every `fixtures/trust/<cc>/<slug>/meta.json` and asserts the
// state-vs-evidence rules from spec §3.4:
//
//   bronze (documented):
//     - meta.json present + schema-valid
//     - directory cc matches meta.country (case-insensitive)
//     - directory slug matches meta.qtspSlug exactly
//
//   silver (in-integration):
//     - bronze rules
//     - intermediates/ directory with ≥1 *.pem file
//     - samples.json with ≥3 entries
//     - every sample has parserWalk: 'pass' AND derStrict: 'pass'
//
//   gold (testnet-ready):
//     - silver rules
//     - root.json + trusted-cas.json present
//     - at least one sample has witnessGen: 'pass'
//
//   live (mainnet):
//     - gold rules
//     - all gold checks satisfied
//     - meta.promotedAt: non-null ISO date (live entries must have a
//       promotion timestamp on record).
//
// Lead's T14 dispatch heads-up: UA/diia today demoted to `silver` to
// match its actual evidence depth (code-shipping with stub-verifier
// on testnet, no Phase B Phase 2 ceremony output). Promotes to gold
// post-ceremony, live post-mainnet-deploy. The placeholder samples
// in `samples.json` carry `witnessGen: 'n/a-pre-ceremony'` to be
// loud about the gap; T14's silver-rules pass without requiring
// witnessGen-pass.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QtspMetaSchema } from '@zkqes/sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
// `tests/integration/` → `packages/web/` → repo root (`../../../..`).
const REPO_ROOT = resolve(HERE, '../../../..');
const TRUST = resolve(REPO_ROOT, 'fixtures/trust');

interface Sample {
  parserWalk?: string;
  derStrict?: string;
  witnessGen?: string;
  [k: string]: unknown;
}

function readSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

describe('fixtures/trust integrity (T14)', () => {
  // Walking is intentionally synchronous-and-eager so each entry's
  // `describe` block lands at vitest collect time — consumers running
  // a single QTSP's tests can target by name (`-t 'UA/diia'`).
  for (const cc of readSubdirs(TRUST)) {
    for (const slug of readSubdirs(join(TRUST, cc))) {
      const dir = join(TRUST, cc, slug);
      if (!existsSync(join(dir, 'meta.json'))) continue;

      describe(`${cc}/${slug}`, () => {
        const raw = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
        const parsed = QtspMetaSchema.safeParse(raw);

        it('meta.json parses against QtspMetaSchema', () => {
          if (!parsed.success) {
            throw new Error(
              `${cc}/${slug}/meta.json schema fail: ${parsed.error.message}`,
            );
          }
          expect(parsed.success).toBe(true);
        });

        // Skip dependent assertions if the schema parse failed — they'd
        // throw against undefined fields and obscure the real cause.
        if (!parsed.success) return;
        const meta = parsed.data;

        it('directory cc matches meta.country (case-insensitive)', () => {
          expect(meta.country.toLowerCase()).toBe(cc.toLowerCase());
        });

        it('directory slug matches meta.qtspSlug exactly', () => {
          expect(meta.qtspSlug).toBe(slug);
        });

        // ── silver rules ──
        if (
          meta.state === 'silver' ||
          meta.state === 'gold' ||
          meta.state === 'live'
        ) {
          it('has intermediates/ with at least one *.pem', () => {
            const intermediatesDir = join(dir, 'intermediates');
            expect(existsSync(intermediatesDir)).toBe(true);
            const pems = readdirSync(intermediatesDir).filter((n) =>
              n.endsWith('.pem'),
            );
            expect(pems.length).toBeGreaterThan(0);
          });

          it('has samples.json with ≥3 entries', () => {
            const samplesPath = join(dir, 'samples.json');
            expect(existsSync(samplesPath)).toBe(true);
            const samples = JSON.parse(
              readFileSync(samplesPath, 'utf8'),
            ) as Sample[];
            expect(Array.isArray(samples)).toBe(true);
            expect(samples.length).toBeGreaterThanOrEqual(3);
          });

          it('every sample has parserWalk:pass + derStrict:pass', () => {
            const samples = JSON.parse(
              readFileSync(join(dir, 'samples.json'), 'utf8'),
            ) as Sample[];
            for (const s of samples) {
              expect(s.parserWalk).toBe('pass');
              expect(s.derStrict).toBe('pass');
            }
          });
        }

        // ── gold rules ──
        if (meta.state === 'gold' || meta.state === 'live') {
          it('has root.json + trusted-cas.json (gold trust-anchor evidence)', () => {
            expect(existsSync(join(dir, 'root.json'))).toBe(true);
            expect(existsSync(join(dir, 'trusted-cas.json'))).toBe(true);
          });

          it('at least one sample has witnessGen:pass (gold ceremony evidence)', () => {
            const samples = JSON.parse(
              readFileSync(join(dir, 'samples.json'), 'utf8'),
            ) as Sample[];
            const ok = samples.some((s) => s.witnessGen === 'pass');
            expect(ok).toBe(true);
          });
        }

        // ── live rules ──
        if (meta.state === 'live') {
          it('promotedAt is non-null (live entries record a promotion timestamp)', () => {
            expect(meta.promotedAt).not.toBeNull();
            expect(typeof meta.promotedAt).toBe('string');
          });
        }
      });
    }
  }
});
