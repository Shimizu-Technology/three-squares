import { Button } from '../../ui/Button';
import { useId, useRef } from 'react';
import AdminModal from '../AdminModal';

interface ShipOrderModalProps {
  open: boolean;
  saving: boolean;
  carrier: string;
  trackingNumber: string;
  onCarrierChange: (carrier: string) => void;
  onTrackingChange: (tracking: string) => void;
  onShip: () => void;
  onClose: () => void;
}

export default function ShipOrderModal({
  open,
  saving,
  carrier,
  trackingNumber,
  onCarrierChange,
  onTrackingChange,
  onShip,
  onClose,
}: ShipOrderModalProps) {
  const carrierId = useId();
  const trackingId = useId();
  const carrierRef = useRef<HTMLSelectElement>(null);

  return (
    <AdminModal open={open} title="Ship Order" subtitle="Add tracking information and mark as shipped"
      maxWidth="max-w-md" onClose={onClose} dismissible={!saving} initialFocusRef={carrierRef}
      footer={(
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={onShip}
            loading={saving}
            variant="primary" className="flex-1"
          >
            Mark as Shipped
          </Button>
          <Button
            type="button"
            onClick={onClose}
            disabled={saving}
            variant="secondary"
          >
            Cancel
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
          <div>
            <label htmlFor={carrierId} className="block text-sm font-medium text-gray-700 mb-1">Shipping Carrier</label>
            <select
              id={carrierId}
              ref={carrierRef}
              disabled={saving}
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
            <label htmlFor={trackingId} className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
            <input
              id={trackingId}
              disabled={saving}
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
    </AdminModal>
  );
}
