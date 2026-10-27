import PaymentEnvironmentBadge from '../../payment/PaymentEnvironmentBadge';
import { useId, useRef, useState, type RefObject } from 'react';
import type { SavedRefundRequest } from '../../../lib/refundRequest';
import Dialog from '../../ui/Dialog';
import type { Order } from './orderUtils';
import { formatCurrency } from './orderUtils';

interface RefundModalProps {
  order: Order;
  processing: boolean;
  onProcess: (amountCents: number, reason: string, restockItems: boolean) => void;
  savedRequest: SavedRefundRequest | null;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function RefundModal({ order, processing, savedRequest, onProcess, onClose, returnFocusRef }: RefundModalProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [restockItems, setRestockItems] = useState(false);

  const maxRefundable = order.refundable_amount_cents ?? order.total_cents - (order.total_refunded_cents || 0);

  const handleProcess = () => {
    const amountCents =
      refundType === 'full'
        ? maxRefundable
        : Math.round(parseFloat(refundAmount) * 100);
    onProcess(savedRequest?.payload.amount_cents ?? amountCents, savedRequest?.payload.reason ?? refundReason, savedRequest?.payload.restock_items ?? restockItems);
  };

  return (
    <Dialog open labelledBy={headingId} initialFocusRef={headingRef} returnFocusRef={returnFocusRef}
      dismissible={!processing} onOpenChange={(open) => { if (!open && !processing) onClose(); }}
      className="admin-scope bg-white rounded-lg max-w-md w-full flex flex-col min-h-0"
    >
        <div className="p-6 border-b border-gray-200 shrink-0">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-bold text-gray-900">Refund Order</h2>
          <PaymentEnvironmentBadge environment={order.payment_environment} />
          <p className="text-sm text-gray-500 mt-1">
            Order {order.order_number} &mdash; {formatCurrency(order.total_cents)}
          </p>
        </div>

        <div
          role="region"
          aria-label="Refund details"
          className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
        >
          {savedRequest && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            A refund of {formatCurrency(savedRequest.payload.amount_cents)} is saved. Check its status before starting another refund. Pending and unknown amounts remain reserved.
            <p className="mt-2">Stock decision: {savedRequest.payload.restock_items ? 'Restock remaining purchased units after confirmation' : 'Do not restock'}.</p>
            {savedRequest.payload.reason && <p className="mt-1">Reason: {savedRequest.payload.reason}</p>}
          </div>}
          {!savedRequest && <fieldset disabled={processing} className="space-y-4">
          {/* Refund Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Refund Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refundType"
                  value="full"
                  checked={refundType === 'full'}
                  onChange={() => setRefundType('full')}
                  className="text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium">Full Refund</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refundType"
                  value="partial"
                  checked={refundType === 'partial'}
                  onChange={() => setRefundType('partial')}
                  className="text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium">Partial Refund</span>
              </label>
            </div>
          </div>

          {/* Refund Amount */}
          {refundType === 'full' ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-gray-600">Refund amount:</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(maxRefundable)}</p>
              {(order.total_refunded_cents || 0) > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Previously refunded: {formatCurrency(order.total_refunded_cents || 0)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Refund Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={(maxRefundable / 100).toFixed(2)}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Max refundable: {formatCurrency(maxRefundable)}
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Enter reason for refund..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={restockItems} onChange={event => setRestockItems(event.target.checked)} className="mt-1" />
            <span>Restock all remaining units from this order after the refund is confirmed.<span className="mt-1 block text-xs text-gray-600">Select only for returned or cancelled items. Previously restored units will not be added again.</span></span>
          </label>
          </fieldset>}
          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800 font-medium">This action cannot be undone.</p>
            <p className="text-xs text-yellow-700 mt-1">
              The refund uses the original payment account. A pending result is checked before another request can use those funds.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={handleProcess}
            disabled={
              processing ||
              (!savedRequest && (maxRefundable <= 0 || (refundType === 'partial' && (!refundAmount || parseFloat(refundAmount) <= 0 || Math.round(parseFloat(refundAmount) * 100) > maxRefundable))))
            }
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-primary-dark transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Checking...' : savedRequest ? 'Check saved refund' : 'Process Refund'}
          </button>
          <button
            type="button"
            onClick={() => { if (!processing) onClose(); }}
            disabled={processing}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
          >
            Close
          </button>
        </div>
    </Dialog>
  );
}
