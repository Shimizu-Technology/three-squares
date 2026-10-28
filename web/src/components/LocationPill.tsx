import { Button } from './ui/Button';
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
    <Button
      onClick={() => setShowPicker(true)}
      className="shrink-0"
      aria-label={`Ordering from ${selectedLocation.name}. Click to change.`} variant="secondary"
    >
      <MapPin className="w-3.5 h-3.5 text-tsPrimary flex-shrink-0" />
      <span className="hidden sm:block truncate max-w-[100px] lg:max-w-[140px]">{selectedLocation.name}</span>
      <ChevronDown className="hidden sm:block w-3 h-3 text-warm-400 flex-shrink-0" />
    </Button>
  );
}
