import { IconButton } from '../../ui/IconButton';
import { X, Mail } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useId, useRef, useState, type RefObject } from 'react';
import Dialog from '../../ui/Dialog';
import type { Order } from './orderUtils';
import PaymentReceipt from '../../payment/PaymentReceipt';
import PaymentEnvironmentBadge from '../../payment/PaymentEnvironmentBadge';
import { formatCurrency, formatDate, getStatusBadge, formatStatus, getNextStatusAction } from './orderUtils';

interface OrderDetailModalProps {
  order: Order;
  saving: boolean;
  onClose: () => void;
  onUpdateOrder: (updates: { status: string; tracking_number?: string | null; admin_notes?: string | null }) => Promise<boolean>;
  onQuickUpdateStatus: (orderId: number, newStatus: string) => void;
  onResendNotification: (orderId: number) => void;
  onOpenRefundModal: (trigger: HTMLButtonElement) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  focusHeadingRef?: RefObject<HTMLHeadingElement | null>;
  canManageOrder?: boolean;
  canChangeStatus?: boolean;
  canRefund?: boolean;
  canNotify?: boolean;
  hasSavedRefund?: boolean;
  checkingRefund?: boolean;
  onCheckRefund: (operationId: string) => void;
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
  returnFocusRef,
  focusHeadingRef,
  hasSavedRefund,
  checkingRefund,
  onCheckRefund,
  storeEmail = 'sales@bgpacific.com',
  canManageOrder = true, canChangeStatus = true, canRefund = true, canNotify = true,
}: OrderDetailModalProps) {
  const headingId = useId();
  const ownHeadingRef = useRef<HTMLHeadingElement>(null);
  const headingRef = focusHeadingRef || ownHeadingRef;

  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState(order.status);
  const [editTracking, setEditTracking] = useState(order.tracking_number || '');
  const [editAdminNotes, setEditAdminNotes] = useState(order.admin_notes || '');

  const nextAction = getNextStatusAction(order);

  const handleEdit = () => {
    setEditStatus(order.status);
    setEditTracking(order.tracking_number || '');
    setEditAdminNotes(order.admin_notes || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    const saved = await onUpdateOrder({
      status: editStatus,
      ...(canManageOrder ? { tracking_number: editTracking || null, admin_notes: editAdminNotes || null } : {}),
    });
    if (saved) setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditStatus(order.status);
    setEditTracking(order.tracking_number || '');
    setEditAdminNotes(order.admin_notes || '');
  };

  return (
    <Dialog open labelledBy={headingId} initialFocusRef={headingRef} returnFocusRef={returnFocusRef}
      dismissible={!saving} onOpenChange={(open) => { if (!open && !saving) onClose(); }}
      className="admin-scope bg-white rounded-lg max-w-4xl w-full flex flex-col min-h-0 print:shadow-none print:max-h-none print:overflow-visible print-content"
    >
      {/* Print Styles */}
      <style>{`
        @media print {
          html, body { height: auto !important; overflow: visible !important; }
          body > *:not(dialog.print-content) { display: none !important; }
          dialog.print-content::backdrop { display: none !important; background: transparent !important; }
          body * { visibility: hidden; }
          aside, header, nav, [class*='sidebar'], [class*='Sidebar'] { display: none !important; }
          .md\\:pl-64, [class*='md:pl-64'] { padding-left: 0 !important; }
          .print-content, .print-content * { visibility: visible; }
          .print-content {
            position: static !important; inset: auto !important; display: block !important; width: 100%; padding: 0; margin: 0;
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


        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white z-10 print:static print:border-b-2 print:border-gray-400 shrink-0">
          <div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-gray-900">
              <span className="print:hidden">Order #</span>
              <span className="hidden print:inline text-3xl">THREE SQUARES - PACKING SLIP<br /></span>
              {order.order_number}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{formatDate(order.created_at)}</p>
            <PaymentEnvironmentBadge environment={order.payment_environment} inline />
            {order.system_cancellation?.actor === 'system' && order.system_cancellation.reason === 'catering_inquiry_required' && (
              <p role="status" className="mt-3 text-sm text-gray-700 print-hide">Closed by system: catering items now require an inquiry. No payment was started. No cancellation email or SMS was sent.</p>
            )}
            {order.inventory_restoration_status === 'manual_review_required' && <p role="status" className="mt-3 text-sm text-amber-800">Inventory restoration requires manual review. No stock was restored automatically.</p>}
          </div>
          <span className="print-hide"><IconButton onClick={() => { if (!saving) onClose(); }} disabled={saving} aria-label="Close order details"><X /></IconButton></span>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 overscroll-contain print:overflow-visible"
        >
          {/* Order Management */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 print-hide">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className="font-semibold text-gray-900">Order Management</h3>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {!isEditing && canChangeStatus && nextAction && (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => onQuickUpdateStatus(order.id, nextAction.status)}
                    variant="primary"
                  >
                    {nextAction.label}
                  </Button>
                )}
                {!isEditing && canChangeStatus && (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={handleEdit}
                    variant="secondary"
                  >
                    {canManageOrder ? 'Edit Details' : 'Change status'}
                  </Button>
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
                    {[order.status, ...order.next_status_options].map((status) => (
                      <option key={status} value={status}>{status === 'confirmed' && order.fulfillment_type === 'pickup' ? 'Acknowledged' : formatStatus(status)}</option>
                    ))}
                  </select>
                </div>

                {canManageOrder && order.fulfillment_type === 'shipping' && (
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
                )}

                {canManageOrder && <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes (Internal)</label>
                  <textarea
                    value={editAdminNotes}
                    onChange={(e) => setEditAdminNotes(e.target.value)}
                    placeholder="Add internal notes about this order..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent resize-none"
                  />
                </div>}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleSave}
                    loading={saving}
                    variant="primary" className="flex-1"
                  >
                    Save Changes
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
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
                {canManageOrder && order.fulfillment_type === 'shipping' && (
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
            <PaymentReceipt receipt={order.payment_receipt ?? null} orderReference={order.order_number} onPrint={() => window.print()} />
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
          {order.fulfillment_type === 'shipping' && order.shipping_address_line1 && (
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
                    {item.special_instructions && (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                        <span className="font-medium">Note:</span> {item.special_instructions}
                      </p>
                    )}
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
                          ['pending', 'unknown'].includes(refund.status) ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {refund.operation_status || refund.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(refund.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {refund.restoration_status === 'manual_review_required' && <p className="text-sm text-amber-800">Inventory restoration requires manual review.</p>}
                      {canRefund && refund.operation_uuid && !['succeeded', 'failed'].includes(refund.operation_status || refund.status) && <Button type="button" disabled={checkingRefund} variant="ghost" className="mt-2" onClick={() => onCheckRefund(refund.operation_uuid!)}>Check refund status</Button>}
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
            {canNotify && (order.status === 'ready' || order.status === 'shipped') && (
              <Button
                type="button"
                onClick={() => onResendNotification(order.id)}
                variant="secondary" className="w-full sm:w-auto"
              >
                Notify Customer
              </Button>
            )}
            <Button
              type="button"
              onClick={() => window.print()}
              variant="secondary" className="w-full sm:w-auto"
            >
              Print Packing Slip
            </Button>
            {canNotify && <Button
              type="button"
              icon={<Mail />} onClick={() => window.open(`mailto:${order.customer_email}`, '_blank')}
              variant="secondary" className="w-full sm:w-auto"
            >

              Email Customer
            </Button>}
            {canRefund && (order.payment_status === 'paid' || hasSavedRefund) && (
              <Button
                type="button"
                onClick={(event) => onOpenRefundModal(event.currentTarget)}
                variant="secondary" className="w-full sm:w-auto"
              >
                {hasSavedRefund ? 'Check saved refund' : 'Refund Order'}
              </Button>
            )}
          </div>
        </div>
    </Dialog>
  );
}
