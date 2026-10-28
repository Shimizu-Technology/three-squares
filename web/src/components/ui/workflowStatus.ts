import type { StatusTone } from './StatusBadge';

export type WorkflowAudience = 'staff' | 'customer';
export interface StatusPresentation { label: string; tone: StatusTone }
const labels: Record<string, string> = {pending:'Pending', confirmed:'Confirmed', processing:'Processing', ready:'Ready', shipped:'Shipped', picked_up:'Picked up', delivered:'Delivered', cancelled:'Cancelled'};

export function statusTone(status: string): StatusTone {
  if (['failed','cancelled','declined','error'].includes(status)) return 'danger';
  if (['paid','succeeded','ready','accepted','available','connected','enabled'].includes(status)) return 'success';
  if (['confirmed','acknowledged','processing','quoted','shipped'].includes(status)) return 'info';
  if (['pending','unknown','reserved','dispatching','waiting_payment','sold_out','disconnected'].includes(status)) return 'attention';
  if (['draft','retired','archived','disabled','not_offered'].includes(status)) return 'inactive';
  return 'neutral';
}

/** Stored state stays unchanged; audience and payment facts determine its label. */
export function orderStatus(order: {status: string; payment_status?: string; fulfillment_type?: string}, audience: WorkflowAudience = 'staff'): StatusPresentation {
  let label = labels[order.status] || order.status.replaceAll('_', ' ');
  if (audience === 'staff') {
    if (order.status === 'confirmed' || (order.status === 'processing' && order.fulfillment_type === 'pickup')) label = 'Acknowledged';
    if (order.status === 'pending' && order.payment_status === 'paid') label = 'New paid';
    else if (order.status === 'pending' && order.payment_status === 'pending') label = 'Waiting for payment';
  }
  return {label, tone: statusTone(order.status)};
}

export function paymentStatus(status: string): StatusPresentation {
  const labels: Record<string, string> = {paid:'Paid', pending:'Waiting for payment', failed:'Payment failed', refunded:'Refunded', partially_refunded:'Partially refunded', unpaid:'Unpaid'};
  return {label: labels[status] || `Payment ${status.replaceAll('_',' ')}`, tone: status === 'unpaid' ? 'attention' : statusTone(status)};
}
