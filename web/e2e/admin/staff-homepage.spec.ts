import { test, expect } from '@playwright/test';

test('all-location manager opens homepage without requesting owner settings', async ({ page }) => {
  const ownerOnlyReads: string[] = [];
  await page.route('**/api/v1/me', async route => {
    const response = await route.fetch();
    const identity = await response.json();
    await route.fulfill({ json: { ...identity, role: 'manager', admin: false,
      assigned_location_id: null, operational_scope: 'all',
      capabilities: ['account.self', 'homepage.manage', 'catalog.manage', 'analytics.read'] } });
  });
  await page.route('**/api/v1/admin/homepage_sections', route => route.fulfill({ json: { sections: [] } }));
  page.on('request', request => {
    if (/\/api\/v1\/admin\/(site_settings|settings)(\?|$)/.test(request.url())) ownerOnlyReads.push(request.url());
  });
  await page.goto('/admin/settings?tab=homepage');
  await expect(page).toHaveURL(/\/admin\/homepage$/);
  await expect(page.getByRole('heading', { name: 'Homepage', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'General', exact: true })).toHaveCount(0);
  await expect(page.getByText('No homepage sections configured yet.', { exact: false })).toBeVisible();
  expect(ownerOnlyReads).toEqual([]);
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: 'This page isn’t available for your access' })).toBeVisible();
});
