export type OrderPageMode = 'default' | 'pickup_queue' | 'shipping_queue';
export type OrderDatePreset = 'today' | 'last_7_days' | 'this_month' | 'all_time' | 'custom';

export interface OrderQueryState {
  search: string;
  status: string;
  orderType: string;
  businessLine: string;
  fulfillment: string;
  location: string;
  datePreset: OrderDatePreset;
  startDate: string;
  endDate: string;
  page: number;
  orderId: number | null;
}

const statuses = ['all', 'pending', 'confirmed', 'processing', 'ready', 'shipped', 'picked_up', 'delivered', 'cancelled'];
const pickupStages = ['all', 'new_paid', 'confirmed', 'ready', 'picked_up', 'waiting_payment', 'all_active'];
const datePresets: OrderDatePreset[] = ['today', 'last_7_days', 'this_month', 'all_time', 'custom'];

function option(value: string | null, allowed: readonly string[], fallback: string) {
  return value !== null && allowed.includes(value) ? value : fallback;
}

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value: string | null): value is string {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function orderDateRange(preset: OrderDatePreset, now = new Date()) {
  if (preset === 'all_time') return { startDate: '', endDate: '' };
  const start = new Date(now);
  const end = new Date(now);
  if (preset === 'last_7_days') start.setDate(start.getDate() - 6);
  if (preset === 'this_month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export function parseOrderQuery(search: string, mode: OrderPageMode, now = new Date()): OrderQueryState {
  const params = new URLSearchParams(search);
  let datePreset = option(params.get('datepreset'), datePresets,
    params.has('start') || params.has('end') ? 'custom' : 'today') as OrderDatePreset;
  const defaultRange = datePreset === 'custom' ? { startDate: '', endDate: '' } : orderDateRange(datePreset, now);
  // Explicit dates pin an applied preset across reloads, including after midnight.
  // Invalid dates fall back safely; empty custom bounds mean an open range.
  let startDate = validDate(params.get('start')) ? params.get('start')! : defaultRange.startDate;
  let endDate = validDate(params.get('end')) ? params.get('end')! : defaultRange.endDate;
  if (datePreset === 'all_time') { startDate = ''; endDate = ''; }
  if (startDate && endDate && startDate > endDate) [startDate, endDate] = [endDate, startDate];
  // Retain the applied dates on reload, but never label a historical range
  // Today/Last 7 days/This month after that relative period has moved on.
  if (datePreset !== 'custom' && datePreset !== 'all_time' &&
      (startDate !== defaultRange.startDate || endDate !== defaultRange.endDate)) datePreset = 'custom';

  return {
    search: (params.get('search') || '').trim(),
    status: option(params.get('status'), mode === 'pickup_queue' ? pickupStages : statuses,
      mode === 'pickup_queue' ? 'new_paid' : mode === 'shipping_queue' ? 'processing' : 'all'),
    orderType: option(params.get('order_type'), ['all', 'retail', 'wholesale'], 'all'),
    businessLine: option(params.get('business_line'), ['all', 'three_squares', 'latte_stone', 'catering'], mode === 'shipping_queue' ? 'latte_stone' : 'all'),
    fulfillment: mode === 'pickup_queue' ? 'pickup' : option(params.get('fulfillment'), ['all', 'pickup', 'shipping'], mode === 'shipping_queue' ? 'shipping' : 'all'),
    location: String(positiveInteger(params.get('location')) || 'all'),
    datePreset,
    startDate,
    endDate,
    page: positiveInteger(params.get('page')) || 1,
    orderId: positiveInteger(params.get('id')),
  };
}

export function serializeOrderQuery(state: OrderQueryState) {
  const params = new URLSearchParams({
    search: state.search,
    status: state.status,
    order_type: state.orderType,
    business_line: state.businessLine,
    fulfillment: state.fulfillment,
    location: state.location,
    datepreset: state.datePreset,
    start: state.startDate,
    end: state.endDate,
    page: String(state.page),
  });
  if (state.orderId !== null) params.set('id', String(state.orderId));
  return params.toString();
}

export function updateOrderQuery(state: OrderQueryState, changes: Partial<OrderQueryState>, mode: OrderPageMode) {
  return parseOrderQuery(serializeOrderQuery({ ...state, ...changes }), mode);
}

// Selection and the preset label do not change a list request. Concrete dates do.
export function orderListContext(state: OrderQueryState, mode: OrderPageMode) {
  return JSON.stringify([mode, state.page, state.search, state.status, state.orderType, state.businessLine,
    state.fulfillment, state.location, state.startDate, state.endDate]);
}
