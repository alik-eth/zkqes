import { test, expect } from '@playwright/test';
import { injectMockWallet } from './helpers/walletMock';

// V4 secondary-path coverage. The original spec walked
//   landing → click "Use the CLI instead" → /ua/cli
//   /ua/cli → click "I have proof.json" → /ua/submit
//   /ua/submit → assert "Drag proof.json here" copy
//
// Task 13 + V5.4 surfaced #78: the V4 link "I have proof.json" no
// longer exists on `/ua/cli` because that route was rewritten in
// V5.4 to install instructions for `zkqes serve` (the V5.4 native
// rapidsnark CLI server) — NOT the V4 proof.json upload chain.
//
// Diagnosis (2026-05-04, web-eng): `/ua/cli` no longer surfaces a
// `/ua/submit` link of any kind. Only the `← back` link in
// `/ua/submit` points BACK to `/ua/cli`. The /ua/cli → /ua/submit
// arrow in the V5.4 UX is intentionally one-way; the V4 secondary
// path's two-hop chain is now a one-hop deep-link to /ua/submit.
//
// Resolution per lead's "don't blindly delete the test — it's the
// only chromium-tier coverage of the V4 secondary path": split into
// two narrower tests that validate the V4 plumbing that STILL
// exists post-V5.4:
//
//   1. Landing → "Use the CLI instead" → /ua/cli (the secondary
//      CTA still routes; landing-side wiring lives in
//      `MintButton.tsx`).
//   2. Direct deep-link /ua/submit → "Drag proof.json here" copy
//      renders (the V4 submit page is still reachable + functional).
//
// Both tests exercise the V4 plumbing without depending on the
// retired /ua/cli → /ua/submit forward link.

test('flow — V4 secondary path: landing → /ua/cli (secondary CTA still routes)', async ({
  page,
}) => {
  await injectMockWallet(page, {
    address: ('0x' + 'a'.repeat(40)) as `0x${string}`,
    chainId: 11155111,
  });
  await page.goto('/');
  // Primary CTA is the V5 register flow (/ua/registerV5); the secondary
  // "Use the CLI instead" link is rendered beneath the primary CTA when
  // the user is unregistered.
  await page.getByRole('link', { name: /Use the CLI instead/i }).click();
  await expect(page).toHaveURL(/\/ua\/cli/);
});

test('flow — V4 submit page is reachable + renders proof.json drop copy', async ({
  page,
}) => {
  // Direct deep-link to /ua/submit. This is the surface that the V4
  // proof.json upload flow lives on. Post-V5.4 it's not chained from
  // /ua/cli's content, but the page itself is unchanged.
  await page.goto('/ua/submit');
  await expect(page.getByText(/Drag proof\.json here/i)).toBeVisible();
});
