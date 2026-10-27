import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextStatusAction, pickupOrderAge } from '../src/components/admin/orders/orderUtils.ts';

test('pickup action follows authoritative fulfillment permissions rather than retail order type', () => {
  const order = { order_type: 'retail', fulfillment_type: 'pickup', status: 'pending', next_status_options: ['confirmed', 'cancelled'] };
  assert.equal(getNextStatusAction(order).label, 'Acknowledge');
  assert.equal(getNextStatusAction({ ...order, next_status_options: ['ready', 'cancelled'] }).label, 'Ready');
  assert.equal(getNextStatusAction({ ...order, next_status_options: ['picked_up', 'cancelled'] }).label, 'Picked up');
  assert.equal(getNextStatusAction({ ...order, payment_status: 'pending', next_status_options: ['cancelled'] }), null);
  assert.equal(getNextStatusAction({ ...order, next_status_options: [] }), null);
  assert.equal(getNextStatusAction({ ...order, fulfillment_type: 'shipping', next_status_options: ['shipped', 'cancelled'] }).label, 'Ship');
});

test('pickup age identifies elapsed time without timezone or invalid-date errors', () => {
  const now=Date.parse('2026-10-27T06:30:00Z');
  assert.equal(pickupOrderAge('2026-10-27T06:30:00Z',now),'Just placed');
  assert.equal(pickupOrderAge('2026-10-27T06:19:00Z',now),'Placed 11m ago');
  assert.equal(pickupOrderAge('2026-10-27T05:19:00Z',now),'Placed 1h 11m ago');
  assert.equal(pickupOrderAge('invalid',now),'Time unavailable');
});
