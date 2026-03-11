import { useEffect, useState } from 'react';
import { MapPin, ChevronDown, Clock, Phone, AlertTriangle } from 'lucide-react';
import { locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';
import type { LocationInfo } from '../store/locationStore';
import { useCartStore } from '../store/cartStore';
import toast from 'react-hot-toast';

/**
 * Persistent location picker shown at the top of the ordering experience.
 * If no location is selected, shows a full overlay picker.
 * If a location is already selected, shows a compact bar with change option.
 */
export default function LocationPicker() {
  const { selectedLocation, locations, setSelectedLocation, setLocations } = useLocationStore();
  const { cart, clearCart } = useCartStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<LocationInfo | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await locationsApi.getLocations();
        const locs = response.locations || [];
        setLocations(locs);

        // Validate stored selectedLocation still exists in the API response.
        // If a location was deactivated, clear the stale selection so the
        // compact bar doesn't show a location that no longer exists.
        if (selectedLocation && locs.length > 0) {
          const stillExists = locs.some((l: LocationInfo) => l.id === selectedLocation.id);
          if (!stillExists) {
            // Stale location was deactivated — clear selection so the picker
            // re-presents and the user explicitly chooses a valid location.
            // Always clear selection even if clearCart fails (network error) —
            // a stale deactivated location would show 0 products and break
            // product/collection pages that filter by location ID.
            try {
              await clearCart();
            } catch {
              // Cart-clear failed (network error). Clear selection anyway —
              // orphaned cart items are harmless, but a deactivated location
              // in localStorage would break the whole ordering experience.
            }
            setSelectedLocation(null);
          }
        }
      } catch {
        // Silently fail
      }
    };
    fetchLocations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (locations.length <= 1) return null;

  const cartHasItems = (cart?.items?.length ?? 0) > 0;

  const handleLocationChange = (loc: LocationInfo) => {
    if (selectedLocation?.id === loc.id) return;

    if (cartHasItems) {
      setPendingLocation(loc);
      setShowConfirm(true);
    } else {
      setSelectedLocation(loc);
    }
  };

  const confirmSwitch = async () => {
    if (pendingLocation) {
      try {
        await clearCart();
        setSelectedLocation(pendingLocation);
      } catch {
        // Network error clearing cart — don't switch location, cart stays
        // intact at the current location. Notify user so they know why
        // the location didn't change.
        toast.error('Unable to clear cart. Please check your connection and try again.');
      }
    }
    setShowConfirm(false);
    setPendingLocation(null);
  };

  const cancelSwitch = () => {
    setShowConfirm(false);
    setPendingLocation(null);
  };

  // Full-page location picker when no location selected
  if (!selectedLocation) {
    return (
      <div className="bg-white border-b border-warm-200">
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <MapPin className="w-10 h-10 text-red-700 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-warm-900 mb-2">Choose Your Location</h2>
          <p className="text-warm-600 mb-8">Select a pickup location to see the menu</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc)}
                className="bg-white border-2 border-warm-200 rounded-xl p-6 text-left hover:border-red-500 hover:shadow-md transition-all group"
              >
                <h3 className="text-lg font-semibold text-warm-900 group-hover:text-red-700 mb-2">{loc.name}</h3>
                {loc.address && (
                  <p className="text-sm text-warm-600 flex items-start gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warm-400" />
                    {loc.address}
                  </p>
                )}
                {loc.phone && (
                  <p className="text-sm text-warm-600 flex items-center gap-1.5 mb-2">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0 text-warm-400" />
                    {loc.phone}
                  </p>
                )}
                {loc.hours_json && Object.keys(loc.hours_json).length > 0 && (
                  <div className="text-sm text-warm-500 flex items-start gap-1.5">
                    <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warm-400" />
                    <div>
                      {Object.entries(loc.hours_json).map(([day, hours]) => (
                        <div key={day}><span className="font-medium">{day}:</span> {hours}</div>
                      ))}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Compact location bar */}
      <div className="bg-warm-100 border-b border-warm-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center justify-center gap-2">
            <MapPin className="w-4 h-4 text-red-700 flex-shrink-0" />
            <span className="text-sm font-medium text-warm-700">Ordering from:</span>
            <div className="relative">
              <select
                value={selectedLocation.id}
                onChange={(e) => {
                  const loc = locations.find((l) => l.id === Number(e.target.value));
                  if (loc) handleLocationChange(loc);
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

      {/* Cart clear confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="cart-clear-title" className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <h3 id="cart-clear-title" className="text-lg font-semibold text-warm-900">Change Location?</h3>
            </div>
            <p className="text-warm-600 mb-6">
              Switching to <strong>{pendingLocation?.name}</strong> will clear your cart.
              Items may not be available at the new location.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelSwitch}
                autoFocus
                className="flex-1 px-4 py-2.5 border border-warm-300 rounded-lg text-warm-700 font-medium hover:bg-warm-50 transition"
              >
                Keep Current
              </button>
              <button
                onClick={confirmSwitch}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                Switch & Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
