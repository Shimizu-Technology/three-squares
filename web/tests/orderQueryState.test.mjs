import test from 'node:test';
import assert from 'node:assert/strict';
import { orderDateRange, orderListContext, parseOrderQuery, serializeOrderQuery, updateOrderQuery } from '../src/components/admin/orders/orderQueryState.ts';

const today = new Date(2026, 9, 27, 12);
const parse = (search, mode = 'default', now = today) => parseOrderQuery(search, mode, now);
const reload = (state, mode = 'default') => parse(serializeOrderQuery(state), mode);

test('dashboard pending and recent-order links honor their intended filter and selection', () => {
  assert.equal(parse('?status=pending').status, 'pending');
  assert.equal(parse('?id=123').orderId, 123);
  assert.deepEqual(parse('?status=pending&id=123'), {
    search: '', status: 'pending', orderType: 'all', businessLine: 'all', fulfillment: 'all',
    location: 'all', datePreset: 'today', startDate: '2026-10-27', endDate: '2026-10-27', page: 1, orderId: 123,
  });
});

test('order modes retain their established defaults and pickup-only stage/fulfillment rules', () => {
  const pickup = parse('', 'pickup_queue');
  assert.equal(pickup.status, 'new_paid');
  assert.equal(pickup.fulfillment, 'pickup');
  assert.equal(pickup.businessLine, 'all');
  const shipping = parse('', 'shipping_queue');
  assert.equal(shipping.status, 'processing');
  assert.equal(shipping.fulfillment, 'shipping');
  assert.equal(shipping.businessLine, 'latte_stone');
  assert.equal(parse('?status=waiting_payment', 'pickup_queue').status, 'waiting_payment');
  assert.equal(parse('?status=waiting_payment').status, 'all');
  assert.equal(parse('?status=processing&fulfillment=shipping', 'pickup_queue').status, 'new_paid');
  assert.equal(parse('?fulfillment=shipping', 'pickup_queue').fulfillment, 'pickup');
  assert.equal(parse('?business_line=all&fulfillment=all', 'shipping_queue').fulfillment, 'all');
});

test('malformed, fractional, non-positive and unsafe numbers never become IDs or pages', () => {
  for (const value of ['', '0', '-1', '1.5', '1e3', 'Infinity', 'NaN', '123abc', '9007199254740992']) {
    const state = parse(new URLSearchParams({ page: value, id: value, location: value }).toString());
    assert.equal(state.page, 1, value);
    assert.equal(state.orderId, null, value);
    assert.equal(state.location, 'all', value);
  }
  const state = parse('?page=003&id=00123&location=02');
  assert.equal(state.page, 3);
  assert.equal(state.orderId, 123);
  assert.equal(state.location, '2');
});

test('unsupported filter values fall back to the current mode instead of reaching requests', () => {
  const state = parse('?status=bogus&order_type=bogus&business_line=bogus&fulfillment=bogus&datepreset=bogus', 'shipping_queue');
  assert.equal(state.status, 'processing');
  assert.equal(state.orderType, 'all');
  assert.equal(state.businessLine, 'latte_stone');
  assert.equal(state.fulfillment, 'shipping');
  assert.equal(state.datePreset, 'today');
});

test('pinned preset dates retain their request but become an honest custom range after expiry', () => {
  const state = parse('?datepreset=last_7_days');
  assert.equal(state.startDate, '2026-10-21');
  assert.equal(state.endDate, '2026-10-27');
  const later = parse(serializeOrderQuery(state), 'default', new Date(2026, 10, 2, 12));
  assert.deepEqual(later, { ...state, datePreset: 'custom' });
  assert.equal(orderListContext(later, 'default'), orderListContext(state, 'default'));
  assert.equal(parse('?datepreset=today&start=2026-10-26&end=2026-10-26').datePreset, 'custom');
  assert.deepEqual(orderDateRange('this_month', new Date(2024, 1, 17)), { startDate: '2024-02-01', endDate: '2024-02-29' });
  assert.deepEqual(orderDateRange('last_7_days', new Date(2026, 0, 3)), { startDate: '2025-12-28', endDate: '2026-01-03' });
});

