import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextStatusAction } from '../src/components/admin/orders/orderUtils.ts';

test('pickup action follows authoritative fulfillment permissions rather than retail order type', () => {
  const order = { order_type: 'retail', fulfillment_type: 'pickup', status: 'pending', next_status_options: ['confirmed', 'cancelled'] };
  assert.equal(getNextStatusAction(order).label, 'Acknowledge');
  assert.equal(getNextStatusAction({ ...order, next_status_options: ['ready', 'cancelled'] }).label, 'Ready');
  assert.equal(getNextStatusAction({ ...order, next_status_options: ['picked_up', 'cancelled'] }).label, 'Picked up');
  assert.equal(getNextStatusAction({ ...order, payment_status: 'pending', next_status_options: ['cancelled'] }), null);
  assert.equal(getNextStatusAction({ ...order, next_status_options: [] }), null);
  assert.equal(getNextStatusAction({ ...order, fulfillment_type: 'shipping', next_status_options: ['shipped', 'cancelled'] }).label, 'Ship');
});
