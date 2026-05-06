import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type AnyRoute,
  Outlet,
} from '@tanstack/react-router';
// `IS_APP_TARGET` constant from `./lib/buildTarget` is fine for runtime
// checks but is NOT used here as the dead-branch guard: Rollup processes
// the module graph (registering dynamic imports as chunks) BEFORE
// terser/esbuild do constant folding. So even if `IS_APP_TARGET === false`
// folds to `false` post-Rollup, the dynamic imports inside the dead
// `[...]` branch have already been added to the chunk graph by then.
//
// Inlining `import.meta.env.VITE_TARGET === 'app'` at the comparison
// site lets Vite's `define` plugin substitute the literal string at
// source-text time, so Rollup itself sees `"landing" === "app"` (or
// `"app" === "app"`) when parsing the AST — and DOES constant-fold
// before module-graph processing. With the branch literally
// `false ? [...] : []`, the `[...]` is never parsed, the dynamic
// imports never enter the chunk graph, and the landing entry chunk
// drops by ~4 MB.
//
// The comparison string is duplicated between buildTarget.ts and
// here; if a third call site emerges, factor through a build-time
// macro (`vite-plugin-replace` or a custom transform), not a runtime
// const.
import { IndexScreen } from './routes/index';
import { IntegrationsScreen } from './routes/integrations';
import { CeremonyIndex } from './routes/ceremony/index';
import { CeremonyContribute } from './routes/ceremony/contribute';
import { CeremonyStatus } from './routes/ceremony/status';
import { CeremonyVerify } from './routes/ceremony/verify';
import { VerifyBindingScreen } from './routes/verifyBinding';
import { AboutScreen } from './routes/about';

function RootLayout() {
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: RootLayout });

// ---------------------------------------------------------------- //
// Shared routes — present on BOTH `landing` and `app` targets.     //
// Static imports OK because both builds need these routes.         //
// ---------------------------------------------------------------- //
// IndexScreen itself is target-aware: it renders the pre-ceremony
// hero on the landing target (zkqes.org root) and the existing
// register-flow landing on the app target (app.zkqes.org). See
// `routes/index.tsx`.

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexScreen,
});

const ceremonyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ceremony',
  component: CeremonyIndex,
});

const ceremonyContributeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ceremony/contribute',
  component: CeremonyContribute,
});

const ceremonyStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ceremony/status',
  component: CeremonyStatus,
});

const ceremonyVerifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ceremony/verify',
  component: CeremonyVerify,
});

const integrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/integrations',
  component: IntegrationsScreen,
});

// Multi-QTSP facade T10: per-QTSP detail surface at
// `/qtsp/$country/$qtsp`. Lazy-loaded via `lazyRouteComponent` so the
// page (and its `QTSP_INDEX` import) stays out of the landing entry
// chunk per CLAUDE.md invariant 21. Reach-tested by T15.
const qtspPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'qtsp/$country/$qtsp',
  component: lazyRouteComponent(() => import('./routes/qtspPage')),
});

// `/qtsps` — full QTSP directory (founder ask 2026-05-06): every
// EU LOTL + UA TL-EC trust-service provider, one row per (country,
// tspName), with ECDSA-P-256 + DOB-format columns. Lazy-loaded so
// the generated TS table doesn't enter the landing entry
// chunk.
const allQtspsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/qtsps',
  component: lazyRouteComponent(() => import('./routes/allQtsps')),
});

// Multi-QTSP facade T11: `/countries` soft-redirect to Landing's
// `#coverage` anchor. Targeted by bronze-tile direct-loads from T10
// and by URL-typed `/countries` arrivals. Lazy-loaded for chunk
// hygiene (the body is tiny, but consistency-first).
const countriesRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/countries',
  component: lazyRouteComponent(() => import('./routes/countriesRedirect')),
});

// /verify — civic-terminal v3 binding-lookup surface (founder pick
// 2026-05-05 per Claude Design handoff). Net-new top-level route,
// distinct from /ceremony/verify (which verifies attestation hashes
// against the ceremony chain). Static composition — no wallet
// connection required, no SAB context — so it's safe to ship on
// landing target as a sharedRoute.
const verifyBindingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify',
  component: VerifyBindingScreen,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutScreen,
});

