import { test, expect } from '@playwright/test';

// Fault only the named read. Recovery uses the real local/test API and keeps
// authentication, page rendering and existing data behavior intact.
for (const resource of [
  { name: 'Dashboard', route: '/admin', endpoint: '/admin/dashboard/stats', refresh: 'Refresh dashboard' },
  { name: 'Analytics for the last 14 days', route: '/admin/analytics', endpoint: '/admin/dashboard/chart_data', refresh: 'Refresh analytics' },
  { name: 'Products', route: '/admin/products', endpoint: '/admin/products', refresh: 'Refresh products' },
  { name: 'Menus', route: '/admin/collections', endpoint: '/admin/collections', refresh: 'Refresh menus' },
  { name: 'Locations', route: '/admin/locations', endpoint: '/admin/locations', refresh: 'Refresh locations' },
  { name: 'Users', route: '/admin/users', endpoint: '/admin/users', refresh: 'Refresh users' },
  { name: 'Catering inquiries and stats', route: '/admin/catering', endpoint: '/admin/catering', refresh: 'Refresh inquiries' },
  { name: 'POS menu and locations', route: '/admin/pos', endpoint: '/admin/pos/menu', refresh: 'Refresh menu' },
]) {
  test(`${resource.name}: failure is recoverable and retained data is marked stale`, async ({ page }) => {
    let fail = true;
    await page.route('**/api/v1/admin/**', async route => {
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === `/api/v1${resource.endpoint}` && fail) {
        await route.fulfill({ status: 500, json: { error: 'Test-only unavailable response' } });
      } else await route.continue();
    });
    await page.goto(resource.route);
    const alert = page.getByRole('alert').filter({ hasText: `${resource.name} unavailable` });
    await expect(alert).toBeVisible();
    await expect(page.getByText('No orders yet', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No products found', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No collections found', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No locations found.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No users found', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No catering inquiries found', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No items found', { exact: true })).toHaveCount(0);
    await expect(alert).not.toContainText('Showing last loaded data');
    fail = false;
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByRole('button', { name: resource.refresh, exact: true })).toBeEnabled();
    if (resource.name === 'Products') await page.getByPlaceholder('Search products...').fill('recovery-filter');
    fail = true;
    await page.getByRole('button', { name: resource.refresh, exact: true }).click();
    await expect(alert).toContainText('Showing last loaded data. It may be out of date.');
    fail = false;
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(alert).toHaveCount(0);
    if (resource.name === 'Products') await expect(page.getByPlaceholder('Search products...')).toHaveValue('recovery-filter');
  });
}
