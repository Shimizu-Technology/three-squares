import { test, expect } from '@playwright/test';

test('catering refreshes untouched notes while retaining an edited draft', async ({ page }) => {
  let notes = 'Original server notes';
  const inquiry = { id: 91001, contact_name: 'QA catering guest', contact_email: 'fixture@example.test', event_type: 'party', event_date: '2026-12-01', guest_count: 25, status: 'pending', days_until_event: 10, urgent: false, created_at: '2026-10-27T00:00:00Z' };
  await page.route('**/api/v1/admin/catering**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/stats')) await route.fulfill({ json: { total: 1, pending: 1, quoted: 0, active: 1, total_quoted_value: 0 } });
    else if (path.endsWith('/91001')) await route.fulfill({ json: { inquiry: { ...inquiry, admin_notes: notes } } });
    else await route.fulfill({ json: { inquiries: [inquiry] } });
  });
  await page.goto('/admin/catering');
  const open = () => page.getByRole('button', { name: 'View', exact: true }).click();
  await open();
  await expect(page.locator('textarea')).toHaveValue(notes);
  await page.getByRole('button', { name: 'Close modal', exact: true }).click();
  notes = 'Changed by another operator';
  await open();
  await expect(page.locator('textarea')).toHaveValue(notes);
  await page.locator('textarea').fill('My unsaved edit');
  await page.getByRole('button', { name: 'Close modal', exact: true }).click();
  notes = 'Another server update';
  await open();
  await expect(page.locator('textarea')).toHaveValue('My unsaved edit');
});

test('successful role update reconciles the active search after a filter read overtakes it', async ({ page }) => {
  let isAdmin = false;
  let patchStarted = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const user = { id: 91002, email: 'role-fixture@example.test', name: 'Role fixture', phone: null, clerk_id: 'fixture', created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
  await page.route('**/api/v1/admin/users**', async route => {
    if (route.request().method() === 'PATCH') {
      patchStarted = true;
      await gate;
      isAdmin = true;
      await route.fulfill({ json: { user: { ...user, role: 'manager', assigned_location_id: null }, message: 'Updated test fixture' } });
    } else await route.fulfill({ json: { users: [{ ...user, role: isAdmin ? 'manager' : 'customer', assigned_location_id: null }], stats: { total: 1, owners: 0, managers: isAdmin ? 1 : 0, staff: 0, customers: isAdmin ? 0 : 1 } } });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/admin/users');
  await page.getByLabel('Role for '+user.email, { exact: true }).filter({ visible: true }).selectOption('manager');
  await page.getByRole('button', { name: 'Save access', exact: true }).filter({ visible: true }).click();
  await expect.poll(() => patchStarted).toBe(true);
  await page.getByPlaceholder('Search by email or name...').fill(user.email);
  const read = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/admin/users?search='));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await read;
  release();
  await expect(page.getByLabel('Role for '+user.email, { exact: true }).filter({ visible: true })).toHaveValue('manager');
  await expect(page.getByPlaceholder('Search by email or name...')).toHaveValue(user.email);
});

test('location Active is locked until its post-save refresh finishes', async ({ page }) => {
  let saving = false;
  let followup = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/admin/locations**', async route => {
    if (route.request().method() === 'PUT') {
      saving = true;
      await route.fulfill({ json: { success: true } });
    } else if (route.request().method() === 'GET' && saving) {
      const response = await route.fetch();
      followup = true;
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.goto('/admin/locations');
  const region = page.getByRole('region').first();
  await expect(region).toBeVisible();
  await region.locator('summary', { hasText: 'Edit location settings' }).click();
  await region.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => followup).toBe(true);
  await expect(region.getByRole('checkbox', { name: 'Active', exact: true })).toBeDisabled();
  release();
  await expect(region.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(region.getByRole('checkbox', { name: 'Active', exact: true })).toBeEnabled();
});

test('POS cart controls remain reachable after an item reveals Quick Qty', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const product = { id: 91003, name: 'Phone packing meal', variants: [{ id: 91004, name: 'Default', price_cents: 1000, price_formatted: '$10.00', in_stock: true }] };
  await page.route('**/api/v1/admin/pos/menu**', route => route.fulfill({ json: { locations: [{ id: 1, name: 'Main' }], categories: [{ name: 'Lunch', items: [product] }], total_products: 1 } }));
  await page.goto('/admin/pos');
  await page.getByRole('button').filter({ hasText: product.name }).first().click();
  await expect(page.getByText('Quick Qty Mode', { exact: true })).toBeVisible();
  const cash = page.getByRole('button', { name: 'Cash', exact: true });
  await cash.scrollIntoViewIfNeeded();
  const box = (await cash.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('heading', { name: 'Cash Payment', exact: true })).toBeVisible();
  // Opening the cash form creates no order and performs no payment.
});
