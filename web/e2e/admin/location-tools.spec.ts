import { test, expect } from '@playwright/test';

for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`saved location tools recover QR printing and copy the configured URL at ${width}x${height}`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const location = { id: 1, name: 'Main counter — long saved location name', slug: 'qa-main', active: true, hours_json: { Monday: '09:00 - 17:00' }, address: 'Guam', phone: '', admin_sms_phones: [] };
    const menuUrl = `${baseURL}/menu/qa-main`;
    let fail = true;
    await page.route('**/api/v1/admin/locations**', route => {
      if (new URL(route.request().url()).pathname.endsWith('/generate_qr')) {
        return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: 'QA unavailable' } : { data: { menu_url: menuUrl, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>' } } });
      }
      return route.fulfill({ json: { data: [location] } });
    });
    await page.goto('/admin/locations');
    const card = page.getByRole('region', { name: `${location.name} location`, exact: true });
    await expect(card.getByText('Saved: Active', { exact: true })).toBeVisible();
    await expect(card.getByLabel('Location name', { exact: true })).not.toBeVisible();
    const print = card.getByRole('button', { name: `Print QR for ${location.name}`, exact: true });
    const failedPopup = page.waitForEvent('popup');
    await print.click();
    const empty = await failedPopup;
    await expect(card.getByRole('alert')).toContainText('Could not print qr');
    await expect.poll(() => empty.isClosed()).toBe(true);
    fail = false;
    const sheetPromise = page.waitForEvent('popup');
    await print.click();
    const sheet = await sheetPromise;
    await expect(sheet.getByRole('heading', { name: location.name, exact: true })).toBeVisible();
    await expect(sheet.getByText(menuUrl, { exact: true })).toBeVisible();
    await expect(sheet.getByRole('img', { name: `${location.name} menu QR code`, exact: true })).toBeVisible();
    await sheet.close();
    await card.getByRole('button', { name: `Copy URL for ${location.name}`, exact: true }).click();
    await expect(card.getByRole('status')).toHaveText(`Menu URL copied for ${location.name}.`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(menuUrl);
    await context.route(menuUrl, route => route.fulfill({ body: '<h1>Locally intercepted menu navigation</h1>', contentType: 'text/html' }));
    const viewPromise = page.waitForEvent('popup');
    await card.getByRole('button', { name: `View menu for ${location.name}`, exact: true }).click();
    const view = await viewPromise;
    await expect(view).toHaveURL(menuUrl);
    await view.close();
    await card.locator('summary', { hasText: 'Edit location settings' }).click();
    await expect(card.getByLabel('Location name', { exact: true })).toHaveValue(location.name);
    await card.getByLabel('Location name', { exact: true }).fill('Unsaved new name');
    await expect(card.getByRole('heading', { name: location.name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
