import { test, expect } from '@playwright/test';

test('boots and renders title', async ({ page }) => {
  await page.goto('/');
  // Post-rename the document title is "zkqes — zk-QES" (was "QKB — …"
  // pre-2026-05-03 rename to single-noun zkqes brand). Case-insensitive
  // matching for safety against future minor wording tweaks.
  await expect(page).toHaveTitle(/zkqes/i);
  // Civic-terminal v3 (Task #87, 2026-05-05): default `/` renders
  // <HomeDocument /> with the "OFFICE OF THE ZERO-KNOWLEDGE REGISTRAR"
  // letterhead, replacing the v2 "Verified Identity" hero heading.
  await expect(page.getByTestId('home-document-v3-shell')).toBeVisible();
});