test('dates validate calendar days, normalize reversed ranges and allow open custom bounds', () => {
  assert.equal(parse('?start=2026-02-30&end=not-a-date').datePreset, 'custom');
  assert.equal(parse('?datepreset=today&start=2026-02-30').startDate, '2026-10-27');
  assert.equal(parse('?datepreset=custom&start=2024-02-29&end=').startDate, '2024-02-29');
  assert.equal(parse('?datepreset=custom&start=2026-02-29').startDate, '');
  const reversed = parse('?datepreset=custom&start=2026-10-27&end=2026-10-01');
  assert.equal(reversed.startDate, '2026-10-01');
  assert.equal(reversed.endDate, '2026-10-27');
  const allTime = parse('?datepreset=all_time&start=2026-10-01&end=2026-10-27');
  assert.equal(allTime.startDate, '');
  assert.equal(allTime.endDate, '');
  assert.equal(reload(allTime).datePreset, 'all_time');
});

test('the complete applied context round-trips including Unicode and URL-special search text', () => {
  const params = new URLSearchParams({
    search: '  Ana + café & #123 / 日本語  ', status: 'ready', order_type: 'wholesale', business_line: 'catering',
    fulfillment: 'pickup', location: '42', datepreset: 'custom', start: '', end: '2026-10-27', page: '7', id: '123',
  });
  const state = parse(params.toString());
  assert.equal(state.search, 'Ana + café & #123 / 日本語');
  assert.deepEqual(reload(state), state);
  const canonical = new URLSearchParams(serializeOrderQuery(state));
  assert.deepEqual([...canonical.keys()], ['search', 'status', 'order_type', 'business_line', 'fulfillment', 'location', 'datepreset', 'start', 'end', 'page', 'id']);
});

test('drilldown, close, Back, Forward and reload preserve the original filters and page', () => {
  const listing = Object.freeze(parse('?search=Ana&status=pending&location=2&datepreset=all_time&page=4'));
  const detail = updateOrderQuery(listing, { orderId: 123 }, 'default');
  const closed = updateOrderQuery(detail, { orderId: null }, 'default');
  assert.deepEqual(closed, listing);
  assert.equal(new URLSearchParams(serializeOrderQuery(closed)).has('id'), false);
  // History entries are complete URLs; revisiting one reconstructs the whole state.
  const history = [serializeOrderQuery(listing), serializeOrderQuery(detail), serializeOrderQuery(closed)];
  assert.deepEqual(parse(history[1]), detail);
  assert.deepEqual(parse(history[0]), listing);
  assert.deepEqual(parse(history[2]), closed);
});

test('applying filters/search resets page atomically while clamping retains current detail intent', () => {
  const state = parse('?search=Ana&status=ready&datepreset=all_time&page=8&id=123', 'pickup_queue');
  const filtered = updateOrderQuery(state, { status: 'all_active', page: 1 }, 'pickup_queue');
  assert.equal(filtered.page, 1);
  assert.equal(filtered.orderId, 123);
  assert.equal(filtered.search, 'Ana');
  const searched = updateOrderQuery(state, { search: '  New customer  ', page: 1 }, 'pickup_queue');
  assert.equal(searched.search, 'New customer');
  assert.equal(searched.status, 'ready');
  const clamped = updateOrderQuery(state, { page: 2 }, 'pickup_queue');
  assert.deepEqual(clamped, { ...state, page: 2 });
});

test('detail navigation leaves the list context unchanged, while applied filters and pagination invalidate it', () => {
  const listing = parse('?search=Ana&status=ready&location=2&page=4');
  const context = orderListContext(listing, 'default');
  const detail = updateOrderQuery(listing, { orderId: 123 }, 'default');
  assert.equal(orderListContext(detail, 'default'), context);
  assert.equal(orderListContext(updateOrderQuery(detail, { orderId: null }, 'default'), 'default'), context);
  assert.equal(orderListContext({ ...listing, datePreset: 'custom' }, 'default'), context);
  for (const change of [{ search: 'Other' }, { status: 'pending' }, { page: 3 }, { location: '1' }, { startDate: '2026-10-20' }]) {
    assert.notEqual(orderListContext({ ...listing, ...change }, 'default'), context);
  }
});

test('canonicalization is idempotent for defaults, bad queries and every mode', () => {
  for (const mode of ['default', 'pickup_queue', 'shipping_queue']) {
    for (const search of ['', '?id=oops&unknown=ignored', '?status=ready&status=pending&page=-4&start=invalid', '?datepreset=all_time', '?datepreset=custom&end=2024-02-29']) {
      const first = serializeOrderQuery(parse(search, mode));
      assert.equal(serializeOrderQuery(parse(first, mode)), first, `${mode}: ${search}`);
      assert.equal(new URLSearchParams(first).has('unknown'), false);
    }
  }
});
