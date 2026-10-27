import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutContactReducer as reduce, emptyCheckoutContact as empty } from '../src/lib/checkoutContact.ts';
const a = { name: 'Customer A', email: 'a@example.com', phone: '671-555-0100' };
const b = { name: 'Customer B', email: 'b@example.com', phone: '671-555-0200' };
const signIn = (state, identity) => reduce(state, { type: 'identity', identity });
const load = (state, identity, profile) => reduce(state, { type: 'profile', identity, profile });

test('replaces completed automatic prefill when the account changes without unmount', () => {
  let state = load(signIn(empty, 'A'), 'A', a);
  assert.deepEqual(state.values, a);
  state = signIn(state, 'B');
  assert.deepEqual(state.values, empty.values);
  state = load(state, 'B', b);
  assert.deepEqual(state.values, b);
  assert.equal(load(state, 'A', a), state);
  assert.deepEqual(signIn(state, null).values, empty.values);
});

test('preserves manual edits and deliberately cleared fields through delayed responses and identity changes', () => {
  let state = signIn(empty, 'A');
  state = reduce(state, { type: 'edit', field: 'name', value: 'Typed Name' });
  state = reduce(state, { type: 'edit', field: 'phone', value: '' });
  state = load(state, 'A', a);
  assert.deepEqual(state.values, { name: 'Typed Name', email: a.email, phone: '' });
  state = load(signIn(state, 'B'), 'B', b);
  assert.deepEqual(state.values, { name: 'Typed Name', email: b.email, phone: '' });
});

test('StrictMode identity replay does not erase completed prefill', () => {
  const state = load(signIn(empty, 'A'), 'A', a);
  assert.equal(signIn(state, 'A'), state);
  assert.deepEqual(load(state, 'A', a).values, a);
});
