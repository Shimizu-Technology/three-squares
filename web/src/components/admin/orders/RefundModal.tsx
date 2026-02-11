import { useRef, useState } from 'react';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import type { Order } from './orderUtils';
import { formatCurrency } from './orderUtils';

interface RefundModalProps {
  order: Order;
  processing: boolean;
  onProcess: (amountCents: number, reason: string) => void;
  onClose: () => void;
}

export default function RefundModal({ order, processing, onProcess, onClose }: RefundModalProps) {
  useLockBodyScroll(true);

  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  const maxRefundable = order.total_cents - (order.total_refunded_cents || 0);

  const handleProcess = () => {
    const amountCents =
      refundType === 'full'
        ? maxRefundable
        : Math.round(parseFloat(refundAmount) * 100);
    onProcess(amountCents, refundReason);
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 backdrop-blur-md bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Refund Order</h2>
          <p className="text-sm text-gray-500 mt-1">
            Order {order.order_number} &mdash; {formatCurrency(order.total_cents)}
          </p>
        </div>

        <div
          ref={modalContentRef}
          className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
          onWheel={(event) => {
            if (modalContentRef.current) {
              modalContentRef.current.scrollTop += event.deltaY;
            }
            event.stopPropagation();
            event.preventDefault();
          }}
        >
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

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800 font-medium">This action cannot be undone.</p>
            <p className="text-xs text-yellow-700 mt-1">
              The refund will be processed through Stripe immediately.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={handleProcess}
            disabled={
              processing ||
              (refundType === 'partial' && (!refundAmount || parseFloat(refundAmount) <= 0))
            }
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-primary-dark transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing...' : 'Process Refund'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
