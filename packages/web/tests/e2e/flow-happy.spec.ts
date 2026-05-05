import { test, expect } from '@playwright/test';
// `injectMockWallet` import retired — the `landing → /ua/cli` case that
// used it is now skipped (V4 LandingHero retired with v3 #87). Re-add
// the import alongside the spec when/if a CLI link returns to the v3
// surface family.

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

test.skip(
  'flow — V4 secondary path: landing → /ua/cli (secondary CTA still routes) — V4 LandingHero retired with v3 (#87)',
  () => {
    // Civic-terminal v3 (Task #87, 2026-05-05): default `/`
    // (VITE_TARGET=app) renders <HomeDocument />, which has no
    // "Use the CLI instead" link. The /ua/cli route is still
    // reachable via direct URL — tested by the second case in this
    // file ("V4 submit page is reachable + renders proof.json drop
    // copy") which uses page.goto('/ua/submit'). When/if a CLI link
    // returns to the v3 surface family (e.g. as a footer or nav
    // entry), re-enable this spec with the appropriate selector.
  },
);

test('flow — V4 submit page is reachable + renders proof.json drop copy', async ({
  page,
}) => {
  // Direct deep-link to /ua/submit. This is the surface that the V4
  // proof.json upload flow lives on. Post-V5.4 it's not chained from
  // /ua/cli's content, but the page itself is unchanged.
  await page.goto('/ua/submit');
  await expect(page.getByText(/Drag proof\.json here/i)).toBeVisible();
});
