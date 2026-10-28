import { uiModules, expandUi } from './helpers/uiModules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooks = moduleUrl(`export const useId = () => 'synthetic-heading';
  export const useState = (...args) => globalThis.__operationalDialog.useState(...args);
  export const useRef = (...args) => globalThis.__operationalDialog.useRef(...args);`);
const dialog = moduleUrl('export default function Dialog() {}');
async function compile(source, imports) {
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText.replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(imports[name] || uiModules[name] || import.meta.resolve(name))}`);
  return import(moduleUrl(code));
}
const utils = new URL('../src/components/admin/orders/orderUtils.ts', import.meta.url).href;
const component = async name => (await compile(readFileSync(new URL(`../src/components/admin/orders/${name}.tsx`, import.meta.url), 'utf8'), {
  react: hooks, '../../ui/Dialog': dialog, '../AdminModal': dialog,
  './orderUtils': utils,
  '../../payment/PaymentReceipt': dialog, '../../payment/PaymentEnvironmentBadge': dialog,
})).default;
const OrderDetails = await component('OrderDetailModal');
const Refund = await component('RefundModal');
const Ship = await component('ShipOrderModal');
const pos = readFileSync(new URL('../src/pages/admin/AdminPOSPage.tsx', import.meta.url), 'utf8');
const cashSource = `import {useId,useRef,useState} from 'react';
  import AdminModal from 'modal'; const Banknote = () => null;
  ${pos.slice(pos.indexOf('function CashModal'), pos.indexOf('// ─── Main POS Page'))}
  export { CashModal, VariantPickerModal };`;
const { CashModal, VariantPickerModal } = await compile(cashSource, { react: hooks, modal: dialog });
const nodes = value => { const node = expandUi(value); return !node || typeof node !== 'object' ? [] : [node,
  ...[node.props?.children, node.props?.footer, node.props?.actions].flat(Infinity).flatMap(nodes)]; }
const text = node => typeof node === 'string' ? node : node && typeof node === 'object'
  ? [node.props?.children].flat(Infinity).map(text).join('') : '';
function render(Component, props) {
  const state = []; let cursor = 0;
  const h = {
    props,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial;
      return [state[i], value => { state[i] = value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
    render() { globalThis.__operationalDialog = h; cursor = 0; return Component(h.props); },
  };
  return h;
}
const order = { id: 7, order_number: 'SYNTHETIC-7', status: 'pending', payment_status: 'paid',
  next_status_options: ['confirmed', 'cancelled'], total_cents: 1200, subtotal_cents: 1200,
  created_at: '2026-10-28T00:00:00+10:00', customer_name: 'Synthetic customer', order_items: [], refunds: [] };

test('order dialog blocks pending dismissal and forwards the actual refund opener', () => {
  const calls = [], opener = { tagName: 'BUTTON' }, returnFocusRef = { current: {} };
  const h = render(OrderDetails, { order, saving: true, returnFocusRef, onClose: () => calls.push('close'), onOpenRefundModal: trigger => calls.push(trigger) });
  const pending = h.render();
  assert.equal(pending.props.dismissible, false);
  assert.equal(pending.props.returnFocusRef, returnFocusRef);
  pending.props.onOpenChange(false);
  const close = nodes(pending).find(node => node.props?.['aria-label'] === 'Close order details');
  assert.equal(close.props.disabled, true); close.props.onClick();
  assert.deepEqual(calls, []);
  h.props.saving = false;
  const refund = nodes(h.render()).find(node => node.type === 'button' && text(node) === 'Refund Order');
  refund.props.onClick({ currentTarget: opener });
  assert.deepEqual(calls, [opener]);
});

test('refund presentation keeps the saved payload and blocks all pending close requests', () => {
  const calls = [], saved = { payload: { amount_cents: 350, reason: 'Synthetic saved reason', restock_items: true } };
  const h = render(Refund, { order, processing: true, savedRequest: saved, onClose: () => calls.push('close'), onProcess: (...args) => calls.push(args) });
  const tree = h.render();
  assert.equal(tree.props.dismissible, false);
  tree.props.onOpenChange(false);
  const close = nodes(tree).find(node => node.type === 'button' && text(node) === 'Close');
  assert.equal(close.props.disabled, true); close.props.onClick();
  assert.deepEqual(calls, []);
  h.props.processing = false;
  nodes(h.render()).find(node => node.type === 'button' && text(node) === 'Check saved refund').props.onClick();
  assert.deepEqual(calls, [[350, 'Synthetic saved reason', true]]);
});

test('shipping is controlled and labels its fields while disabling pending actions', () => {
  const tree = render(Ship, { open: false, saving: true, carrier: 'USPS', trackingNumber: 'SYNTHETIC' }).render();
  assert.equal(tree.props.open, false); assert.equal(tree.props.dismissible, false);
  assert.ok(nodes(tree).filter(node => ['select', 'input', 'button'].includes(node.type)).every(node => node.props.disabled));
  assert.equal(nodes(tree).filter(node => node.type === 'label' && node.props.htmlFor).length, 2);
});

test('cash dialog preserves cents/change calculations and disables pending tender edits', () => {
  const calls = [], h = render(CashModal, { totalCents: 1200, submitting: false, returnFocusRef: { current: {} }, onClose() {}, onComplete: value => calls.push(value) });
  let tree = h.render();
  nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: '20.00' } });
  tree = h.render();
  assert.match(text(tree), /Change Due\$8\.00/);
  tree.props.footer.props.onClick(); assert.deepEqual(calls, [2000]);
  h.props.submitting = true; tree = h.render();
  assert.equal(tree.props.dismissible, false); assert.equal(tree.props.footer.props.disabled, true);
  assert.ok(nodes(tree).filter(node => node.type === 'input' || node.type === 'button').every(node => node.props.disabled));
});

test('cash insufficient amount stays disabled and variant choices retain eligibility', () => {
  const h = render(CashModal, { totalCents: 1200, submitting: false, returnFocusRef: { current: null } });
  nodes(h.render()).find(node => node.type === 'input').props.onChange({ target: { value: '5.00' } });
  assert.equal(h.render().props.footer.props.disabled, true);
  const calls = [], variant = { id: 1, name: 'Large', in_stock: true, price_formatted: '$12.00' };
  const picker = VariantPickerModal({ product: { name: 'Synthetic meal', variants: [variant, { ...variant, id: 2, in_stock: false }] }, onSelect: value => calls.push(value), returnFocusRef: { current: {} } });
  const buttons = nodes(picker).filter(node => node.type === 'button');
  assert.equal(buttons[0].props.disabled, false); assert.equal(buttons[1].props.disabled, true);
  buttons[0].props.onClick(); assert.deepEqual(calls, [variant]);
});
