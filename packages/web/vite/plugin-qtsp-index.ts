// Multi-QTSP facade T5 — Vite plugin that walks `fixtures/trust/` and
// emits a typed `qtsp-index.ts` consumed by the Landing tile grid + the
// `/qtsp/$country/$qtsp` route.
//
// Plugin shape per plan §T5 with three lead-mandated tweaks:
//
//   1. `enforce: 'pre'` — runs before consumer plugins. The Landing
//      tile-grid component is built on top of `vite-static-copy` +
//      i18next-backend reads, both of which want the index file
//      emitted before they kick in. `pre` collapses that race.
//
//   2. `this.addWatchFile(trustRoot)` inside `buildStart` — gives dev
//      mode hot-reload semantics: dropping a new `meta.json` into
//      `fixtures/trust/<cc>/<slug>/` triggers a rebuild without
//      `pnpm dev` restart.
//
//   3. Empty fixture tree is NOT a fatal — emit `Object.freeze([])` and
//      keep going. Lets `pnpm install && pnpm build` succeed on a fresh
//      clone, even before any QTSP fixture lands. The sort/dup/schema
//      checks all stay strict; only the "no input at all" case is
//      lenient.
//
// Anchor:
//   - Spec: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md
//   - Plan: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md §T5

import type { Plugin } from 'vite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
// Importing from the SDK's leaf subpath rather than the package barrel
// `@zkqes/sdk` is deliberate: vite.config.ts is loaded by Node's strict
// ESM resolver, which trips on the SDK barrel's extension-less internal
// imports (TS `moduleResolution: "Bundler"` + `verbatimModuleSyntax`
// emits `from './x'` rather than `'./x.js'`). `qtspMeta` is leaf-level
// and only depends on `zod`, so the subpath import avoids dragging the
// whole SDK module tree through Node ESM at config-load time. The
// matching `./country/qtspMeta` entry in `@zkqes/sdk`'s package.json
// `exports` field gates this access.
import { QtspMetaSchema, type QtspMeta } from '@zkqes/sdk/country/qtspMeta';

export interface QtspIndexPluginOptions {
  /** Repository root. The plugin walks `${root}/fixtures/trust/`. */
  root: string;
  /**
   * Absolute path to write the generated index to. Typically
   * `packages/web/src/generated/qtsp-index.ts`. Parent directories are
   * created if missing.
   */
  outFile: string;
  /**
   * Optional. Absolute path to mirror per-QTSP runtime data files
   * (`samples.json`, `intermediates/*.pem`) under so they're served
   * by Vite at `/qtsp-data/<cc>/<slug>/...`. Typically
   * `packages/web/public/qtsp-data`. Omit to disable the runtime-data
   * copy step (tests that only care about the index emit).
   *
   * Files copied at this level (T10 minimum):
   *   - `<src>/<cc>/<slug>/samples.json`        → optional (no copy if absent)
   *   - `<src>/<cc>/<slug>/intermediates/*.pem` → optional (no copy if absent)
   *
   * UA/diia today has neither, so the copy step is a no-op for it.
   * Adding either file in the source tree triggers a copy on the
   * next dev-server restart / `pnpm build`.
   */
  publicDataDir?: string;
}

/**
 * List immediate subdirectories of `dir`. Returns `[]` if `dir` doesn't
 * exist (intentional — see the "empty fixture tree" lenience above) or
 * contains only files.
 */
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

/**
 * Copy `samples.json` and `intermediates/*.pem` for one QTSP into the
 * per-(cc, slug) public-data subdirectory, creating parent dirs as
 * needed. Both source paths are optional — the plugin doesn't require
 * either to exist (UA/diia today has neither). The destination
 * directory is always created so the QtspPage can `fetch` and get a
 * clean 404 from Vite's static handler rather than an error masking
 * a real bug.
 */
function copyQtspRuntimeData(
  srcDirOnDisk: string,
  publicDir: string,
  destCc: string,
  destSlug: string,
): void {
  // `srcDirOnDisk` is the case-as-typed-by-contributor path inside
  // `fixtures/trust/`; destination uses the canonical (schema-validated)
  // country code so URL routing keys off a stable shape regardless of
  // contributor casing.
  const srcDir = srcDirOnDisk;
  const destDir = join(publicDir, destCc, destSlug);
  mkdirSync(destDir, { recursive: true });

  // samples.json — single optional file.
  const samplesSrc = join(srcDir, 'samples.json');
  if (existsSync(samplesSrc)) {
    copyFileSync(samplesSrc, join(destDir, 'samples.json'));
  }

  // intermediates/*.pem — optional dir of cert files.
  const intermediatesSrc = join(srcDir, 'intermediates');
  if (existsSync(intermediatesSrc)) {
    const intermediatesDest = join(destDir, 'intermediates');
    mkdirSync(intermediatesDest, { recursive: true });
    for (const name of readdirSync(intermediatesSrc)) {
      if (!name.endsWith('.pem')) continue;
      copyFileSync(
        join(intermediatesSrc, name),
        join(intermediatesDest, name),
      );
    }
  }
}

