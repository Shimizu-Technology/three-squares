import { toGuamDateInput } from '../../../utils/collectionSchedule.ts';

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

export function orderBusinessDate(now = new Date()) {
  return toGuamDateInput(now.toISOString()).slice(0, 10);
}

function validDate(value: string | null): value is string {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function orderDateRange(preset: OrderDatePreset, now = new Date()) {
  if (preset === 'all_time') return { startDate: '', endDate: '' };
  const start = new Date(`${orderBusinessDate(now)}T00:00:00Z`);
  const end = new Date(start);
  if (preset === 'last_7_days') start.setUTCDate(start.getUTCDate() - 6);
  if (preset === 'this_month') {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function parseOrderQuery(search: string, mode: OrderPageMode, now = new Date()): OrderQueryState {
  const params = new URLSearchParams(search);
  const datePreset = option(params.get('datepreset'), datePresets,
    params.has('start') || params.has('end') ? 'custom' : 'today') as OrderDatePreset;
  const defaultRange = datePreset === 'custom' ? { startDate: '', endDate: '' } : orderDateRange(datePreset, now);
  // Relative presets follow Guam's current business day, including old URLs
  // that previously serialized concrete dates. Only Custom pins its bounds.
  let startDate = datePreset === 'custom' && validDate(params.get('start')) ? params.get('start')! : defaultRange.startDate;
  let endDate = datePreset === 'custom' && validDate(params.get('end')) ? params.get('end')! : defaultRange.endDate;
  if (startDate && endDate && startDate > endDate) [startDate, endDate] = [endDate, startDate];

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
    page: String(state.page),
  });
  if (state.datePreset === 'custom') {
    params.set('start', state.startDate);
    params.set('end', state.endDate);
  }
  if (state.orderId !== null) params.set('id', String(state.orderId));
  return params.toString();
}

export function updateOrderQuery(state: OrderQueryState, changes: Partial<OrderQueryState>, mode: OrderPageMode, now = new Date()) {
  return parseOrderQuery(serializeOrderQuery({ ...state, ...changes }), mode, now);
}

// Selection and the preset label do not change a list request. Concrete dates do.
export function orderListContext(state: OrderQueryState, mode: OrderPageMode) {
  return JSON.stringify([mode, state.page, state.search, state.status, state.orderType, state.businessLine,
    state.fulfillment, state.location, state.startDate, state.endDate]);
}
