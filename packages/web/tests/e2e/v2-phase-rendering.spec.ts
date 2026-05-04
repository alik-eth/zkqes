// v2 phase-rendering smoke — Task 13 / spec §13 plan.
//
// Asserts the three phase states (`recruiting` / `ceremony-live` / `live`)
// render distinct chrome on Landing + /ceremony, and that the
// PreviewModeBanner emits-or-not correctly on the app routes per the
// v2 phase contract from `useCeremonyPhase`.
//
// Mocks `**/ceremony/status.json*` per phase; the SPA's own polling
// hook reads through that endpoint.
//
// Wired into the `v2` Playwright project alongside the v5-family
// specs (and into the `chromium` project for per-PR coverage of the
// v2 surface). Project filter is set in `playwright.config.ts`.

import { test, expect } from '@playwright/test';

const RECRUITING_STATUS = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

const CEREMONY_LIVE_STATUS = {
  ...RECRUITING_STATUS,
  round: 4,
  contributors: [
    {
      name: 'alik.eth',
      round: 1,
      completedAt: '2026-05-10T10:00:00Z',
      attestation:
        '0xaaa1111111111111111111111111111111111111111111111111111111111111',
    },
    {
      name: 'pse.research',
      round: 2,
      completedAt: '2026-05-11T10:00:00Z',
      attestation:
        '0xbbb2222222222222222222222222222222222222222222222222222222222222',
    },
    {
      name: 'mopro',
      round: 3,
      completedAt: '2026-05-12T10:00:00Z',
      attestation:
        '0xccc3333333333333333333333333333333333333333333333333333333333333',
    },
    {
      name: '0xPARC',
      round: 4,
      completedAt: '2026-05-13T10:00:00Z',
      attestation:
        '0xddd4444444444444444444444444444444444444444444444444444444444444',
    },
  ],
  phase: 'ceremony-live',
};

const LIVE_STATUS = {
  ...CEREMONY_LIVE_STATUS,
  round: 10,
  finalZkeySha256:
    '0xfff5555555555555555555555555555555555555555555555555555555555555',
  beaconBlockHeight: 21000000,
  beaconHash:
    '0xeee6666666666666666666666666666666666666666666666666666666666666',
  phase: 'live',
};

async function stubStatus(
  page: import('@playwright/test').Page,
  payload: unknown,
) {
  await page.route('**/ceremony/status.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }),
  );
}

test.describe('v2 phase rendering', () => {
  test('Landing — recruiting state surfaces yellow LED + round 0 of 10 + sidebar', async ({
    page,
  }) => {
    await stubStatus(page, RECRUITING_STATUS);
    await page.goto('/?variant=civic-terminal');
    await expect(page.getByLabel('phase: recruiting')).toBeVisible();
    await expect(page.getByText(/round 0 of 10/i)).toBeVisible();
    await expect(
      page.getByText(/awaiting first contributor/i).first(),
    ).toBeVisible();
  });

  test('Landing — ceremony-live state surfaces green LED + round 4 of 10', async ({
    page,
  }) => {
    await stubStatus(page, CEREMONY_LIVE_STATUS);
    await page.goto('/?variant=civic-terminal');
    await expect(page.getByLabel('phase: ceremony-live')).toBeVisible();
    await expect(page.getByText(/round 4 of 10/i)).toBeVisible();
  });

  test('Landing — live state surfaces blue LED', async ({ page }) => {
    await stubStatus(page, LIVE_STATUS);
    await page.goto('/?variant=civic-terminal');
    await expect(page.getByLabel('phase: live')).toBeVisible();
  });

  test('/ceremony — round chain renders attested contributors + at least one pending row', async ({
    page,
  }) => {
    await stubStatus(page, CEREMONY_LIVE_STATUS);
    await page.goto('/ceremony');
    await expect(page.getByText('alik.eth').first()).toBeVisible();
    await expect(page.getByText('pse.research').first()).toBeVisible();
    await expect(
      page.getByText(/awaiting contributor/).first(),
    ).toBeVisible();
  });

  test('PreviewModeBanner emits on /ua/registerV5 when phase != live', async ({
    page,
  }) => {
    await stubStatus(page, RECRUITING_STATUS);
    await page.goto('/ua/registerV5');
    await expect(page.getByText(/PREVIEW MODE/).first()).toBeVisible();
  });

  test('PreviewModeBanner does NOT emit on /ua/registerV5 when phase=live', async ({
    page,
  }) => {
    await stubStatus(page, LIVE_STATUS);
    await page.goto('/ua/registerV5');
    await expect(page.getByText(/PREVIEW MODE/)).toHaveCount(0);
  });
});
