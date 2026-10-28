import { Button } from '../../ui/Button';
import type { Order } from './orderUtils';
import PaymentEnvironmentBadge from '../../payment/PaymentEnvironmentBadge';
import { formatCurrency, formatDate, getStatusBadge, formatStatus, getNextStatusAction } from './orderUtils';

interface OrdersTableProps {
  orders: Order[];
  saving: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onQuickUpdateStatus: (orderId: number, newStatus: string) => void;
  onViewDetails: (orderId: number, trigger: HTMLButtonElement) => void;
}

function OrderTypeBadge({ type }: { type: string }) {
  if (type === 'wholesale') {
    return <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded">Wholesale</span>;
  }
  return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">Retail</span>;
}

export default function OrdersTable({
  orders,
  saving,
  page,
  totalPages,
  onPageChange,
  onQuickUpdateStatus,
  onViewDetails,
}: OrdersTableProps) {
  return (
    <>
      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order) => {
              const nextAction = getNextStatusAction(order);
              return (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{order.order_number}</div>
                    <PaymentEnvironmentBadge environment={order.payment_environment} inline />
                    <div className="mt-1"><OrderTypeBadge type={order.order_type} /></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{order.location_name || '—'}</div>
                    {order.fulfillment_type && (
                      <div className="text-xs text-gray-500 capitalize">{order.fulfillment_type}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{order.customer_name}</div>
                    <div className="text-xs text-gray-500">{order.customer_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(order.total_cents)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(order.status)}`}>
                      {formatStatus(order.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(order.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {nextAction && (
                        <Button
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickUpdateStatus(order.id, nextAction.status);
                          }}
                          variant="primary"
                        >
                          {nextAction.label}
                        </Button>
                      )}
                      <Button
                        disabled={saving}
                        onClick={(event) => onViewDetails(order.id, event.currentTarget)}
                        variant="secondary"
                      >
                        Details
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {orders.map((order) => {
          const nextAction = getNextStatusAction(order);
          return (
            <div key={order.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{order.order_number}</p>
                  <PaymentEnvironmentBadge environment={order.payment_environment} inline />
                  <p className="text-sm text-gray-600">{order.customer_name}</p>
                  <div className="mt-1"><OrderTypeBadge type={order.order_type} /></div>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(order.status)}`}>
                  {formatStatus(order.status)}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                {order.location_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium">{order.location_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-medium">{order.item_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-semibold">{formatCurrency(order.total_cents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Date:</span>
                  <span>{formatDate(order.created_at)}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                {nextAction && (
                  <Button
                    disabled={saving}
                    onClick={() => onQuickUpdateStatus(order.id, nextAction.status)}
                    variant="primary" className="flex-1"
                  >
                    {nextAction.label}
                  </Button>
                )}
                <Button
                  disabled={saving}
                  onClick={(event) => onViewDetails(order.id, event.currentTarget)}
                  variant="secondary" className="flex-1"
                >
                  {nextAction ? 'Details' : 'View Details'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <Button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            variant="secondary"
          >
            Previous
          </Button>
          <span className="px-4 py-2 text-gray-700">
            Page {page} of {totalPages}
          </span>
          <Button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            variant="secondary"
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}
