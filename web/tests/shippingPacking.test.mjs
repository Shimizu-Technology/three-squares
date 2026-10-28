import { uiModules, expandUi, uiText } from './helpers/uiModules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the real component and shared action contract without app auth or a browser.
const source = new URL('../src/components/admin/orders/ShippingPackingList.tsx', import.meta.url);
const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ["']react\/jsx-runtime["']/g, `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`)
  .replace(/from ["']\.\/orderUtils["']/g, `from ${JSON.stringify(new URL('../src/components/admin/orders/orderUtils.ts', import.meta.url).href)}`);
const resolved = compiled.replace(/from ["']([^"']+)["']/g, (_,name)=>`from ${JSON.stringify(uiModules[name] || name)}`);
const { default: PackingList } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);

const itemNote = 'Pack each box separately. Keep fragile cookies on top.\n'.repeat(25);
const customerNote = 'Label for the family celebration.\n'.repeat(40);
const staffNote = 'Check the sealed boxes before dispatch.\n'.repeat(30);
const order = {
  id: 9, order_number: 'TSQ-SHIPPING-9', customer_name: 'Alexandria'.repeat(30),
  customer_email: `${'longemail'.repeat(30)}@example.test`, location_name: 'Main shipping kitchen',
  created_at: new Date(Date.now() - 125 * 60_000).toISOString(),
  status: 'processing', payment_status: 'paid', fulfillment_type: 'shipping', order_type: 'retail',
  next_status_options: ['shipped', 'cancelled'], item_count: 5, line_count: 2, total_cents: 4500,
  notes: customerNote, admin_notes: staffNote,
  order_items: [
    { id: 1, quantity: 2, product_name: 'Latte Stone chocolate chip cookies', variant_name: 'Gift box of twelve', special_instructions: itemNote },
    { id: 2, quantity: 3, product_name: 'Macadamia cookies', variant_name: 'Small box', special_instructions: 'Use separate labels' },
  ],
};
const props = { orders: [order], saving: false, page: 1, totalPages: 3, onPageChange() {}, onQuickUpdateStatus() {}, onViewDetails() {} };
const render = (overrides = {}) => renderToStaticMarkup(createElement(PackingList, { ...props, ...overrides }));

function elements(value) {
  const node = expandUi(value);
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children];
  return [node, ...children.flatMap(elements)];
}
const buttons = (overrides = {}) => elements(PackingList({ ...props, ...overrides })).filter(el => el.type === 'button');
const byName = (nodes, name) => {
  const button = nodes.find(node => uiText(node) === name);
  assert.ok(button, `Expected ${name} button`);
  return button;
};

test('shipping cards keep customer, packing contents, full notes, payment, location and age together', () => {
  const html = render();
  for (const text of [
    order.customer_name, order.customer_email, order.order_number, order.location_name,
    'Placed 2h 5m ago', 'Processing', 'Paid', '$45.00', '5 items · 2 lines', '2×', '3×',
    'Latte Stone chocolate chip cookies', 'Gift box of twelve', 'Macadamia cookies', 'Small box',
    itemNote, 'Use separate labels', customerNote, staffNote, '>Ship<', '>Details<',
  ]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/<article /g) || []).length, 1);
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.ok(html.includes('aria-label="Shipping packing items"'));
  assert.equal(elements(PackingList(props)).find(el => el.type === 'time').props.dateTime, order.created_at);
  assert.ok(!/<table|overflow-x|truncate|line-clamp|\bhidden\b/.test(html));
  assert.ok(!/pickup|acknowledged|new paid|ready/i.test(html));
});

test('shipping stages and primary actions come from authoritative next options', () => {
  for (const [status, next, label] of [
    ['pending', 'processing', 'Process'],
    ['processing', 'shipped', 'Ship'],
    ['shipped', 'delivered', 'Delivered'],
  ]) {
    const html = render({ orders: [{ ...order, status, next_status_options: ['cancelled', next] }] });
    assert.ok(html.includes(`>${status === 'pending' ? 'New paid' : status[0].toUpperCase() + status.slice(1)}<`));
    assert.ok(html.includes(`>${label}<`));
  }
  // Do not infer Ship merely because the current status is Processing.
  assert.ok(!render({ orders: [{ ...order, next_status_options: [] }] }).includes('>Ship<'));
  assert.ok(render({ orders: [{ ...order, next_status_options: ['delivered'] }] }).includes('>Delivered<'));
});

