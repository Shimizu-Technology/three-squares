import { useEffect } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';

/**
 * Persistent location picker shown at the top of the ordering experience.
 * Customers pick a location once and it filters the entire menu.
 */
export default function LocationPicker() {
  const { selectedLocation, locations, setSelectedLocation, setLocations } = useLocationStore();

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await locationsApi.getLocations();
        const locs = response.locations || [];
        setLocations(locs);

        // Auto-select first location if none selected
        if (!selectedLocation && locs.length > 0) {
          setSelectedLocation(locs[0]);
        }
      } catch {
        // Silently fail — locations will be empty
      }
    };
    fetchLocations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (locations.length <= 1) return null; // Don't show picker for single location

  return (
    <div className="bg-warm-100 border-b border-warm-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-center gap-2">
          <MapPin className="w-4 h-4 text-red-700 flex-shrink-0" />
          <span className="text-sm font-medium text-warm-700">Ordering from:</span>
          <div className="relative">
            <select
              value={selectedLocation?.id ?? ''}
              onChange={(e) => {
                const loc = locations.find((l) => l.id === Number(e.target.value));
                if (loc) setSelectedLocation(loc);
              }}
              className="appearance-none bg-white border border-warm-300 rounded-lg pl-3 pr-8 py-1.5 text-sm font-semibold text-warm-900 cursor-pointer hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-500 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
