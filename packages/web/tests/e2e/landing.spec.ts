import { test, expect } from '@playwright/test';

// Civic-terminal v3 landing tests (post-Task-#87, 2026-05-05). The
// default `/` (VITE_TARGET=app) renders <HomeDocument />, the
// founder-picked Home-C-Document wireframe — a Form ZK-QES / 01
// civic-document with UA-blue letterhead, ASCII figure, two CTAs.
//
// The v2 <AppRegisterLanding /> assertions retired here:
//   - "Verified Identity" heading           → letterhead "OFFICE OF THE ZERO-KNOWLEDGE REGISTRAR"
//   - ConnectButton on `/`                  → no longer rendered; lives on /ua/registerV5 + /verify
//   - "switch network" CTA on `/`           → same; not on the document landing
//   - privacy-escrow <dl>                   → replaced by SECTION I (LEGAL BASIS) + SECTION II (WHAT YOU GET)
//   - `landing-ceremony-link` testid        → not on v3; entry to /ceremony moves to top-nav / direct URL

test('landing — v3 document letterhead renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-document-v3-shell')).toBeVisible();
  await expect(page.getByTestId('home-document-v3-letterhead')).toBeVisible();
  await expect(
    page.getByText(/OFFICE OF THE ZERO-KNOWLEDGE REGISTRAR/i),
  ).toBeVisible();
});

test('landing — v3 SECTION I (legal basis) + SECTION II (what you get) render', async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('qkb.lang', 'en');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  // SECTION I anchors — eIDAS reference + UA Law reference + ceremony
  // params line (driven by useCeremonyPhase; falls back to recruiting).
  await expect(page.getByText(/SECTION I — LEGAL BASIS/i)).toBeVisible();
  // 910/2014 + 2155-VIII appear under the v3 panel — both in the body
  // text and in the documentFigure aria-label, so use first() to skirt
  // strict-mode multi-match.
  await expect(page.getByText(/910\/2014/).first()).toBeVisible();
  await expect(page.getByText(/2155-VIII/).first()).toBeVisible();
  await expect(page.getByTestId('home-document-v3-ceremony-params')).toBeVisible();

  // SECTION II anchors — the four bullet items.
  await expect(page.getByText(/SECTION II — WHAT YOU GET/i)).toBeVisible();
  await expect(page.getByText(/One nullifier per identity/i)).toBeVisible();
  await expect(
    page.getByText(/Rotate any wallet without revealing it was yours/i),
  ).toBeVisible();
});

test('landing — v3 CTAs route to /ua/registerV5 and /verify', async ({ page }) => {
  await page.goto('/');
  // "Begin filing" → /ua/registerV5
  const begin = page.getByTestId('home-document-v3-cta-begin');
  await expect(begin).toBeVisible();
  await expect(begin).toHaveAttribute('href', '/ua/registerV5');

  // "Verify a binding" → /verify
  const verify = page.getByRole('link', { name: /Verify a binding/i });
  await expect(verify).toBeVisible();
  await expect(verify).toHaveAttribute('href', '/verify');
});
