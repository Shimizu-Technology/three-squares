import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Compile the real TSX with the existing compiler; no browser or app auth.
const source = new URL('../src/components/admin/orders/PickupPackingList.tsx', import.meta.url);
const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ["']react\/jsx-runtime["']/g, `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`)
  .replace(/from ["']\.\/orderUtils["']/g, `from ${JSON.stringify(new URL('../src/components/admin/orders/orderUtils.ts', import.meta.url).href)}`);
const { default: PackingList } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const note = 'Severe peanut allergy. Sauce separately. '.repeat(30);
const order = {
  id: 7, order_number: 'TSQ-TEST-7', customer_name: 'Alexandria'.repeat(30),
  location_name: 'Donki', created_at: new Date().toISOString(), status: 'pending', payment_status: 'paid',
  fulfillment_type: 'pickup', order_type: 'retail', next_status_options: ['confirmed', 'cancelled'],
  item_count: 5, line_count: 2, total_cents: 2500, notes: note,
  order_items: [
    { id: 1, quantity: 2, product_name: 'Grilled chicken', variant_name: 'Large meal', special_instructions: 'Sauce separately\nLabel for auntie.' },
    { id: 2, quantity: 3, product_name: 'Pancakes', variant_name: 'Short stack', special_instructions: 'No butter' },
  ],
};
const props = { orders: [order], saving: false, page: 1, totalPages: 3, onPageChange() {}, onQuickUpdateStatus() {}, onViewDetails() {} };
const render = (overrides = {}) => renderToStaticMarkup(createElement(PackingList, { ...props, ...overrides }));
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children];
  return [node, ...children.flatMap(elements)];
}

test('packing renders quantities, variants, full instructions and customer exceptions beside paid/action context', () => {
  const html = render();
  for (const text of [order.customer_name, note, '2×', '3×', '5 to pack · 2 lines', 'Grilled chicken', 'Large meal', 'Short stack', 'Sauce separately\nLabel for auntie.', 'No butter', 'Donki', 'Paid', 'Acknowledge']) assert.ok(html.includes(text), text);
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.ok(html.includes('aria-label="Packing items"'));
});

test('unpaid and terminal pickups have no fulfillment action; authorized next stages remain authoritative', () => {
  const unpaid = render({ orders: [{ ...order, payment_status: 'pending', next_status_options: ['cancelled'] }] });
  assert.ok(unpaid.includes('Waiting for payment'));
  assert.ok(!unpaid.includes('Acknowledge'));
  assert.ok(!render({ orders: [{ ...order, status: 'picked_up', next_status_options: [] }] }).includes('>Ready<'));
  assert.ok(render({ orders: [{ ...order, status: 'confirmed', next_status_options: ['ready', 'cancelled'] }] }).includes('>Ready<'));
});

test('pagination respects boundaries and forwards actions and the actual Details trigger', () => {
  const calls = [];
  const buttons = elements(PackingList({ ...props, onPageChange: page => calls.push(page), onViewDetails: (...args) => calls.push(args), onQuickUpdateStatus: (...args) => calls.push(args) })).filter(el => el.type === 'button');
  const byName = name => buttons.find(button => button.props.children === name);
  assert.equal(byName('Previous').props.disabled, true);
  assert.equal(byName('Next').props.disabled, false);
  byName('Next').props.onClick();
  const trigger = { tagName: 'BUTTON' };
  byName('Details').props.onClick({ currentTarget: trigger });
  byName('Acknowledge').props.onClick();
  assert.deepEqual(calls, [2, [7, trigger], [7, 'confirmed']]);
  const last = elements(PackingList({ ...props, page: 3 })).find(el => el.type === 'button' && el.props.children === 'Next');
  assert.equal(last.props.disabled, true);
  const busy = elements(PackingList({ ...props, saving: true })).filter(el => el.type === 'button');
  assert.ok(busy.every(button => button.props.disabled));
});
