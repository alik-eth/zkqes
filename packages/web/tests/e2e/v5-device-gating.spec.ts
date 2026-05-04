// Device-gating e2e — civic-terminal v2 inline gate (post-Task-13 flip).
//
// V5.0 redirect-to-/ua/use-desktop was REPLACED by the inline
// <DeviceReadinessGate> from Task 8 in the v2 atomic flip (Task 13).
// Denied users no longer get bounced to a separate page; they see
// option A (Firefox+RAM) + option B (zkqes serve CLI) inline below the
// PreviewModeBanner. This spec asserts that contract.
//
// Methodology: stub navigator.userAgent + navigator.deviceMemory in an
// init script (same pattern as the prior V5.0 spec), then assert the
// inline panel's testid + copy.
//
// Per #51 audit MEDIUM finding tightening: the previous
// `getByTestId('use-desktop-page')` assertion was loose (testid on the
// route's wrapping <main>, would pass for any arrival on
// /ua/use-desktop). The v2 inline-panel assertions below target the
// gate's actual content (DEVICE NOT READY heading + option A + option
// B), so a regression that lands the user on the page for an unrelated
// reason wouldn't pass this test.

import { expect, test } from '@playwright/test';

const TELEGRAM_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0.0.0 Mobile Safari/537.36 Telegram/10.13.0';
const FLAGSHIP_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

test.describe('/ua/registerV5 device gate (v2 inline)', () => {
  test('Telegram in-app WebView surfaces the inline DEVICE NOT READY panel', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ userAgent: TELEGRAM_UA });
    const page = await ctx.newPage();
    // Stub navigator.deviceMemory to ensure the v2 capability check
    // takes the deny branch via the browser-Firefox-version test
    // (assessV2BrowserCapability requires Firefox≥120 + memory≥8).
    // Telegram UA fails the Firefox-vs-derivative gate first.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', {
        configurable: true,
        value: 8,
      });
    });

    await page.goto('/ua/registerV5');

    // Inline DENIED panel renders — `role="alert"` + the FROZEN copy.
    await expect(page.getByText(/DEVICE NOT READY/)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/OPTION A/)).toBeVisible();
    await expect(page.getByText(/OPTION B/)).toBeVisible();
    // Step 1 of the prove flow MUST NOT have rendered.
    await expect(
      page.getByRole('heading', { name: /Connect your wallet/i }),
    ).toHaveCount(0);
    // The gate must NOT redirect — user stays on /ua/registerV5.
    await expect(page).toHaveURL(/\/ua\/registerV5/);

    await ctx.close();
  });

  test('Firefox 121 + 8 GB RAM passes the gate and renders Step 1', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ userAgent: FLAGSHIP_UA });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', {
        configurable: true,
        value: 8,
      });
    });

    await page.goto('/ua/registerV5');

    // The Step 1 heading is the canonical signal that the gate let us
    // through; the v2 shell renders it inside <DeviceReadinessGate>.
    await expect(
      page.getByRole('heading', { name: /Connect your wallet/i }),
    ).toBeVisible({ timeout: 5_000 });
    // The DENIED panel must NOT render.
    await expect(page.getByText(/DEVICE NOT READY/)).toHaveCount(0);

    await ctx.close();
  });
});
