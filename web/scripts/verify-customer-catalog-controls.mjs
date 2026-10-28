import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const base = process.env.CUSTOMER_BASE_URL ?? 'http://localhost:5691';
const api = process.env.CUSTOMER_API_URL ?? 'http://localhost:3601';
for (const url of [base, api]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Local demo only');
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? '../tmp/catalog-controls');
mkdirSync(output, { recursive: true });
const session = process.env.DEV_LIFECYCLE_SESSION, results = [];
if (session) execFileSync('dev-lifecycle', ['claim', '--session', session, 'process', String(process.pid), '--reason', 'Customer catalog read-only browser descendants']);
async function geometry(page) {
  // Vite injects the app stylesheet after DOM readiness on a cold navigation.
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--color-tsNavy').trim() === '#15263D');
  const data = await page.locator('.ui-button:visible').evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect();
    return { name: el.getAttribute('aria-label') || el.textContent.trim(), width: r.width, height: r.height };
  }));
  assert.ok(data.length > 0);
  for (const item of data) assert.ok(item.height >= 44 && item.width >= 44, JSON.stringify(item));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
  return data;
}
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      for (const [width, height] of [[768, 1024], [1024, 768], [1440, 900], [390, 844], ...(engine === 'webkit' ? [[375, 812]] : [])]) {
        if(process.env.CUSTOMER_QA_ENGINE && process.env.CUSTOMER_QA_ENGINE !== engine) continue;
        if(process.env.CUSTOMER_QA_WIDTH && Number(process.env.CUSTOMER_QA_WIDTH) !== width) continue;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const page = await context.newPage(), label = `${engine}-${width}`;
        const navigate = url => page.goto(url, {waitUntil:'domcontentloaded'});
        try {
          // This runner never writes: only local catalog reads are allowed.
          await context.route('**/*', route => {
            const request = route.request(), url = new URL(request.url());
            return url.pathname.startsWith('/api/') && (url.origin !== new URL(api).origin || request.method() !== 'GET') ? route.abort() : route.continue();
          });
          await navigate(`${base}/products`);
          await page.getByRole('button', { name: 'Three Squares Main', exact: true }).click();
          const search = page.locator('#menu-search');
          await search.fill('fictional-no-matching-dish');
          await expect(page.getByText('No products found', { exact: true })).toBeVisible();
          const remove = page.getByRole('button', { name: 'Remove search filter', exact: true });
          assert.equal((await remove.boundingBox()).height, 44);
          await remove.click(); await expect(search).toHaveValue('');
          await page.getByText(/^Filters and sort/).click();
          await page.getByLabel('Sort By', { exact: true }).selectOption('name_asc');
          await expect(page).toHaveURL(/sort=name_asc/);
          await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
          await expect(page.getByLabel('Sort By', { exact: true })).toHaveValue('');
          await expect(page.getByRole('status', { name: 'Loading menu', exact: true })).not.toBeVisible();
          const menu = await geometry(page);
          await page.screenshot({ path: path.join(output, `menu-controls-${label}.png`), fullPage: true });
          await navigate(`${base}/collections`);
          const collectionSearch = page.getByRole('textbox', { name: 'Search collections', exact: true });
          await collectionSearch.fill('fictional-no-collection'); await collectionSearch.press('Enter');
          await expect(page.getByText('No collections found for "fictional-no-collection"', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Clear', exact: true }).click(); await expect(collectionSearch).toHaveValue('');
          const collections = await geometry(page);
          const productResponse = await context.request.get(`${api}/api/v1/products/cheeseburger`);
          assert.equal(productResponse.status(), 200);
          const collectionSlug = (await productResponse.json()).collections[0].slug;
          let unavailable = true;
          const collectionRoute = `**/api/v1/collections/${collectionSlug}*`;
          const collectionResponse = await context.request.get(`${api}/api/v1/collections/${collectionSlug}`);
          assert.equal(collectionResponse.status(), 200);
          const collectionFixture = await collectionResponse.json();
          await page.route(collectionRoute, async route => {
            const data = structuredClone(collectionFixture);
            if(new URL(route.request().url()).searchParams.get('search')) data.products = [];
            data.collection.available = !unavailable;
            if (data.products.length) { data.meta.total = 36; data.meta.per_page = 12; }
            await route.fulfill({ status: 200, json: data });
          });
          await navigate(`${base}/collections/${collectionSlug}`);
          await expect(page.getByText('These specials are no longer available to order.', { exact: true })).toBeVisible();
          const browse = page.getByRole('link', { name: 'Browse available meals', exact: true });
          assert.equal(await browse.evaluate(el => !!el.closest('button')), false);
          await browse.click(); await expect(page).toHaveURL(/\/products$/);
          unavailable = false; await navigate(`${base}/collections/${collectionSlug}`);
          const next = page.getByRole('button', { name: 'Next', exact: true });
          await next.click(); await expect(page.getByText('Page 2 of 3', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Previous', exact: true }).click();
          const within = page.getByRole('textbox', { name: 'Search this menu', exact: true });
          await within.fill('fictional-no-dish'); await within.press('Enter');
          await expect(page.getByText('No products found in this collection.', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Clear Filters', exact: true }).first().click();
          await expect(within).toHaveValue(''); await geometry(page);
          await page.unroute(collectionRoute);
          // Browser-local option/gallery fixtures exercise controls absent from the food-only seed.
          let flexible = true;
          await page.route('**/api/v1/products/cheeseburger*', async route => {
            const response = await route.fetch(), product = await response.json(), original = product.variants[0];
            product.inventory_level = 'variant';
            product.description = '<p>Fictional option fixture.</p><img src="/images/Loco_Moco.JPG" alt="Size guide" />';
            product.images = [1, 2].map(id => ({ id, url: '/images/Loco_Moco.JPG', alt_text: `Fictional image ${id}`, position: id, primary: id === 1 }));
            product.variants = ['Red', 'Blue'].map((color, index) => ({ ...original, id: 900000 + index,
              display_name: `Fictional ${color}`, actually_available: true, stock_quantity: 3,
              options: flexible ? { color, size: 'Regular' } : {},
              pricing: { ...product.pricing, purchasable: true, unit_price_cents: 1295 + index * 100 } }));
            await route.fulfill({ response, json: product });
          });
          await navigate(`${base}/products/cheeseburger`);
          const blue = page.getByRole('button', { name: 'Blue', exact: true });
          await blue.click(); await expect(blue).toHaveAttribute('aria-pressed', 'true');
          assert.equal((await blue.boundingBox()).height, 44);
          const option = page.getByRole('button', { name: /Regular/ });
          assert.ok(await option.evaluate(el=>el.scrollHeight<=el.clientHeight), 'Option details fit the target');
          assert.equal((await option.boundingBox()).height, 52);
          await page.getByRole('button', { name: 'View image 2 of Cheeseburger', exact: true }).click();
          await expect(page.getByRole('button', { name: 'View image 2 of Cheeseburger', exact: true })).toHaveAttribute('aria-pressed', 'true');
          const guide = page.getByRole('button', { name: 'View Size Guide', exact: true });
          await guide.click(); await expect(page.getByRole('dialog', { name: 'Size Guide', exact: true })).toBeVisible();
          const close = page.getByRole('button', { name: 'Close size guide', exact: true });
          assert.equal((await close.boundingBox()).height, 44); await close.click(); await expect(guide).toBeFocused();
          await geometry(page); await page.screenshot({ path: path.join(output, `product-options-${label}.png`), fullPage: true });
          flexible = false; await page.reload({waitUntil:'domcontentloaded'});
          const legacy = page.getByRole('button', { name: /Fictional Blue/ });
          await legacy.click(); await expect(legacy).toHaveAttribute('aria-pressed', 'true');
          assert.equal((await legacy.boundingBox()).height, 52);
          await page.unroute('**/api/v1/products/cheeseburger*');
          for (const route of ['about', 'contact', 'returns', 'shipping', 'fictional-missing-page']) {
            await navigate(`${base}/${route}`); await geometry(page);
            await page.screenshot({ path: path.join(output, `${route}-${label}.png`), fullPage: true });
          }
          results.push({ engine, width, height, touch: true, menu, collections, status: 'passed' });
          writeFileSync(path.join(output, 'catalog-controls.json'), JSON.stringify(results, null, 2) + '\n');
          console.log(`${label}: menu search/remove/sort/reset, collection search/clear and help/navigation targets passed`);
        } catch (error) {
          console.error(error);
          await page.screenshot({ path: path.join(output, `catalog-failure-${label}.png`) }); throw error;
        } finally { await page.unrouteAll({behavior: 'wait'}); await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  if (session) execFileSync('dev-lifecycle', ['release', '--session', session, 'process', String(process.pid)]);
}
