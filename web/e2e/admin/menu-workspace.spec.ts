import { test, expect } from '@playwright/test';

for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`menu items and Guam schedule save together with recoverable preview at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const first = { id: 101, name: 'Chicken lunch — sauces separate for Christopher Alexander Montgomery III', published: true, archived: false, base_price_cents: 1234 };
    const second = { id: 102, name: 'Coconut box 🥥 draft', published: false, archived: false, base_price_cents: 2400 };
    const archived = { id: 103, name: 'Archived lunch', published: false, archived: true, base_price_cents: 900 };
    let menu = { id: 301, name: 'Thanksgiving lunch menu', slug: 'qa-thanksgiving', description: 'Family boxes and lunch meals', published: true, featured: false, sort_order: 1, collection_type: 'seasonal', starts_at: '2027-11-01T08:00:32+10:00', ends_at: '2027-11-27T17:00:45+10:00', auto_hide: true, banner_text: 'Preorders for office groups', availability_status: 'upcoming', available: false, product_count: 2, products: [first, archived] };
    let failSave = true; const payloads: { product_ids: number[]; starts_at: string; ends_at: string }[] = []; const publicRequests: string[] = [];
    page.on('request', request => { if (/\/api\/v1\/collections/.test(request.url())) publicRequests.push(request.url()); });
    await page.route('**/api/v1/admin/products**', route => route.fulfill({ json: { data: [first, second, archived] } }));
    await page.route('**/api/v1/admin/collections**', route => {
      if (route.request().method() === 'PATCH') {
        const attrs = route.request().postDataJSON().collection; payloads.push(attrs);
        if (failSave) return route.fulfill({ status: 422, json: { errors: ['QA menu validation failed'] } });
        menu = { ...menu, ...attrs, products: attrs.product_ids.map((id: number) => [first, second, archived].find(product => product.id === id)), product_count: attrs.product_ids.length };
        return route.fulfill({ json: { data: menu } });
      }
      return route.fulfill({ json: { data: /\/301$/.test(new URL(route.request().url()).pathname) ? menu : [menu] } });
    });
    await page.goto('/admin/collections');
    const card = page.getByRole('article', { name: menu.name, exact: true });
    await expect(card.getByText('Scheduled', { exact: true })).toBeVisible();
    const opener = card.getByRole('button', { name: 'Manage items (2)', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: `Edit ${menu.name}`, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Menu & schedule', exact: true }).click();
    await expect(dialog.getByLabel('Menu type', { exact: true })).toHaveValue('seasonal');
    await expect(dialog.getByLabel('Starts at (Guam)', { exact: true })).toHaveValue('2027-11-01T08:00');
    await dialog.getByRole('button', { name: 'Menu items', exact: true }).click();
    await expect(dialog.getByText('Archived item — unavailable to customers. Remove it or restore it in Products.', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove Archived lunch from menu', exact: true }).click();
    await dialog.getByRole('searchbox', { name: 'Find menu items', exact: true }).fill('coconut');
    await dialog.getByRole('checkbox', { name: `Include ${second.name}`, exact: true }).check();
    await dialog.getByRole('button', { name: `Move ${second.name} up`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Staff preview', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Staff preview — unsaved editor content', exact: true })).toBeVisible();
    await expect(dialog.getByText('This preview does not open ordering or publish the menu.', { exact: false })).toBeVisible();
    await expect(dialog.getByText(/Unpublished — unavailable/)).toBeVisible();
    expect(publicRequests).toEqual([]);
    await dialog.getByRole('button', { name: 'Save menu & items', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('QA menu validation failed');
    await expect(dialog).toBeVisible();
    expect(payloads[0].product_ids).toEqual([102, 101]);
    expect(payloads[0].starts_at).toBe('2027-11-01T08:00:32+10:00');
    expect(payloads[0].ends_at).toBe('2027-11-27T17:00:45+10:00');
    failSave = false;
    await dialog.getByRole('button', { name: 'Save menu & items', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(payloads[1].product_ids).toEqual([102, 101]);
    await expect(opener).toBeFocused();
    await card.getByRole('button', { name: 'Staff preview', exact: true }).click();
    await expect(dialog.getByRole('listitem').first()).toContainText(second.name);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(card.getByRole('button', { name: 'Staff preview', exact: true })).toBeFocused();
    expect(publicRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
