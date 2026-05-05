// T5 — Vite plugin that walks `fixtures/trust/<cc>/<slug>/meta.json` and
// emits a typed `qtsp-index.ts` for the Landing tile grid + per-QTSP
// route. Per plan §T5, plus lead's three heads-ups:
//
//   1. `addWatchFile(trustRoot)` so dev mode picks up new fixtures.
//   2. `enforce: 'pre'` so the index is generated BEFORE consumer
//      plugins read it (vite-static-copy / i18n race-prevention).
//   3. Empty fixture tree must produce an empty `QTSP_INDEX` rather
//      than throw — lets a fresh clone build cleanly before any
//      fixtures exist.
//
// Co-located with the rest of the unit tree at `tests/unit/` instead of
// the plan's `packages/web/vite/plugin-qtsp-index.test.ts` because
// `vitest.config.ts` only scans `tests/unit/**`. Putting the file next
// to the plugin would mean expanding the include glob; matching the
// existing convention is one less moving part.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { qtspIndexPlugin } from '../../vite/plugin-qtsp-index';

/**
 * `Plugin.buildStart` is typed as a union of `(fn) | { handler, order? }`,
 * so calling `.call(...)` on the raw value fails typecheck. This helper
 * narrows to the function form (which is what `qtspIndexPlugin` returns)
 * and applies the stub `this`.
 */
async function runBuildStart(
  plugin: Plugin,
  thisArg: { addWatchFile: (p: string) => void },
): Promise<void> {
  const hook = plugin.buildStart;
  if (!hook) throw new Error('plugin has no buildStart hook');
  const fn = typeof hook === 'function' ? hook : hook.handler;
  await fn.call(thisArg as never, {} as never);
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'qtsp-test-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, content: string) {
  const full = join(tmp, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

/**
 * Stub `this` for `Plugin.buildStart`. Vite passes a `PluginContext` at
 * runtime; we only need `addWatchFile` to satisfy the plugin's hot-reload
 * call. `vi.fn()` lets us also assert the watch was registered.
 */
function ctx() {
  return { addWatchFile: vi.fn() };
}

const VALID_DIIA = {
  country: 'UA',
  qtspSlug: 'diia',
  displayName: 'Diia',
  qtspUrl: 'https://diia.gov.ua/',
  tslEntry: null,
  signingTool: {
    name: 'Diia mobile app',
    url: 'https://diia.gov.ua/',
    minVersion: null,
  },
  state: 'live',
  addedAt: '2026-05-05',
  promotedAt: '2026-05-05',
  lastVerified: '2026-05-05',
  notes: '',
};

const VALID_ARUBA = {
  country: 'IT',
  qtspSlug: 'aruba-pec',
  displayName: 'Aruba PEC',
  qtspUrl: 'https://www.pec.it/',
  tslEntry: null,
  signingTool: {
    name: 'ArubaSign',
    url: 'https://www.pec.it/firma-digitale.aspx',
    minVersion: null,
  },
  state: 'bronze',
  addedAt: '2026-05-05',
  promotedAt: null,
  lastVerified: '2026-05-05',
  notes: '',
};

describe('qtspIndexPlugin', () => {
  it('emits qtsp-index.ts with all valid meta.json files sorted by country+slug', async () => {
    write('fixtures/trust/ua/diia/meta.json', JSON.stringify(VALID_DIIA));
    write('fixtures/trust/it/aruba-pec/meta.json', JSON.stringify(VALID_ARUBA));
    const outFile = join(tmp, 'out/qtsp-index.ts');
    const plugin = qtspIndexPlugin({ root: tmp, outFile });
    const c = ctx();
    await runBuildStart(plugin, c);
    expect(existsSync(outFile)).toBe(true);
    const out = readFileSync(outFile, 'utf8');
    expect(out).toContain('"country":"IT"');
    expect(out).toContain('"country":"UA"');
    // Sort: IT < UA (lex by country first).
    expect(out.indexOf('"country":"IT"')).toBeLessThan(
      out.indexOf('"country":"UA"'),
    );
    // addWatchFile must be wired so dev-mode hot-reload picks up new
    // meta.json files without a full restart.
    expect(c.addWatchFile).toHaveBeenCalledWith(join(tmp, 'fixtures/trust'));
  });

  it('throws on invalid meta.json (schema violation)', async () => {
    write(
      'fixtures/trust/it/aruba-pec/meta.json',
      JSON.stringify({ country: 'lowercase' }),
    );
    const plugin = qtspIndexPlugin({
      root: tmp,
      outFile: join(tmp, 'out/qtsp-index.ts'),
    });
    await expect(runBuildStart(plugin, ctx())).rejects.toThrow(/aruba-pec/);
  });

  it('throws on duplicate (country, qtspSlug) across paths', async () => {
    // Two distinct on-disk paths claim the same logical (country=UA,
    // slug=diia) — the plugin must fail loud rather than silently
    // picking one. We use `ua/diia/` (canonical) and `ua/diia2/` with
    // qtspSlug='diia' inside the meta.json itself; the directory name
    // and the schema's qtspSlug field disagree, but the plugin keys on
    // the schema field.
    write('fixtures/trust/ua/diia/meta.json', JSON.stringify(VALID_DIIA));
    write(
      'fixtures/trust/ua/diia2/meta.json',
      JSON.stringify({ ...VALID_DIIA, qtspSlug: 'diia' }),
    );
    const plugin = qtspIndexPlugin({
      root: tmp,
      outFile: join(tmp, 'out/qtsp-index.ts'),
    });
    await expect(runBuildStart(plugin, ctx())).rejects.toThrow(/duplicate/i);
  });

  it('produces an empty QTSP_INDEX when fixture tree has no meta.json (does not throw)', async () => {
    // Lead's T5 heads-up: lets a fresh clone build cleanly before any
    // QTSP fixtures exist. Two sub-cases — `fixtures/trust/` doesn't
    // exist at all, and `fixtures/trust/` exists but has no meta.json
    // anywhere. Both must produce an empty index, not throw.
    const outFile = join(tmp, 'out/qtsp-index.ts');
    const plugin = qtspIndexPlugin({ root: tmp, outFile });
    // Sub-case A: trust root absent.
    await runBuildStart(plugin, ctx());
    expect(existsSync(outFile)).toBe(true);
    let out = readFileSync(outFile, 'utf8');
    expect(out).toMatch(/QTSP_INDEX[^=]*=\s*Object\.freeze\(\[\s*\]\)/);

    // Sub-case B: trust root present but empty subdirs (no meta.json).
    mkdirSync(join(tmp, 'fixtures/trust/ua/diia'), { recursive: true });
    await runBuildStart(plugin, ctx());
    out = readFileSync(outFile, 'utf8');
    expect(out).toMatch(/QTSP_INDEX[^=]*=\s*Object\.freeze\(\[\s*\]\)/);
  });

  it('declares enforce: "pre" so it runs before consumer plugins', () => {
    const plugin = qtspIndexPlugin({
      root: tmp,
      outFile: join(tmp, 'out/qtsp-index.ts'),
    });
    expect(plugin.enforce).toBe('pre');
    expect(plugin.name).toBe('qtsp-index');
  });
});
