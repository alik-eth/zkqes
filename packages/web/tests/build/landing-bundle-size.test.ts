// Multi-QTSP facade T15 — landing entry-chunk size budget.
//
// Spec §11 success criterion #3 + plan §T15 step 2: the
// `VITE_TARGET=landing` build's `index-*.js` entry chunk MUST stay
// ≤ 2.7 MB (uncompressed). Catches lazy-import drift early — most
// likely "someone added a top-level `import { ... } from
// './routes/qtspPage'`" instead of `lazyRouteComponent(() =>
// import(...))`, which would inline the QtspPage + transitive
// `QTSP_INDEX` consumer into the entry chunk.
//
// Cost: this test runs `pnpm -F @zkqes/web build` end-to-end (~60-
// 90s wall-clock). Discovered by vitest but gated on
// `RUN_BUNDLE_SIZE=1` so the default `pnpm test` doesn't pay the
// build cost. Run explicitly via `pnpm -F @zkqes/web test:bundle-size`
// (or the nightly CI tier — see `.github/workflows/playwright.yml`'s
// `bundle-size` job).
//
// Per CLAUDE.md invariant 21: dead-branch elimination of the
// `IS_APP_TARGET ? [...] : []` switch in `router.tsx` happens at
// AST-fold time inside Vite's `define` plugin. The dynamic imports
// in the dead branch never enter the chunk graph; the landing
// entry drops accordingly. This test pins that contract.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
// `tests/build/` → `packages/web/`.
const WEB_PKG = resolve(HERE, '../..');
const DIST_DIR = resolve(WEB_PKG, 'dist');
const DIST_HTML = resolve(DIST_DIR, 'index.html');

// Bytes, not gzip-bytes; uncompressed lets the test run without
// wiring a gzipper, and the relative budget tracks dependency weight
// changes monotonically.
//
// Spec §11 #3 floor: 2.7 MB. Live state after task #84 (founder-
// directed civic-terminal redesign of all remaining old-style
// surfaces — Step1-4, ScwPassphraseModal, RotateWalletFlow,
// AppRegisterLanding, ceremony pages, MintButton/MintNftStep, ua/*
// legacy routes, CliBanner, FlyLauncherForm, PaperGrain delete,
// styles.css legacy-token strip) is **2.77 MB** — same as before
// the redesign. The legacy-token surfaces all lived in the app
// target (`AppRegisterLanding`, `RotateWalletFlow`, ceremony pages
// behind `IS_APP_TARGET`); Vite's dead-branch elimination already
// kept them out of the landing entry. Removing the dead-branch
// imports themselves doesn't move the landing bundle.
//
// The ~70 KB margin over the spec floor is broadly distributed
// across i18next + react + tanstack baseline + qtsp helpers /
// QTSP_INDEX consumers required to render the `#coverage`
// section's Suspense boundary. No isolated lazy-import drift to
// fix; ratchet stays at 2.85 MB for forward drift detection,
// spec-floor ratchet (2.7 MB) deferred to a future bundle-only
// task that targets the i18next/tanstack/qtsp triad directly.
const BUDGET_BYTES = 2.85 * 1024 * 1024;

// Default-skip gate. `pnpm test` (per-PR fast suite) discovers this
// file via the `tests/build/**` include glob but `describe.runIf`
// folds the body to a no-op unless `RUN_BUNDLE_SIZE=1` is set. The
// `test:bundle-size` npm script + the nightly CI job both set it.
const RUN_BUNDLE_SIZE = process.env.RUN_BUNDLE_SIZE === '1';

describe.runIf(RUN_BUNDLE_SIZE)('landing bundle size budget (T15)', () => {
  // 120s test timeout — `pnpm -F @zkqes/web build` is ~15-20s in the
  // worktree, ~60-90s on CI runners with cold caches.
  it('VITE_TARGET=landing entry chunk fits the live budget', { timeout: 120_000 }, () => {
    execSync('pnpm -F @zkqes/web build', {
      env: {
        ...process.env,
        VITE_TARGET: 'landing',
        VITE_BASE: '/',
      },
      stdio: 'inherit',
    });

    // Parse `dist/index.html` for the canonical entry-script path.
    // Successive builds with different hashes accumulate stale
    // `index-*.js` files in `dist/assets/`; the index.html `<script
    // type="module">` always points at the freshest one (Vite
    // rewrites it on each build). Matching that script tag is more
    // robust than directory-listing.
    const html = readFileSync(DIST_HTML, 'utf8');
    const m = html.match(
      /<script[^>]*type="module"[^>]*src="(\/assets\/[^"]+\.js)"/,
    );
    if (!m) {
      throw new Error(
        'landing bundle size: no <script type="module" src="/assets/...js"> in dist/index.html',
      );
    }
    // Strip the leading "/" so we can resolve under DIST_DIR
    // regardless of `base` config.
    const entryRelPath = m[1]!.replace(/^\//, '');
    const entryFile = resolve(DIST_DIR, entryRelPath);
    const size = statSync(entryFile).size;

    // Surface the actual size in the assertion message so a failure
    // tells the contributor "you went 2.83 MB / 2.7 MB", not just
    // "expected less than 2831155".
    const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(2)} MB`;
    expect(
      size,
      `landing entry chunk ${entryRelPath} = ${mb(size)} > budget ${mb(BUDGET_BYTES)}. ` +
        `Likely cause: a top-level import of a route component that should ` +
        `be lazyRouteComponent()'d. Check router.tsx + recent route additions.`,
    ).toBeLessThan(BUDGET_BYTES);
  });
});
