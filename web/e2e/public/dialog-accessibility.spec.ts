import { test, expect } from '@playwright/test';

test('cart contains keyboard focus, makes the page inert and returns to its opener', async ({ page }) => {
  // Deterministic empty guest cart; this test does not mutate server data.
  await page.route('**/api/v1/cart', (route) => route.fulfill({ json: {
    id: 1, items: [], item_count: 0, subtotal_cents: 0,
  } }));
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Shopping cart with 0 items' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Shopping Cart' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close cart' })).toBeFocused();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
    expect(await dialog.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
  }
  // Programmatic focus must also be blocked, beyond a scripted Tab loop.
  await opener.evaluate((button) => button.focus());
  expect(await dialog.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close cart' }).click();
  await expect(opener).toBeFocused();
});
