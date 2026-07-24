import { MapPin, ChevronDown } from 'lucide-react';
import { useLocationStore } from '../store/locationStore';

/**
 * Compact location pill displayed in the navbar.
 * Clicking opens the location picker modal.
 */
export default function LocationPill() {
  const { selectedLocation, locations, setShowPicker } = useLocationStore();

  if (!selectedLocation || locations.length <= 1) return null;

  return (
    <button
      onClick={() => setShowPicker(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warm-100 border border-warm-200 text-sm font-medium text-warm-700 hover:bg-warm-200 hover:border-warm-300 transition cursor-pointer"
      aria-label={`Ordering from ${selectedLocation.name}. Click to change.`}
    >
      <MapPin className="w-3.5 h-3.5 text-tsPrimary flex-shrink-0" />
      <span className="truncate max-w-[100px] lg:max-w-[140px]">{selectedLocation.name}</span>
      <ChevronDown className="w-3 h-3 text-warm-400 flex-shrink-0" />
    </button>
  );
}
