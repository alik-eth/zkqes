import { test, expect } from '@playwright/test';

test('boots and renders title', async ({ page }) => {
  await page.goto('/');
  // Post-rename the document title is "zkqes — zk-QES" (was "QKB — …"
  // pre-2026-05-03 rename to single-noun zkqes brand). Case-insensitive
  // matching for safety against future minor wording tweaks.
  await expect(page).toHaveTitle(/zkqes/i);
  await expect(page.getByRole('heading', { name: /Verified Identity/i })).toBeVisible();
});
