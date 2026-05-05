import { test, expect } from '@playwright/test';

// Civic-terminal v3 locale parity smoke (Task #87, 2026-05-05). The
// default `/` renders <HomeDocument /> with the
// "OFFICE OF THE ZERO-KNOWLEDGE REGISTRAR" letterhead, localized to
// "БЮРО РЕЄСТРАТОРА З НУЛЬОВИМ РОЗГОЛОШЕННЯМ" in UK locale. Replaces
// the v2 "Verified Identity" / "Підтверджена особа" assertions.

test('UK locale renders Ukrainian copy', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('qkb.lang', 'uk');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  await expect(
    page.getByText(/БЮРО РЕЄСТРАТОРА З НУЛЬОВИМ РОЗГОЛОШЕННЯМ/),
  ).toBeVisible();
});

test('EN locale renders English copy', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('qkb.lang', 'en');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  await expect(
    page.getByText(/OFFICE OF THE ZERO-KNOWLEDGE REGISTRAR/i),
  ).toBeVisible();
});