const sharedRoutes: AnyRoute[] = [
  indexRoute,
  ceremonyRoute,
  ceremonyContributeRoute,
  ceremonyStatusRoute,
  ceremonyVerifyRoute,
  integrationsRoute,
  qtspPageRoute,
  allQtspsRoute,
  countriesRedirectRoute,
  verifyBindingRoute,
  aboutRoute,
];

// ---------------------------------------------------------------- //
// App-only routes — register + rotate flow + UA mint pipeline.     //
// Excluded from `landing` builds per BRAND.md §Domains.            //
//                                                                   //
// **Lazy-loaded via `lazyRouteComponent`** — converts the static     //
// imports to dynamic ones so the heavy app deps (wagmi, metamask    //
// SDK, snarkjs, the V5 prover worker, the SDK's witness builder)    //
// don't anchor into the landing bundle. The dynamic imports live    //
// inside the `IS_APP_TARGET ? ... : []` branch; with                 //
// `IS_APP_TARGET === false` becoming a compile-time constant after  //
// Vite's env replacement, terser/esbuild eliminates the dead         //
// branch and the dynamic imports are never emitted. Verified         //
// empirically — landing build drops from ~13 MB (C2) to a small      //
// fraction (C3 commit footer reports the exact delta).               //
//                                                                   //
// Adding a new route to this set: just append another entry. Adding  //
// a new SHARED route (visible on both targets): add to               //
// `sharedRoutes` above instead, with a static import.                //
// ---------------------------------------------------------------- //

// Negated check so the default (env var unset) keeps the app routes
// — preserves the existing pages.yml workflow's behaviour, which
// builds without setting VITE_TARGET. Only an explicit
// `VITE_TARGET=landing` drops the app routes.
const appOnlyRoutes: AnyRoute[] = import.meta.env.VITE_TARGET !== 'landing'
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/ua/cli',
        component: lazyRouteComponent(
          () => import('./routes/ua/cli'),
          'CliInstall',
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/ua/submit',
        component: lazyRouteComponent(
          () => import('./routes/ua/submit'),
          'SubmitScreen',
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/ua/mint',
        component: lazyRouteComponent(
          () => import('./routes/ua/mint'),
          'MintScreen',
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/ua/registerV5',
        // T13: switched to default-export `RegisterV5Route` wrapper
        // which reads `?qtsp=` via `useSearch` and threads scope down
        // to `RegisterV5Screen`. UA-default behavior preserved when
        // `?qtsp=` is absent / malformed / bronze.
        component: lazyRouteComponent(() => import('./routes/ua/registerV5')),
      }),
      // T13: alias path. `/v5/registerV5` is the canonical multi-QTSP
      // entry point that QtspPage CTAs (T10) link to. Same component
      // as `/ua/registerV5`; the route distinction is just URL polish
      // for "this is the protocol-level register flow, not a
      // UA-specific page." Future work may collapse them once the
      // existing `/ua/registerV5` inbound links + e2e tests rotate.
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/v5/registerV5',
        component: lazyRouteComponent(() => import('./routes/ua/registerV5')),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/ua/mintNft',
        component: lazyRouteComponent(
          () => import('./routes/ua/mintNft'),
          'MintNftScreen',
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/ua/use-desktop',
        component: lazyRouteComponent(
          () => import('./routes/ua/useDesktop'),
          'UseDesktopScreen',
        ),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/account/rotate',
        component: lazyRouteComponent(
          () => import('./routes/account/rotate'),
          'AccountRotateScreen',
        ),
      }),
      // V5.4 — age verification flow (orchestration §S2.1 step 5,
      // web plan T4). App-target only: the flow needs wagmi +
      // SAB-Worker prover + on-chain ZKQES_REGISTRY_UA reads
      // (post-Phase-C). Today's Phase A skeleton ships under MockProver.
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/account/prove-age',
        component: lazyRouteComponent(
          () => import('./routes/account/proveAge'),
          'AccountProveAgeScreen',
        ),
      }),
    ]
  : [];

const routeTree = rootRoute.addChildren([...sharedRoutes, ...appOnlyRoutes]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