test('unpaid, failed, refunded and terminal orders retain Details without an unauthorized action', () => {
  for (const [payment_status, label] of [
    ['pending', 'Waiting for payment'], ['failed', 'Payment failed'],
    ['refunded', 'Refunded'], ['partially_refunded', 'Partially refunded'],
  ]) {
    const html = render({ orders: [{ ...order, payment_status, next_status_options: ['cancelled'] }] });
    assert.ok(html.includes(label));
    assert.ok(html.includes('>Details<'));
    assert.ok(!/>Ship<|>Process<|>Delivered</.test(html));
  }
  for (const status of ['delivered', 'cancelled']) {
    const nodes = buttons({ orders: [{ ...order, status, next_status_options: [] }], totalPages: 1 });
    assert.deepEqual(nodes.map(uiText), ['Details']);
  }
});

test('shipment action forwards shipped to the parent ShipOrderModal flow and Details forwards its currentTarget', () => {
  const calls = [];
  const nodes = buttons({ onQuickUpdateStatus: (...args) => calls.push(args), onViewDetails: (...args) => calls.push(args) });
  const trigger = { tagName: 'BUTTON', focus() {} };
  const child = { tagName: 'SPAN' };
  byName(nodes, 'Ship').props.onClick();
  byName(nodes, 'Details').props.onClick({ currentTarget: trigger, target: child });
  assert.deepEqual(calls, [[9, 'shipped'], [9, trigger]]);
  assert.equal(calls[1][1], trigger);
  assert.notEqual(calls[1][1], child);
});

test('pagination forwards both directions and disables first/last boundaries', () => {
  const calls = [];
  const first = buttons({ onPageChange: page => calls.push(page) });
  assert.equal(byName(first, 'Previous').props.disabled, true);
  assert.equal(byName(first, 'Next').props.disabled, false);
  byName(first, 'Next').props.onClick();
  const middle = buttons({ page: 2, onPageChange: page => calls.push(page) });
  assert.equal(byName(middle, 'Previous').props.disabled, false);
  assert.equal(byName(middle, 'Next').props.disabled, false);
  byName(middle, 'Previous').props.onClick();
  byName(middle, 'Next').props.onClick();
  const last = buttons({ page: 3 });
  assert.equal(byName(last, 'Previous').props.disabled, false);
  assert.equal(byName(last, 'Next').props.disabled, true);
  assert.deepEqual(calls, [2, 1, 3]);
  assert.ok(render().includes('aria-label="Shipping order pages"'));
  assert.ok(render({ page: 2 }).includes('Page 2 of 3'));
  assert.ok(!render({ totalPages: 1 }).includes('<nav'));
  assert.ok(!render({ orders: [], totalPages: 0 }).includes('<nav'));
});

test('saving disables every action and pagination control; all controls have 44px minimum height', () => {
  const busy = buttons({ saving: true, page: 2 });
  assert.equal(busy.length, 4);
  assert.ok(busy.every(button => button.props.disabled));
  assert.ok(busy.every(button => button.props.className.includes('ui-button--md')));
});

test('missing optional content is honest, while shipped tracking and long unbroken content remain available', () => {
  const html = render({ orders: [{
    ...order, customer_name: '', customer_email: '', location_name: undefined,
    notes: undefined, admin_notes: undefined, status: 'shipped', tracking_number: 'Carrier: ' + '1234567890'.repeat(30),
    created_at: 'unknown', next_status_options: ['delivered'], item_count: 1, line_count: 1,
    order_items: [{ id: 1, quantity: 1, product_name: 'Cookie'.repeat(60), variant_name: '', special_instructions: '' }],
  }] });
  for (const text of ['Customer name unavailable', 'Email unavailable', 'Fulfillment location unavailable', 'Time unavailable', '1 item · 1 line', 'Cookie'.repeat(60), '1234567890'.repeat(30)]) assert.ok(html.includes(text), text);
  assert.ok(!/Item note:|Customer note:|Staff note:/.test(html));
  assert.ok(html.includes('[overflow-wrap:anywhere]'));
});
