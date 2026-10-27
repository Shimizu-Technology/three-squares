import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePOSCart, remainingPOSCapacity } from '../src/components/admin/posCart.ts';
const variant = (id = 1, overrides = {}) => ({ id, name: 'Lunch box', price_cents: 1200, price_formatted: '$12.00', sku: 'LUNCH', in_stock: true, stock_quantity: 0, inventory_pool_key: 'Product:10', available_quantity: 3, ...overrides });
const product = (variants = [variant()]) => ({ id: 10, name: 'Long lunch name with sauce kept separately', slug: 'lunch', product_type: 'local', image_url: null, variants });
const line = (v = variant(), quantity = 1) => ({ cartId: String(v.id), product: product([v]), variant: v, quantity });

test('destination reconciliation uses current price and preserves quantity/customer-independent row identity', () => {
  const old = line(variant(), 2);
  const fresh = variant(1, { price_cents: 1550, price_formatted: '$15.50' });
  const result = reconcilePOSCart([old], [product([fresh])]);
  assert.equal(result.items[0].cartId, old.cartId);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].variant.price_cents, 1550);
  assert.equal(old.variant.price_cents, 1200);
  assert.deepEqual(result.issues, []);
});
test('local 86, removed variant and sold-out snapshot retain rows with explicit recovery issues', () => {
  for (const products of [[], [product([])], [product([variant(1, { in_stock: false, available_quantity: 0 })])]]) {
    const old = line();
    const result = reconcilePOSCart([old], products);
    assert.equal(result.items[0], old);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0].message, /Remove it or choose another location/);
  }
});
test('multiple variants consume one product pool and a stock reduction requires decreasing quantity', () => {
  const first = variant(1), second = variant(2);
  const cart = [line(first, 2), line(second, 1)];
  assert.equal(remainingPOSCapacity(second, cart), 0);
  assert.deepEqual(reconcilePOSCart(cart, [product([first, second])]).issues, []);
  const lower = [variant(1, { available_quantity: 2 }), variant(2, { available_quantity: 2 })];
  assert.equal(reconcilePOSCart(cart, [product(lower)]).issues.length, 2);
  assert.deepEqual(reconcilePOSCart([line(first), line(second)], [product(lower)]).issues, []);
});
test('variant pools are independent and untracked inventory is unlimited', () => {
  const first = variant(1, { inventory_pool_key: 'ProductVariant:1', available_quantity: 2 });
  const second = variant(2, { inventory_pool_key: 'ProductVariant:2', available_quantity: 2 });
  assert.equal(remainingPOSCapacity(second, [line(first, 2)]), 2);
  assert.equal(remainingPOSCapacity(variant(3, { inventory_pool_key: null, available_quantity: null }), [line(first, 2)]), Infinity);
  assert.equal(remainingPOSCapacity(variant(3, { in_stock: false }), []), 0);
});
