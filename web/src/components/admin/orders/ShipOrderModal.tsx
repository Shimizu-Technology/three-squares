import { useRef } from 'react';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';

interface ShipOrderModalProps {
  saving: boolean;
  carrier: string;
  trackingNumber: string;
  onCarrierChange: (carrier: string) => void;
  onTrackingChange: (tracking: string) => void;
  onShip: () => void;
  onClose: () => void;
}

export default function ShipOrderModal({
  saving,
  carrier,
  trackingNumber,
  onCarrierChange,
  onTrackingChange,
  onShip,
  onClose,
}: ShipOrderModalProps) {
  useLockBodyScroll(true);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Ship Order</h2>
          <p className="text-sm text-gray-500 mt-1">
            Add tracking information and mark as shipped
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Carrier</label>
            <select
              value={carrier}
              onChange={(e) => onCarrierChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            >
              <option value="">Select carrier...</option>
              <option value="USPS">USPS</option>
              <option value="UPS">UPS</option>
              <option value="FedEx">FedEx</option>
              <option value="DHL">DHL</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => onTrackingChange(e.target.value)}
              placeholder="Enter tracking number..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            />
          </div>

          <p className="text-sm text-gray-500">
            The customer will receive an email notification with the tracking information.
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onShip}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Shipping...' : 'Mark as Shipped'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
