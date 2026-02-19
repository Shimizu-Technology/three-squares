import { MapPin, X } from 'lucide-react';
import { useLocationStore } from '../store/locationStore';

interface LocationBannerProps {
  onClearLocation: () => void;
}

/**
 * Shows a banner when viewing a location-specific menu via URL parameter.
 * "📍 Viewing menu for [Location Name]" with option to view all locations.
 */
export default function LocationBanner({ onClearLocation }: LocationBannerProps) {
  const { selectedLocation } = useLocationStore();

  if (!selectedLocation) return null;

  return (
    <div className="bg-red-50 border-b border-red-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-red-700 flex-shrink-0" />
          <span className="text-red-900 font-medium">
            Viewing menu for <strong>{selectedLocation.name}</strong>
          </span>
          <button
            onClick={onClearLocation}
            className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full hover:bg-red-200 transition"
          >
            Change
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
