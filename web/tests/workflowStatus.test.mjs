import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStatus, paymentStatus, statusTone } from '../src/components/ui/workflowStatus.ts';

test('staff acknowledgment and customer confirmation share one stored state', () => {
  assert.deepEqual(orderStatus({status:'confirmed'},'staff'), {label:'Acknowledged',tone:'info'});
  assert.deepEqual(orderStatus({status:'confirmed'},'customer'), {label:'Confirmed',tone:'info'});
  assert.equal(orderStatus({status:'processing',fulfillment_type:'pickup'}).label,'Acknowledged');
});
test('paid and unpaid pending orders have distinct staff labels without inventing a payment outcome', () => {
  assert.equal(orderStatus({status:'pending',payment_status:'paid'}).label,'New paid');
  assert.equal(orderStatus({status:'pending',payment_status:'pending'}).label,'Waiting for payment');
  assert.equal(orderStatus({status:'pending'}).label,'Pending');
  assert.equal(orderStatus({status:'pending',payment_status:'failed'}).label,'Pending');
  assert.equal(paymentStatus('failed').label,'Payment failed');
});
test('completed and inactive states stay neutral while uncertainty and failure remain explicit', () => {
  assert.equal(statusTone('delivered'),'neutral');
  assert.equal(statusTone('retired'),'inactive');
  assert.equal(statusTone('unknown'),'attention');
  assert.equal(statusTone('cancelled'),'danger');
});
