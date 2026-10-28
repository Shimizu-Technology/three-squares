import { Button } from './ui/Button';
import { ChevronDown, MapPin } from 'lucide-react';
import { useLocationStore } from '../store/locationStore';

/**
 * Ordering context bar shown beneath the primary header.
 * Keeps pickup selection visible without crowding the main nav row.
 */
export default function LocationContextBar() {
  const { selectedLocation, locations, setShowPicker } = useLocationStore();

  if (!selectedLocation || locations.length <= 1) {
    return null;
  }

  const location = locations.find((item) => item.id === selectedLocation.id) || selectedLocation;

  return (
    <div className="border-b border-warm-200 bg-white/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-xs text-warm-500">Pickup location</p>
            <p className="text-sm font-semibold text-warm-900">{location.name}</p>
            {location.accepting_orders_now === false && <p className="text-sm text-amber-800">Closed for pickup orders</p>}
            {location.address && <p className="hidden sm:block min-w-0 truncate text-sm text-warm-500">{location.address}</p>}
          </div>
          <Button variant="ghost" onClick={() => setShowPicker(true)} aria-label={`Pickup location is ${location.name}. Click to change.`}>
            <MapPin aria-hidden="true" className="w-4 h-4" /> Change <ChevronDown aria-hidden="true" className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
