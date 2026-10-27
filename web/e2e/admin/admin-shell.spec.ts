import { test, expect } from '@playwright/test';

test('closed phone navigation is unreachable; open navigation contains focus and returns it on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/orders/pickup-queue');
  const menu = page.getByRole('button', { name: 'Open admin navigation', exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('button[aria-controls="admin-sidebar"]')).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin navigation', exact: true })).toHaveCount(0);
  await menu.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('aside, dialog'))).toBe(false);
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await expect(skip).toBeFocused();
  const skipBox = (await skip.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(skipBox.y).toBeGreaterThanOrEqual(menuBox.y + menuBox.height);
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Three Squares Admin', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close admin navigation', exact: true })).toBeFocused();
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole('link', { name: 'Shipping Queue', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/shipping-queue$/);
  await expect(dialog).not.toBeVisible();
});

test('collapse persists across tablet and desktop with one current destination and focused rail labels', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/admin/orders/pickup-queue');
  // Remove only this app's navigation preferences for a deterministic default.
  await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('ts-admin-sidebar-collapsed:')).forEach(key => localStorage.removeItem(key)));
  await page.reload();
  const sidebar = page.getByRole('complementary', { name: 'Admin sidebar', exact: true });
  await expect(sidebar).toHaveCSS('width', '80px');
  await expect(page.getByRole('button', { name: 'Open admin navigation', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(sidebar).toHaveCSS('width', '256px');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.reload();
  await expect(sidebar).toHaveCSS('width', '80px');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(sidebar).toHaveCSS('width', '80px');
  const nav = page.getByRole('navigation', { name: 'Admin navigation', exact: true });
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.getByRole('link', { name: 'Pickup Queue', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Variant Presets', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toHaveText('Variant Presets');
  await expect(nav.getByRole('link', { name: 'Variant Presets', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(sidebar).toHaveCSS('width', '256px');
});

test('an unavailable access check keeps the intended route and offers recovery', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/me', route => unavailable
    ? route.fulfill({ status: 500, json: { error: 'Test-only unavailable access read' } })
    : route.continue());
  await page.goto('/admin/orders/pickup-queue');
  await expect(page.getByRole('heading', { name: 'Admin access unavailable', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/orders\/pickup-queue$/);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry access check', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pickup Queue', exact: true })).toBeVisible();
});
