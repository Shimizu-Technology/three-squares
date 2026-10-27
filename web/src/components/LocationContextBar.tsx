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
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="w-full py-3 flex items-center justify-between gap-4 text-left group"
          aria-label={`Pickup location is ${location.name}. Click to change.`}
        >
          <div className="min-w-0 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-warm-100 border border-warm-200 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-tsPrimary" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-warm-500">
                Pickup location
              </p>
              <p className="text-sm sm:text-base font-semibold text-warm-900 truncate">
                {location.name}
              </p>
              {location.accepting_orders_now === false && (
                <p className="text-sm text-amber-800">Closed for pickup orders</p>
              )}
              {location.address && (
                <p className="hidden sm:block text-sm text-warm-500 truncate">
                  {location.address}
                </p>
              )}
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-tsPrimary shrink-0 group-hover:text-primary-dark transition">
            Change
            <ChevronDown className="w-4 h-4" />
          </span>
        </button>
      </div>
    </div>
  );
}
