import { test, expect, type Page } from '@playwright/test';

const variant = { id: 98101, sku: 'SYNTHETIC-PORTION', variant_name: 'Large', display_name: 'Large',
  options: { Portion: 'Large' }, price_cents: 1200, stock_quantity: 50, low_stock_threshold: 5,
  available: true, actually_available: true, stock_status: 'in_stock' };
const product = { id: 98001, slug: 'synthetic-dialog-meal', name: 'Synthetic catalog meal',
  description: 'Detailed meal notes. '.repeat(80), base_price_cents: 1200, weight_oz: 8, product_type: 'local',
  published: true, featured: false, archived: false, inventory_level: 'variant', track_inventory: true,
  allow_pickup: true, allow_shipping: false, location_ids: [1], collection_ids: [], images: [], variants: [variant],
  collections: [], variant_count: 1, total_stock: 50, in_stock: true, actually_available: true };
const visibleButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
async function catalog(page: Page) {
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/admin/products**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/inventory_audits')) return route.fulfill({ json: { audits: [] } });
    if (path.endsWith('/variants')) return route.fulfill({ json: { success: true, data: [variant] } });
    if (path.endsWith('/images')) return route.fulfill({ json: { success: true, data: [] } });
    if (path.endsWith('/products')) return route.fulfill({ json: { success: true, data: [product] } });
    // A real async detail boundary must retain the actual pointer opener.
    await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill({ json: { success: true, data: product } });
  });
  await page.route('**/api/v1/admin/locations**', route => route.fulfill({ json: { data: [{ id: 1, name: 'Main', active: true }] } }));
  await page.route('**/api/v1/admin/collections**', route => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/v1/admin/variant_presets**', route => route.fulfill({ json: { success: true, data: { presets: [], grouped_by_type: {}, option_types: [] } } }));
}
for (const [width, height] of [[768, 1024], [1024, 768], [390, 844], [1440, 900]]) {
  test(`product details, history, archive and variant dialogs retain usable drafts at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await catalog(page);
    await page.goto('/admin/products');
    const view = visibleButton(page, 'View').first();
    await view.click();
    const details = page.getByRole('dialog', { name: product.name, exact: true });
    await expect(details).toBeVisible();
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(view).toBeFocused();
    await view.click(); await details.getByRole('button', { name: 'Edit Product', exact: true }).click();
    await expect(page.locator('#name')).toHaveValue(product.name);
    const historyButton = page.getByRole('button', { name: 'View Inventory History', exact: true });
    await historyButton.click();
    const history = page.getByRole('dialog', { name: 'Inventory History', exact: true });
    await expect(history.getByText('No inventory changes recorded yet.', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(historyButton).toBeFocused();
    const editVariant = page.locator('table').getByRole('button', { name: 'Edit', exact: true }).filter({ visible: true }).first();
    await editVariant.click();
    const editor = page.getByRole('dialog', { name: 'Edit Variant: Large', exact: true });
    await editor.getByLabel('Price ($)', { exact: true }).fill('13.50');
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/v1/admin/products/${product.id}/variants/${variant.id}`, async route => {
      await pending; await route.fulfill({ status: 500, json: { error: 'Synthetic variant failure' } });
    });
    await editor.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(editor).toBeVisible();
    release();
    await expect(editor.getByRole('alert')).toHaveText('Synthetic variant failure');
    await expect(editor.getByLabel('Price ($)', { exact: true })).toHaveValue('13.50');
    await page.keyboard.press('Escape'); await expect(editVariant).toBeFocused();
    const archiveButton = visibleButton(page, 'Archive');
    await archiveButton.click();
    const archive = page.getByRole('dialog', { name: 'Archive Product', exact: true });
    let finish!: () => void;
    const archivePending = new Promise<void>(resolve => { finish = resolve; });
    await page.route(`**/api/v1/admin/products/${product.id}`, async route => {
      if (route.request().method() !== 'DELETE') return route.fulfill({ json: { success: true, data: product } });
      await archivePending; await route.fulfill({ status: 500, json: { error: 'Synthetic archive failure' } });
    });
    await archive.getByRole('button', { name: 'Archive Product', exact: true }).click();
    await expect(archive.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(archive).toBeVisible();
    finish();
    await expect(archive.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await expect(page.locator('#name')).toHaveValue(product.name);
    await page.keyboard.press('Escape'); await expect(archiveButton).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test(`preset pending guards and import-detail polling survive native dismissal at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await catalog(page);
    await page.goto('/admin/settings/variant-presets');
    const newPreset = page.getByRole('button', { name: 'New Preset', exact: true });
    await newPreset.click();
    const preset = page.getByRole('dialog', { name: 'Create New Preset', exact: true });
    await preset.getByLabel('Preset Name', { exact: false }).fill('Synthetic portion choices');
    await preset.getByLabel('Option Type', { exact: false }).fill('Portion');
    await preset.getByLabel('New value name', { exact: true }).fill('Long portion name '.repeat(5));
    await preset.getByRole('button', { name: 'Add', exact: true }).click();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/admin/variant_presets', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { success: true, data: { presets: [], grouped_by_type: {}, option_types: [] } } });
      await pending; return route.fulfill({ status: 500, json: { error: 'Synthetic preset failure' } });
    });
    await preset.getByRole('button', { name: 'Create Preset', exact: true }).click();
    await expect(preset.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(preset).toBeVisible();
    release();
    await expect(preset.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await expect(preset.getByLabel('Preset Name', { exact: false })).toHaveValue('Synthetic portion choices');
    await page.keyboard.press('Escape'); await expect(newPreset).toBeFocused();
    let stored = false;
    let optionType = 'Portion';
    const savedPreset = () => ({ id: 98003, name: 'Synthetic first preset', option_type: optionType,
      description: '', values: [{ name: 'Large meal', price_adjustment_cents: 0 }], values_count: 1, value_names: ['Large meal'] });
    await page.route('**/api/v1/admin/variant_presets**', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { success: true, data: {
        presets: stored ? [savedPreset()] : [], grouped_by_type: stored ? { [optionType]: [savedPreset()] } : {}, option_types: stored ? [optionType] : [],
      } } });
      stored = true; optionType = route.request().postDataJSON().variant_preset.option_type;
      return route.fulfill({ json: { success: true, data: savedPreset() } });
    });
    await page.getByRole('button', { name: 'Create First Preset', exact: true }).click();
    await preset.getByLabel('Preset Name', { exact: false }).fill('Synthetic first preset');
    await preset.getByLabel('Option Type', { exact: false }).fill('Portion');
    await preset.getByLabel('New value name', { exact: true }).fill('Large meal');
    await preset.getByRole('button', { name: 'Add', exact: true }).click();
    await preset.getByRole('button', { name: 'Create Preset', exact: true }).click();
    await expect(preset).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Create First Preset', exact: true })).toHaveCount(0);
    await expect(newPreset).toBeFocused();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editPreset = page.getByRole('dialog', { name: 'Edit Preset', exact: true });
    await editPreset.getByLabel('Option Type', { exact: false }).fill('Meal size');
    await editPreset.getByRole('button', { name: 'Update Preset', exact: true }).click();
    await expect(editPreset).not.toBeVisible(); await expect(newPreset).toBeFocused();
    let reads = 0;
    const imported = () => ({ id: 98002, status: 'processing', filename: 'synthetic-import.csv', products_count: 0,
      skipped_count: 0, images_count: 0, created_at: new Date().toISOString(), warnings: [], errors: [],
      processed_products: reads, total_products: 100, progress_percent: reads, current_step: 'Synthetic progress', user: { id: 1, name: 'Synthetic operator', email: 'operator@example.test' } });
    await page.route('**/api/v1/admin/imports**', route => {
      if (new URL(route.request().url()).pathname.endsWith('/98002')) { reads += 1; return route.fulfill({ json: { success: true, data: imported() } }); }
      return route.fulfill({ json: { success: true, data: [imported()] } });
    });
    await page.goto('/admin/import?format=shopify');
    const importButton = page.getByRole('button', { name: 'View Details', exact: true });
    await importButton.click();
    const detail = page.getByRole('dialog', { name: 'Import Details', exact: true });
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape'); await expect(importButton).toBeFocused();
    const atClose = reads;
    await expect.poll(() => reads, { timeout: 7000 }).toBeGreaterThan(atClose);
    await importButton.click(); await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(importButton).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}
