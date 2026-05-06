import { CivicTerminalLanding } from '../components/CivicTerminalLanding';
import { HomeDocument } from '../components/civic-terminal/HomeDocument';
import { LandingHero } from '../components/LandingHero';
import '../styles/civic-terminal.css';
import '../styles/curve.css';

/**
 * Root `/` route — surface depends on a runtime variant flag, then on
 * the SPA's build target.
 *
 * **2026-05-05 (Task #87, civic-terminal v3):** the default `/` surface
 * (when `VITE_TARGET=app`) is now `HomeDocument` — the founder-picked
 * "Home C — Document" wireframe (a Form ZK-QES / 01 civic-document with
 * UA-blue letterhead, ASCII figure, two CTAs). It replaces the v2
 * `AppRegisterLanding` (KICKER + h1.ct-display + privacy <dl>). The v2
 * component file is left in place but no longer referenced from the
 * default route.
 *
 * Variant flag (prototype gate, lead dispatch 2026-05-04, kept for
 * comparison review):
 *   `?variant=civic-terminal` → render `CivicTerminalLanding` (the v2
 *   variant-D Curve-router shell, pre-launch empty-states). Removing
 *   the gate is the cleanup path once the v3 review settles.
 *
 * `VITE_TARGET=landing` (zkqes.org root) — pre-ceremony hero +
 * recruitment CTA. `LandingHero` carries the BRAND.md descriptor lead
 * + three contribution paths + status feed link. NO register flow.
 *
 * `VITE_TARGET=app` (app.zkqes.org, default) — the v3 `<HomeDocument />`
 * civic-document landing. `HomeDocument` is landing-target safe (no
 * wagmi, no SAB context, no snarkjs) — composes only from sharedRoutes-
 * safe primitives per CLAUDE.md invariant #21 — but the route
 * partition keeps the app build the canonical home for it; the landing
 * build still ships `LandingHero` for zkqes.org root.
 *
 * The VITE_TARGET branch is on a compile-time constant, so
 * terser/esbuild eliminates the dead branch at build time. The
 * variant-flag branch IS bundled into both builds (small cost) — when
 * the v2 prototype review closes, either delete `CivicTerminalLanding`
 * or remove the gate.
 */
export function IndexScreen() {
  // Variant flag — runtime URL check. `window` is always defined in
  // the SPA runtime; the `typeof` guard is defensive against any
  // future SSR / pre-render path.
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('variant') ===
      'civic-terminal'
  ) {
    return <CivicTerminalLanding />;
  }

  // Direct env-var comparison rather than the `IS_LANDING_TARGET`
  // indirection — same reason as the comment in `router.tsx`: Vite's
  // `define` plugin substitutes the literal string at source-text
  // time, letting Rollup/terser fold the dead branch BEFORE the
  // module graph is finalized. Going through a const breaks the
  // substitution match and the dead branch (with its static imports)
  // ships in the bundle.
  if (import.meta.env.VITE_TARGET === 'landing') {
    return <LandingHero />;
  }
  return <HomeDocument />;
}
