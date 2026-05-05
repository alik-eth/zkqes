import { Buffer as BufferShim } from 'buffer';
import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './lib/i18n';
import './styles.css';

// Pin the polyfilled Buffer onto globalThis BEFORE any SDK code runs.
// @zkqes/sdk's compiled JS (under `witness/v5/`) reads `globalThis.Buffer`
// rather than importing 'buffer' directly, since cross-package imports of
// 'buffer' don't resolve through vite-plugin-node-polyfills' shim under
// strict pnpm. Setting it here at app entry fixes module-evaluation-time
// access in SDK chunks.
(globalThis as unknown as { Buffer: typeof BufferShim }).Buffer = BufferShim;

// VITE_TARGET=landing strips wagmi/RainbowKit from the chunk graph.
// WalletProvider's module evaluates `getDefaultConfig({ projectId })` at
// import time, so a static import would crash zkqes.org with "No
// projectId found" even though the landing routes never use wallet
// state. Conditional dynamic import + a no-op passthrough on landing.
// Per CLAUDE.md invariant #21, the env check is inlined here (not
// routed through buildTarget.ts) so Rollup's chunk-graph pass sees the
// literal substitution and elides the dynamic import on landing builds.
const WalletProvider = import.meta.env.VITE_TARGET === 'landing'
  ? ({ children }: { children: ReactNode }) => <>{children}</>
  : lazy(() =>
      import('./components/wallet/WalletProvider').then((m) => ({
        default: m.WalletProvider,
      })),
    );

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <Suspense fallback={null}>
      <WalletProvider>
        <RouterProvider router={router} />
      </WalletProvider>
    </Suspense>
  </StrictMode>,
);
