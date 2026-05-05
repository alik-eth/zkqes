import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 14'] });

test('landing layout works on iPhone 14', async ({ page }) => {
  await page.goto('/');
  // v3 default `/` renders <HomeDocument /> (Task #87, 2026-05-05).
  await expect(page.getByTestId('home-document-v3-shell')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
