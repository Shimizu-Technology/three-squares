import { test, expect } from '@playwright/test';

const settingsFixture = () => ({
  store_name: 'Synthetic counter', store_email: 'counter@example.test', store_phone: '5550100',
  announcement_enabled: false, announcement_text: 'Saved banner', announcement_style: 'gold',
  send_retail_emails: false, send_wholesale_emails: false,
  enable_storefront_three_squares: true, enable_storefront_latte_stone: false,
  enable_storefront_catering: false, enable_catering_online_ordering: false,
  shipping_origin_address: { company: 'Synthetic counter', street1: '1 Example Street', city: 'Example', state: 'GU', zip: '96900', country: 'US', phone: '5550100' },
});
for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`analytics explains weekly and daily periods with recoverable ranges at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let fail = false;
    await page.route('**/api/v1/admin/dashboard/chart_data**', route => route.fulfill(fail
      ? { status: 500, json: { error: 'Synthetic outage' } }
      : { json: { series: [{ date: '2026-10-28', label: 'Oct 28', orders: 3, revenue_cents: 600 }],
        comparison: { this_week: { orders: 3, revenue_cents: 600 }, last_week: { orders: 0, revenue_cents: 0 } } } }));
    await page.goto('/admin/analytics');
    const weekly = page.getByRole('region', { name: 'This week so far vs last week' });
    await expect(weekly).toContainText('New activity this week · None last week');
    await page.getByRole('button', { name: 'Last 7 days', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Daily chart · Last 7 days', exact: true })).toBeVisible();
    await expect(weekly).toContainText('$6.00');
    await expect(page.getByRole('button', { name: 'Last 7 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Orders', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Orders', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Orders per day', exact: true })).toBeVisible();
    fail = true;
    await page.getByRole('button', { name: 'Refresh analytics', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Showing last loaded data');
    fail = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });

  test(`settings distinguish drafts, saved values and uncertain responses at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let saved = settingsFixture();
    let writes = 0;
    let loseResponse = false;
    let failRead = false;
    await page.route(/\/api\/v1\/admin\/(site_settings|settings)(\?.*)?$/, async route => {
      const email = new URL(route.request().url()).pathname.endsWith('/settings');
      if (route.request().method() === 'PUT') {
        writes++;
        const body = route.request().postDataJSON();
        saved = { ...saved, ...(email ? body.settings : body.site_setting) };
        if (loseResponse) return route.abort('failed');
      } else if (failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic read outage' } });
      return route.fulfill({ json: email ? { settings: saved } : saved });
    });
    await page.goto('/admin/settings');
    const banner = page.getByRole('switch', { name: 'Enable Banner', exact: true });
    await banner.click();
    await expect(banner).toBeChecked();
    await page.getByLabel('Banner Message', { exact: true }).fill('Unsaved lunch banner');
    expect(writes).toBe(0);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
    expect(saved.announcement_text).toBe('Unsaved lunch banner');
    await page.getByLabel('Banner Message', { exact: true }).fill('Keep this newer draft');
    loseResponse = true; failRead = true;
    const catering = page.getByRole('switch', { name: 'Allow catering online orders', exact: true });
    await catering.click();
    await expect(page.getByText('Catering online ordering: Save outcome unknown. Check the saved value before changing it again.', { exact: true })).toBeVisible();
    await expect(catering).toBeDisabled();
    expect(saved.enable_catering_online_ordering).toBe(true);
    await expect(page.getByText('Inquiry only. Saves immediately.', { exact: true })).toHaveCount(0);
    const beforeCheck = writes;
    failRead = false;
    await page.getByRole('button', { name: 'Check saved Catering online ordering', exact: true }).click();
    await expect(catering).toBeChecked(); await expect(catering).toBeEnabled();
    expect(writes).toBe(beforeCheck);
    await expect(page.getByLabel('Banner Message', { exact: true })).toHaveValue('Keep this newer draft');
    await expect(page.getByText('Catering online ordering: Save was not confirmed. Current saved value loaded; review before changing it again.', { exact: true })).toBeVisible();
    loseResponse = false;
    await page.getByRole('switch', { name: 'Retail order emails', exact: true }).click();
    await expect(page.getByText('Retail order emails: Saved', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Banner Message', { exact: true })).toHaveValue('Keep this newer draft');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
