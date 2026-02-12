import type { Order } from './orderUtils';
import { formatCurrency, formatDate, getStatusBadge, formatStatus, getNextStatusAction } from './orderUtils';

interface OrdersTableProps {
  orders: Order[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onQuickUpdateStatus: (orderId: number, newStatus: string) => void;
  onViewDetails: (orderId: number) => void;
}

function OrderTypeBadge({ type }: { type: string }) {
  if (type === 'wholesale') {
    return <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded">Wholesale</span>;
  }
  return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">Retail</span>;
}

export default function OrdersTable({
  orders,
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
                    <div className="mt-1"><OrderTypeBadge type={order.order_type} /></div>
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickUpdateStatus(order.id, nextAction.status);
                          }}
                          className={`inline-flex items-center px-3.5 py-2.5 text-white text-sm font-semibold rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 ${nextAction.color}`}
                        >
                          {nextAction.label}
                        </button>
                      )}
                      <button
                        onClick={() => onViewDetails(order.id)}
                        className="inline-flex items-center px-3.5 py-2.5 text-gray-700 text-sm font-semibold bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
                      >
                        Details
                      </button>
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
                  <p className="text-sm text-gray-600">{order.customer_name}</p>
                  <div className="mt-1"><OrderTypeBadge type={order.order_type} /></div>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(order.status)}`}>
                  {formatStatus(order.status)}
                </span>
              </div>

              <div className="space-y-2 text-sm">
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
                  <button
                    onClick={() => onQuickUpdateStatus(order.id, nextAction.status)}
                    className={`flex-1 px-4 py-2.5 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 ${nextAction.color}`}
                  >
                    {nextAction.label}
                  </button>
                )}
                <button
                  onClick={() => onViewDetails(order.id)}
                  className={`${nextAction ? 'flex-1' : 'w-full'} px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 ${
                    nextAction
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-tsPrimary text-white hover:bg-primary-dark'
                  }`}
                >
                  {nextAction ? 'Details' : 'View Details'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="min-w-[44px] min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-700">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="min-w-[44px] min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
