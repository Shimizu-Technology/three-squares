import { useRef, useState } from 'react';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import type { Order } from './orderUtils';
import { formatCurrency, formatDate, getStatusBadge, formatStatus, getNextStatusAction } from './orderUtils';

interface OrderDetailModalProps {
  order: Order;
  saving: boolean;
  onClose: () => void;
  onUpdateOrder: (updates: { status: string; tracking_number: string | null; admin_notes: string | null }) => void;
  onQuickUpdateStatus: (orderId: number, newStatus: string) => void;
  onResendNotification: (orderId: number) => void;
  onOpenRefundModal: () => void;
  storeEmail?: string;
}

export default function OrderDetailModal({
  order,
  saving,
  onClose,
  onUpdateOrder,
  onQuickUpdateStatus,
  onResendNotification,
  onOpenRefundModal,
  storeEmail = 'sales@bgpacific.com',
}: OrderDetailModalProps) {
  useLockBodyScroll(true);

  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState(order.status);
  const [editTracking, setEditTracking] = useState(order.tracking_number || '');
  const [editAdminNotes, setEditAdminNotes] = useState(order.admin_notes || '');
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  const nextAction = getNextStatusAction(order);

  const handleSave = () => {
    onUpdateOrder({
      status: editStatus,
      tracking_number: editTracking || null,
      admin_notes: editAdminNotes || null,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditStatus(order.status);
    setEditTracking(order.tracking_number || '');
    setEditAdminNotes(order.admin_notes || '');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-white/30 print:bg-white print:p-0 print:block"
      onClick={onClose}
    >
      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          aside, header, nav, [class*='sidebar'], [class*='Sidebar'] { display: none !important; }
          .md\\:pl-64, [class*='md:pl-64'] { padding-left: 0 !important; }
          .print-content, .print-content * { visibility: visible; }
          .print-content {
            position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0;
            max-width: 100% !important; max-height: none !important;
            overflow: visible !important; box-shadow: none !important; border-radius: 0 !important;
          }
          .print-hide { display: none !important; }
          .print-content button { display: none !important; }
          .print-content a { text-decoration: none; color: inherit; }
          @page { margin: 0.5in; size: auto; }
          .print-content { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div
        className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col min-h-0 shadow-2xl print:shadow-none print:max-h-none print:overflow-visible print-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white z-10 print:static print:border-b-2 print:border-gray-400 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              <span className="print:hidden">Order #</span>
              <span className="hidden print:inline text-3xl">THREE SQUARES - PACKING SLIP<br /></span>
              {order.order_number}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{formatDate(order.created_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-gray-400 hover:text-gray-600 text-3xl leading-none rounded-lg hover:bg-gray-100 transition print-hide"
            aria-label="Close order details"
          >
            &times;
          </button>
        </div>

        <div
          ref={modalContentRef}
          className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 overscroll-contain print:overflow-visible"
          onWheel={(event) => {
            if (modalContentRef.current) {
              modalContentRef.current.scrollTop += event.deltaY;
            }
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          {/* Order Management */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 print-hide">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className="font-semibold text-gray-900">Order Management</h3>
              <div className="flex gap-2 w-full sm:w-auto">
                {!isEditing && nextAction && (
                  <button
                    type="button"
                    onClick={() => onQuickUpdateStatus(order.id, nextAction.status)}
                    className={`flex-1 sm:flex-none px-4 py-2 text-white rounded-lg transition text-sm font-medium ${nextAction.color}`}
                  >
                    {nextAction.label}
                  </button>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex-1 sm:flex-none px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm font-medium"
                  >
                    Edit Details
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Status *</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  >
                    <option value="pending">Pending</option>
                    {order.order_type === 'retail' ? (
                      <>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                      </>
                    ) : (
                      <>
                        <option value="confirmed">Confirmed</option>
                        <option value="ready">Ready for Pickup</option>
                        <option value="picked_up">Picked Up</option>
                      </>
                    )}
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
                  <input
                    type="text"
                    value={editTracking}
                    onChange={(e) => setEditTracking(e.target.value)}
                    placeholder="Enter tracking number..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes (Internal)</label>
                  <textarea
                    value={editAdminNotes}
                    onChange={(e) => setEditAdminNotes(e.target.value)}
                    placeholder="Add internal notes about this order..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 mb-1">Status</p>
                  <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadge(order.status)}`}>
                    {formatStatus(order.status)}
                  </span>
                </div>
                {order.order_type === 'retail' && (
                  <div>
                    <p className="text-gray-600 mb-1">Tracking Number</p>
                    <p className="font-medium">{order.tracking_number || 'Not added yet'}</p>
                  </div>
                )}
                {order.admin_notes && (
                  <div className="md:col-span-2">
                    <p className="text-gray-600 mb-1">Admin Notes</p>
                    <p className="font-medium text-gray-700 bg-gray-50 p-3 rounded-lg">{order.admin_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Order Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Payment Status</p>
                <p className={`font-medium ${order.payment_status === 'refunded' ? 'text-red-600' : order.payment_status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Order Type</p>
                <p className="font-medium capitalize">{order.order_type}</p>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-600">Name:</span> <span className="font-medium">{order.customer_name}</span></p>
              <p>
                <span className="text-gray-600">Email:</span>
                <a href={`mailto:${order.customer_email}`} className="font-medium text-tsPrimary hover:underline ml-1">
                  {order.customer_email}
                </a>
              </p>
              <p><span className="text-gray-600">Phone:</span> <span className="font-medium">{order.customer_phone}</span></p>
            </div>
          </div>

          {/* Shipping Address */}
          {order.order_type === 'retail' && order.shipping_address_line1 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Shipping Address</h3>
              <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">{order.shipping_address_line1}</p>
                {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                <p>{order.shipping_city}, {order.shipping_state} {order.shipping_zip}</p>
                <p>{order.shipping_country}</p>
                <p className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-gray-600">Shipping Method:</span>
                  <span className="font-medium ml-1">{order.shipping_method}</span>
                </p>
              </div>
            </div>
          )}

          {/* Customer Notes */}
          {order.notes && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Customer Notes</h3>
              <div className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <p>{order.notes}</p>
              </div>
            </div>
          )}

          {/* Order Items */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Order Items</h3>
            <div className="space-y-3">
              {order.order_items.map((item) => (
                <div key={item.id} className="flex justify-between items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.product_name}</p>
                    <p className="text-sm text-gray-600 mt-1">{item.variant_name}</p>
                    <p className="text-xs text-gray-500 mt-1">SKU: {item.product_sku}</p>
                    <p className="text-sm text-gray-600 mt-2">
                      {formatCurrency(item.unit_price_cents)} &times; {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold text-lg">{formatCurrency(item.total_price_cents)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Order Totals */}
          <div className="border-t pt-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(order.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping:</span>
                <span className="font-medium">{formatCurrency(order.shipping_cost_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax:</span>
                <span className="font-medium">{formatCurrency(order.tax_cents)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-3 border-t border-gray-300">
                <span>Total:</span>
                <span className="text-tsPrimary print:text-black">{formatCurrency(order.total_cents)}</span>
              </div>
            </div>
          </div>

          {/* Refund History */}
          {order.refunds && order.refunds.length > 0 && (
            <div className="print-hide">
              <h3 className="font-semibold text-gray-900 mb-3">Refund History</h3>
              <div className="space-y-3">
                {order.refunds.map((refund) => (
                  <div key={refund.id} className="flex justify-between items-start p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                          refund.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                          refund.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {refund.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(refund.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {refund.reason && <p className="text-sm text-gray-600 mt-1">{refund.reason}</p>}
                      {refund.admin_user && <p className="text-xs text-gray-500 mt-1">By: {refund.admin_user}</p>}
                    </div>
                    <p className="font-semibold text-red-600 text-lg">{refund.amount_formatted}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Print Thank You */}
          <div className="hidden print:block text-center pt-8 border-t border-gray-300 mt-4">
            <p className="text-lg font-semibold text-gray-800">Thank you for your order!</p>
            <p className="text-sm text-gray-600 mt-2">Three Squares - Good Food, Good Mood, Good Service</p>
            <p className="text-xs text-gray-500 mt-1">Questions? Contact us at {storeEmail}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-4 border-t print-hide">
            {(order.status === 'ready' || order.status === 'shipped') && (
              <button
                type="button"
                onClick={() => onResendNotification(order.id)}
                className="flex-1 min-w-[140px] px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
              >
                Notify Customer
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 min-w-[140px] px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
            >
              Print Packing Slip
            </button>
            <button
              type="button"
              onClick={() => window.open(`mailto:${order.customer_email}`, '_blank')}
              className="flex-1 min-w-[140px] px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium inline-flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8.25l7.485 4.99a2.75 2.75 0 003.03 0L21 8.25M4.5 6.75h15A1.5 1.5 0 0121 8.25v7.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 15.75v-7.5a1.5 1.5 0 011.5-1.5z" />
              </svg>
              Email Customer
            </button>
            {order.payment_status === 'paid' && (
              <button
                type="button"
                onClick={onOpenRefundModal}
                className="flex-1 min-w-[140px] px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-primary-dark transition font-medium"
              >
                Refund Order
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
