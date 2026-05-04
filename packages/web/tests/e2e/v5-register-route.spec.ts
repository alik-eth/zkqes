// Smoke test for the V5 register-flow route. Confirms Step 1 renders,
// that no JS errors fire on initial load, and that the step-indicator
// is present — without requiring a wallet to actually connect.
//
// Important: the production vite build uses `base: './'` for relative
// asset paths, which means deep-linking to `/ua/registerV5` 404s the JS
// bundle (`/ua/assets/...` instead of `/assets/...`). All existing
// flow.spec.ts files navigate via `/` first, then use the SPA router.
// We follow that convention: load `/`, then push the V5 route through
// `history.pushState` and let TanStack Router pick it up. The full
// happy path (with mock wallet + mock prover) lives in v5-flow.spec.ts
// (Task 11).
//
// As of spec amendment 9c866ad the route is gated by
// assessDeviceCapability(); headless Chromium would otherwise be
// rerouted to /ua/use-desktop. We stub the storage manager up-front in
// each test so the gate clears and Step 1 renders.
import { expect, test } from '@playwright/test';

async function stubDeviceGate(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persist: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ quota: 8_000_000_000, usage: 0 }),
      },
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: 8,
    });
    // Task 13 atomic flip: the v2 `assessV2BrowserCapability` admits
    // only Firefox≥120 + deviceMemory≥8 (or the CLI-present path).
    // The default Playwright UA is Chromium → denied. Stub the UA so
    // the gate lets us through to Step 1.
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    });
  });
}

async function gotoV5Route(page: import('@playwright/test').Page) {
  await stubDeviceGate(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.history.pushState({}, '', '/ua/registerV5');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

test.describe('/ua/registerV5', () => {
  test('renders Step 1 (Connect your wallet) by default', async ({ page }) => {
    await gotoV5Route(page);
    await expect(
      page.getByRole('heading', { name: /Connect your wallet/i }),
    ).toBeVisible();
  });

  test('renders the v2 STEP-N-of-4 sticky-header strip on initial load', async ({ page }) => {
    await gotoV5Route(page);
    // Task 13 atomic flip: the legacy `1 — Connect` / `2 — Generate` /
    // etc. step-indicator labels (rendered by StepIndicatorV5 in the
    // civic-monumental body) were retired with the legacy body. The v2
    // shell renders a "STEP N of 4 · LABEL" sticky-header strip per
    // spec §5.1 instead. Tightened per #51 audit MEDIUM finding: assert
    // on the strip's actual active-step content, not on indicator
    // labels that render regardless of which step is active.
    const strip = page.getByTestId('register-v2-step-strip');
    await expect(strip).toBeVisible({ timeout: 5_000 });
    await expect(strip).toContainText(/STEP 1 of 4 · CONNECT WALLET/);
  });

  test('does not throw uncaught JS errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await gotoV5Route(page);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('exposes the RainbowKit Connect-Wallet button', async ({ page }) => {
    await gotoV5Route(page);
    // RainbowKit's default button text is "Connect Wallet".
    await expect(page.getByRole('button', { name: /Connect Wallet/i })).toBeVisible();
  });
});
