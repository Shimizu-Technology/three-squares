import { StatusBadge } from '../../ui/StatusBadge';
import { paymentStatus } from '../../ui/workflowStatus';
import { OrderStatusBadge } from './OrderStatusBadge';
import { Button } from '../../ui/Button';
import type { Order } from './orderUtils';
import { formatCurrency, formatDate, getNextStatusAction, pickupOrderAge as orderAge } from './orderUtils';

interface Props {
  orders: Order[];
  saving: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onQuickUpdateStatus: (id: number, status: string) => void;
  onViewDetails: (id: number, trigger: HTMLButtonElement) => void;
}

export default function ShippingPackingList({ orders, saving, page, totalPages, onPageChange, onQuickUpdateStatus, onViewDetails }: Props) {
  return <div className="min-w-0 space-y-3">
    {orders.map((order) => {
      const action = getNextStatusAction(order);
      return <article key={order.id} aria-label={`Order ${order.order_number}`} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm [overflow-wrap:anywhere]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-950">{order.customer_name || 'Customer name unavailable'}</p>
            <p className="mt-1 text-sm text-gray-600">{order.customer_email || 'Email unavailable'}</p>
            <p className="mt-1 text-sm font-semibold text-gray-800">{order.location_name || 'Fulfillment location unavailable'}</p>
            <p className="mt-1 text-sm text-gray-600">{order.order_number} · <time dateTime={order.created_at} title={formatDate(order.created_at)}>{orderAge(order.created_at)}</time></p>
          </div>
          <div className="flex shrink-0 gap-2">
            {action && <Button type="button" disabled={saving} onClick={() => onQuickUpdateStatus(order.id, action.status)} variant="primary">{action.label}</Button>}
            <Button type="button" disabled={saving} onClick={(event) => onViewDetails(order.id, event.currentTarget)} variant="secondary">Details</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <OrderStatusBadge order={order} />
          <StatusBadge tone={paymentStatus(order.payment_status).tone}>{paymentStatus(order.payment_status).label}</StatusBadge>
          <span className="font-semibold text-gray-800 tabular-nums">{order.item_count} {order.item_count === 1 ? 'item' : 'items'} · {order.line_count} {order.line_count === 1 ? 'line' : 'lines'}</span>
          <span className="text-gray-600 tabular-nums">{formatCurrency(order.total_cents)}</span>
        </div>
        {order.tracking_number && <p className="mt-3 text-sm text-gray-700"><span className="font-semibold">Tracking: </span>{order.tracking_number}</p>}
        <ul aria-label="Shipping packing items" className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {order.order_items.map((item) => <li key={item.id} className="flex min-w-0 gap-3 py-3">
            <span className="min-w-10 shrink-0 text-right text-lg font-bold tabular-nums text-gray-950">{item.quantity}×</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-950">{item.product_name}</p>
              {item.variant_name && <p className="text-sm text-gray-600">{item.variant_name}</p>}
              {item.special_instructions && <p className="mt-1 whitespace-pre-wrap rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-950"><span className="font-semibold">Item note: </span>{item.special_instructions}</p>}
            </div>
          </li>)}
        </ul>
        {order.notes && <p className="whitespace-pre-wrap rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"><span className="font-semibold">Customer note: </span>{order.notes}</p>}
        {order.admin_notes && <p className="mt-3 whitespace-pre-wrap rounded-md border-l-4 border-gray-300 bg-gray-50 p-3 text-sm text-gray-800"><span className="font-semibold">Staff note: </span>{order.admin_notes}</p>}
      </article>;
    })}
    {totalPages > 1 && <nav aria-label="Shipping order pages" className="flex flex-wrap items-center justify-center gap-3 py-3">
      <Button type="button" disabled={page <= 1 || saving} onClick={() => onPageChange(Math.max(1, page - 1))} variant="secondary">Previous</Button>
      <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
      <Button type="button" disabled={page >= totalPages || saving} onClick={() => onPageChange(Math.min(totalPages, page + 1))} variant="secondary">Next</Button>
    </nav>}
  </div>;
}
