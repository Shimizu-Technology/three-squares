import { useEffect, useState } from 'react';
import { MapPin, Clock, Phone, AlertTriangle, X } from 'lucide-react';
import { locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';
import type { LocationInfo } from '../store/locationStore';
import { useCartStore } from '../store/cartStore';
import toast from 'react-hot-toast';

/**
 * Location picker modal shown when no location is selected, or when
 * the user explicitly opens the picker via the nav pill.
 * Also handles the cart-clear confirmation when switching locations.
 */
export default function LocationPicker() {
  const { selectedLocation, locations, showPicker, setSelectedLocation, setLocations, setShowPicker } = useLocationStore();
  const { cart, clearCart } = useCartStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<LocationInfo | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await locationsApi.getLocations();
        const locs = response.locations || [];
        setLocations(locs);

        if (selectedLocation && locs.length > 0) {
          const stillExists = locs.some((l: LocationInfo) => l.id === selectedLocation.id);
          if (!stillExists) {
            try {
              await clearCart();
            } catch {
              // Cart-clear failed — clear selection anyway
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

  // Escape key dismisses modal (only when a location is already selected)
  useEffect(() => {
    if (!showPicker || !selectedLocation) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPicker(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPicker, selectedLocation, setShowPicker]);

  if (locations.length <= 1) return null;

  const cartHasItems = (cart?.items?.length ?? 0) > 0;
  const showModal = !selectedLocation || showPicker;

  const handleLocationSelect = (loc: LocationInfo) => {
    if (selectedLocation?.id === loc.id) {
      setShowPicker(false);
      return;
    }

    if (cartHasItems && selectedLocation) {
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

  return (
    <>
      {/* Location selection modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => { if (selectedLocation && e.target === e.currentTarget) setShowPicker(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-picker-title"
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-slide-up sm:animate-fade-in"
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 text-center relative">
              {selectedLocation && (
                <button
                  onClick={() => setShowPicker(false)}
                  className="absolute top-4 right-4 p-2 text-warm-400 hover:text-warm-600 transition rounded-lg"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-warm-100 mb-3">
                <MapPin className="w-6 h-6 text-tsPrimary" />
              </div>
              <h2 id="location-picker-title" className="text-xl font-bold text-warm-900">
                Choose Your Pickup Location
              </h2>
              <p className="text-warm-500 text-sm mt-1">Select a location to see the menu</p>
            </div>

            {/* Location cards */}
            <div className="px-6 pb-6 space-y-3">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => handleLocationSelect(loc)}
                  className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                    selectedLocation?.id === loc.id
                      ? 'border-tsPrimary bg-blue-50/50 shadow-sm'
                      : 'border-warm-200 bg-white hover:border-tsPrimary/50 hover:shadow-sm'
                  }`}
                >
                  <h3 className="font-semibold text-warm-900 mb-1.5">{loc.name}</h3>
                  {loc.address && (
                    <p className="text-sm text-warm-600 flex items-start gap-1.5 mb-1">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warm-400" />
                      {loc.address}
                    </p>
                  )}
                  {loc.phone && (
                    <p className="text-sm text-warm-600 flex items-center gap-1.5 mb-1">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0 text-warm-400" />
                      {loc.phone}
                    </p>
                  )}
                  {loc.hours_json && Object.keys(loc.hours_json).length > 0 && (
                    <div className="text-sm text-warm-500 flex items-start gap-1.5 mt-1">
                      <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warm-400" />
                      <div className="text-xs leading-relaxed">
                        {Object.entries(loc.hours_json).map(([day, hours]) => (
                          <span key={day} className="mr-3">
                            <span className="font-medium">{day}:</span> {hours}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cart clear confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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