/**
 * Generate the QTSP index file + (optionally) mirror per-QTSP runtime
 * data into a public-assets dir. Pure side-effecting function; no
 * Vite-specific machinery, so a `prebuild` script can call it before
 * `tsc -b` runs and the consumer modules find their import target.
 *
 * Returns the path of the generated index file so callers can log /
 * watch it; throws on schema or duplication failures (same as the
 * Vite plugin's `buildStart` path — there's only one set of error
 * semantics).
 */
export function generateQtspIndex(opts: QtspIndexPluginOptions): string {
  const trustRoot = resolve(opts.root, 'fixtures/trust');
  const entries: QtspMeta[] = [];
  const seen = new Set<string>();

  // Walk `<trustRoot>/<cc>/<slug>/meta.json`. Missing trustRoot or
  // empty subdirs flow through this loop as a no-op — that's the
  // "fresh clone" lenience.
  for (const cc of readSubdirs(trustRoot)) {
    const ccDir = join(trustRoot, cc);
    for (const slug of readSubdirs(ccDir)) {
      const metaPath = join(ccDir, slug, 'meta.json');
      if (!existsSync(metaPath)) continue;

      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(metaPath, 'utf8'));
      } catch (e) {
        throw new Error(
          `qtsp-index: parse failed at ${metaPath}: ${(e as Error).message}`,
        );
      }
      const result = QtspMetaSchema.safeParse(raw);
      if (!result.success) {
        // Surface the offending path (incl. slug) so a fixture-level
        // schema break in CI tells the contributor exactly which
        // meta.json is wrong, not just "schema mismatch".
        throw new Error(
          `qtsp-index: schema fail at ${metaPath} (${cc}/${slug}): ${result.error.message}`,
        );
      }
      const key = `${result.data.country}/${result.data.qtspSlug}`;
      if (seen.has(key)) {
        throw new Error(
          `qtsp-index: duplicate (country, qtspSlug) ${key} — second occurrence at ${metaPath}`,
        );
      }
      seen.add(key);
      entries.push(result.data);

      // Mirror runtime data files alongside meta.json so the
      // QtspPage's lazy fetches land at `/qtsp-data/<cc>/<slug>/...`.
      // Keyed off the meta.json being valid, NOT the directory's
      // raw existence — that way invalid stragglers don't ship.
      if (opts.publicDataDir !== undefined) {
        copyQtspRuntimeData(
          join(ccDir, slug),
          opts.publicDataDir,
          result.data.country,
          result.data.qtspSlug,
        );
      }
    }
  }

  // Canonical sort: country alpha first, then slug. Stable + locale-
  // independent (we already guard country to ASCII upper, slug to
  // ASCII lower).
  entries.sort((a, b) =>
    a.country !== b.country
      ? a.country.localeCompare(b.country)
      : a.qtspSlug.localeCompare(b.qtspSlug),
  );

  const out = [
    '// AUTO-GENERATED by qtspIndexPlugin — do not edit by hand.',
    '// Source of truth: fixtures/trust/<cc>/<slug>/meta.json.',
    "import type { QtspMeta } from '@zkqes/sdk';",
    '',
    'export const QTSP_INDEX: ReadonlyArray<QtspMeta> = Object.freeze([',
    ...entries.map((e) => `  ${JSON.stringify(e)},`),
    ']);',
    '',
  ].join('\n');

  mkdirSync(dirname(opts.outFile), { recursive: true });
  writeFileSync(opts.outFile, out);
  return opts.outFile;
}

export function qtspIndexPlugin(opts: QtspIndexPluginOptions): Plugin {
  return {
    name: 'qtsp-index',
    enforce: 'pre',
    buildStart() {
      generateQtspIndex(opts);
      // Dev-mode hot-reload hook. `addWatchFile` is the official Vite
      // API for "rebuild me when this path changes." Optional-chained
      // because the unit test harness passes a stub `this` — at
      // runtime Vite always provides it.
      this.addWatchFile?.(resolve(opts.root, 'fixtures/trust'));
    },
  };
}
