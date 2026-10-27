import assert from 'node:assert/strict';
import test from 'node:test';
import { hostedPageUrl, collectionAvailable } from '../src/lib/hostedPage.ts';

const url = 'https://certtransaction.hostedpayments.com/?TransactionSetupID=12345678-1234-1234-1234-123456789abc';
const state = { flow: 'worldpay_hosted_page', payment_state: 'collecting', environment: 'sandbox', collection_config: { hosted_url: url } };
test('resumes only the saved collecting hosted page for its environment', () => {
  assert.equal(hostedPageUrl(state), url);
  assert.equal(hostedPageUrl({ ...state, payment_state: 'unknown' }), url);
  for (const change of [{ flow: 'stripe_embedded' }, { payment_state: 'captured' }, { environment: 'simulated' }, { environment: 'production' }]) assert.equal(hostedPageUrl({ ...state, ...change }), null);
});
test('legacy Worldpay HPP readiness does not require Stripe credentials', () => {
  assert.equal(collectionAvailable({ payment_processor: 'worldpay', payment_presentation: 'worldpay_hosted_page', payment_environment: 'sandbox' }), true);
  assert.equal(collectionAvailable({ payment_processor: 'worldpay', payment_presentation: 'worldpay_hosted_fields', payment_environment: 'sandbox' }), false);
  assert.equal(collectionAvailable({ payment_processor: 'stripe', stripe_account_id: 'fixture' }), false);
});
test('rejects injected hosts, protocols, credentials, duplicate parameters and malformed setup IDs', () => {
  for (const hosted_url of ['javascript:alert(1)', url.replace('certtransaction.hostedpayments.com', 'example.test'), url.replace('https:', 'http:'), url.replace('https://', 'https://user:password@'), `${url}&TransactionSetupID=other`, `${url}#fragment`, url.replace('123456789abc', 'no-id')]) {
    assert.equal(hostedPageUrl({ ...state, collection_config: { hosted_url } }), null);
  }
});

test('a saved checkout marked unavailable never resumes an old hosted collection URL', () => {
  assert.equal(hostedPageUrl({ ...state, collection_config: { available: false, hosted_url: url } }), null);
});
