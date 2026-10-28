import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.CUSTOMER_BASE_URL ?? 'http://localhost:5691';
const api = process.env.CUSTOMER_API_URL ?? 'http://localhost:3601';
const db = process.env.CUSTOMER_DEMO_DB;
if (!db || !/^tsq_uniform_c_.*demo$/.test(db)) throw new Error('Explicit owned Track C demo DB required');
for (const url of [base, api]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local demo only');
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? '../tmp/customer-quantity');
mkdirSync(output, { recursive: true });
const sql = query => execFileSync('psql', ['-X', '-A', '-t', '-d', db, '-c', query], { encoding: 'utf8' }).trim();
const original = JSON.parse(sql("SELECT row_to_json(s) FROM (SELECT name,inventory_level,product_stock_quantity FROM products WHERE slug='cheeseburger') s"));
const itemLabel = 'Fictional grilled salmon with garlic lemon butter, steamed rice and seasonal vegetables';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
assert.ok(original && ['none', 'product', 'variant'].includes(original.inventory_level));
const originalVariants = JSON.parse(sql("SELECT json_agg(row_to_json(v)) FROM (SELECT id,stock_quantity FROM product_variants WHERE product_id=(SELECT id FROM products WHERE slug='cheeseburger')) v"));
const restore = () => {
  sql(`UPDATE products SET name=${quote(original.name)},inventory_level='${original.inventory_level}',product_stock_quantity=${original.product_stock_quantity ?? 'NULL'} WHERE slug='cheeseburger'`);
  for (const variant of originalVariants) sql(`UPDATE product_variants SET stock_quantity=${variant.stock_quantity} WHERE id=${variant.id}`);
};
const session = process.env.DEV_LIFECYCLE_SESSION;
if (session) execFileSync('dev-lifecycle', ['claim', '--session', session, 'process', String(process.pid), '--reason', 'Customer quantity stock-limit browser descendants']);
const results = [];
try {
  // Change only this isolated fixture, after the ordinary checkout journeys.
  for (const [inventory, stock] of [['product',2],['variant',3]]) {
  sql(`UPDATE products SET name=${quote(itemLabel)},inventory_level='${inventory}',product_stock_quantity=2 WHERE slug='cheeseburger'`);
  if (inventory === 'variant') for (const variant of originalVariants) sql(`UPDATE product_variants SET stock_quantity=${stock} WHERE id=${variant.id}`);
  const subtotal = 1295 * stock, amount = '$' + (subtotal/100).toFixed(2);
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      for (const [width, height] of [[768, 1024], [1024, 768], [1440, 900], [390, 844], ...(engine === 'webkit' ? [[375, 812]] : [])]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
        try {
          const page = await context.newPage();
          await page.goto(`${base}/products`);
          await page.getByRole('button', { name: /Three Squares Main/ }).tap();
          await page.locator('#menu-search').fill('Fictional grilled salmon');
          await page.locator('[data-customer-card="product"]').filter({ hasText: itemLabel }).tap();
          const quantity = page.getByRole('group', { name: `Quantity of ${itemLabel}`, exact: true });
          const increase = quantity.getByRole('button', { name: `Increase quantity of ${itemLabel}`, exact: true });
          const decrease = quantity.getByRole('button', { name: `Decrease quantity of ${itemLabel}`, exact: true });
          await expect(decrease).toBeDisabled();
          await page.getByRole('button', {name:'Enter quantity',exact:true}).click();
          const entry = page.getByRole('spinbutton', {name:'Enter quantity',exact:true});
          await entry.fill('100'); await expect(entry).toHaveValue(String(stock));
          await entry.fill('0'); await expect(entry).toHaveValue('1');
          await page.getByRole('button', {name:'Done',exact:true}).click();
          for (let value=1;value<stock;value++) await increase.tap();
          await expect(quantity.getByLabel(`Current quantity of ${itemLabel}`, { exact: true })).toHaveText(String(stock));
          await expect(increase).toBeDisabled();
          await page.getByRole('button', { name: 'Add to Cart', exact: true }).tap();
          const drawer = page.getByRole('dialog', { name: 'Shopping Cart' });
          const cartQuantity = drawer.getByRole('group', { name: `Quantity of ${itemLabel}`, exact: true });
          const cartIncrease = cartQuantity.getByRole('button', { name: `Increase quantity of ${itemLabel}`, exact: true });
          const cartDecrease = cartQuantity.getByRole('button', { name: `Decrease quantity of ${itemLabel}`, exact: true });
          await expect(cartIncrease).toBeDisabled();
          await expect(cartDecrease).toBeEnabled();
          await expect(cartQuantity.getByLabel(`Current quantity of ${itemLabel}`, { exact: true })).toHaveText(String(stock));
          await cartDecrease.tap();
          await expect(cartIncrease).toBeEnabled();
          await cartIncrease.tap();
          await expect(cartIncrease).toBeDisabled();
          await expect(cartQuantity.getByLabel(`Current quantity of ${itemLabel}`, { exact: true })).toHaveText(String(stock));
          const sessionId = await page.evaluate(() => localStorage.getItem('cart_session_id'));
          const location = await page.evaluate(() => JSON.parse(localStorage.getItem('tsq-location')).state.selectedLocation);
          const response = await context.request.get(`${api}/api/v1/cart`, { headers: { 'X-Session-ID': sessionId, 'X-Location-ID': String(location.id) } });
          assert.equal(response.status(), 200);
          const cart = await response.json();
          assert.equal(cart.items[0].quantity, stock);
          assert.equal(cart.items[0].availability.available_quantity, stock);
          assert.equal(cart.subtotal_cents, subtotal);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          const titleBox = await drawer.getByRole('link', { name: itemLabel, exact: true }).boundingBox();
          const amountBox = await drawer.getByText(amount, { exact: true }).first().boundingBox();
          assert.ok(titleBox.x + titleBox.width <= amountBox.x + 1, 'long title keeps its own slot beside amount');
          const close = drawer.getByRole('button', { name: 'Close cart', exact: true });
          await close.focus();
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await expect(close).toBeFocused();
          const focus = await close.evaluate(element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return { color: style.outlineColor, width: style.outlineWidth, offset: style.outlineOffset, targetWidth: rect.width, targetHeight: rect.height };
          });
          assert.equal(focus.color, 'rgb(255, 255, 255)');
          assert.equal(focus.width, '2px');
          assert.equal(focus.offset, '2px');
          assert.ok(Math.abs(focus.targetWidth - 44) <= 1 && Math.abs(focus.targetHeight - 44) <= 1);
          await drawer.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
          await page.screenshot({ path: path.join(output, `stock-limit-${inventory}-${engine}-${width}.png`) });
          await drawer.getByRole('button', { name: `Remove ${itemLabel} from cart`, exact: true }).tap();
          await expect(drawer.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
          results.push({ engine, width, height, touch: true, inventory, stock, savedQuantity: stock, savedSubtotalCents: subtotal, longTitle: itemLabel, titleBox, amountBox, focus, status: 'passed' });
          writeFileSync(path.join(output, 'quantity-stock.json'), JSON.stringify(results, null, 2) + '\n');
          console.log(`${inventory}-${engine}-${width}: product/cart stock caps and absolute saves passed`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  }
} finally {
  restore();
  if (session) execFileSync('dev-lifecycle', ['release', '--session', session, 'process', String(process.pid)]);
}
