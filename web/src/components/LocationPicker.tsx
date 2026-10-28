import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Clock, Phone, AlertTriangle, X } from 'lucide-react';
import { locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';
import type { LocationInfo } from '../store/locationStore';
import { useCartStore } from '../store/cartStore';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Location picker modal shown when no location is selected, or when
 * the user explicitly opens the picker via the nav pill.
 * Also handles the cart-clear confirmation when switching locations.
 */
export default function LocationPicker() {
  const { selectedLocation, locations, showPicker, setSelectedLocation, setLocations, setShowPicker, requestedLocation, requestLocation } = useLocationStore();
  const { clearCart, fetchCart } = useCartStore();
  const [switching, setSwitching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<LocationInfo | null>(null);
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const directMenu = pathname.startsWith('/menu/');
  const checkout = pathname === '/checkout';
  const selectionVersion = useRef(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const showModal = locations.length > 1 && ((!selectedLocation && !directMenu) || showPicker);

  useEffect(() => {
    selectionVersion.current += 1;
    setShowConfirm(false);
    setPendingLocation(null);
    setSwitching(false);
    setShowPicker(false);
    return () => { selectionVersion.current += 1; };
  }, [pathname, setShowPicker]);

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
              toast.error('Could not clear the cart for the unavailable pickup location. Please try again.');
              setShowPicker(true);
              return;
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

  useEffect(() => {
    if (!showModal && !showConfirm) return;
    const dialog = showConfirm ? confirmRef.current : pickerRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const buttons = () => Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    (buttons()[0] || dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (switching) return;
        if (showConfirm) {
          setShowConfirm(false);
          setPendingLocation(null);
        } else if (selectedLocation) {
          setShowPicker(false);
        }
      }
      if (event.key !== 'Tab') return;
      const focusable = buttons();
      if (focusable.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [showModal, showConfirm, selectedLocation, setShowPicker, switching]);

  const handleLocationSelect = useCallback(async (loc: LocationInfo) => {
    if (directMenu) {
      // The route checks the server cart before changing global selection.
      setShowPicker(false);
      navigate(`/menu/${encodeURIComponent(loc.slug)}`);
      return;
    }
    if (selectedLocation?.id === loc.id) {
      setShowPicker(false);
      return;
    }

    if (switching) return;
    const version = selectionVersion.current;
    const previousId = useLocationStore.getState().selectedLocation?.id;
    setSwitching(true);
    await fetchCart();
    if (selectionVersion.current !== version || useLocationStore.getState().selectedLocation?.id !== previousId) return;
    setSwitching(false);
    const state = useCartStore.getState();
    if (state.pricingError || !state.cart) {
      toast.error('Could not check your cart. Your pickup location has not changed. Please try again.');
      return;
    }
    const compatible = checkout && state.cart.items.every((item) => item.product.allow_pickup && item.product.available_location_ids?.includes(loc.id));
    if (compatible) { setSelectedLocation(loc); return; }
    if (state.cart.items.length > 0) {
      setPendingLocation(loc);
      setShowConfirm(true);
    } else {
      setSelectedLocation(loc);
    }
  }, [directMenu, navigate, selectedLocation?.id, switching, fetchCart, checkout, setShowPicker, setSelectedLocation]);

  useEffect(() => {
    if (!requestedLocation) return;
    requestLocation(null);
    void handleLocationSelect(requestedLocation);
  }, [requestedLocation, requestLocation, handleLocationSelect]);

  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Pacific/Guam' }).format(new Date());

  const confirmSwitch = async () => {
    const nextLocation = pendingLocation;
    if (!nextLocation || switching) return;
    if (directMenu) {
      setShowConfirm(false);
      setShowPicker(false);
      navigate(`/menu/${encodeURIComponent(nextLocation.slug)}`);
      setPendingLocation(null);
      return;
    }
    const version = selectionVersion.current;
    const previousLocationId = useLocationStore.getState().selectedLocation?.id;
    setSwitching(true);
    try {
      await clearCart();
      if (selectionVersion.current === version && useLocationStore.getState().selectedLocation?.id === previousLocationId) {
        setSelectedLocation(nextLocation);
      }
    } catch {
      if (selectionVersion.current === version) toast.error('Unable to clear cart. Please check your connection and try again.');
    } finally {
      if (selectionVersion.current === version) {
        setShowConfirm(false);
        setPendingLocation(null);
        setSwitching(false);
      }
    }
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
            ref={pickerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-picker-title"
            className="location-picker-panel bg-white w-full max-h-[90dvh] overflow-y-auto sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl animate-slide-up sm:animate-fade-in"
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
                  disabled={switching}
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
                  {loc.phone && loc.slug !== 'three-squares-donki' && (
                    <p className="text-sm text-warm-600 flex items-center gap-1.5 mb-1">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0 text-warm-400" />
                      {loc.phone}
                    </p>
                  )}
                  <p className="text-sm text-warm-600 flex items-start gap-1.5 mt-1"><Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />Today: {loc.hours_json?.[today] || 'Check current hours'}{loc.accepting_orders_now === false ? ' · Not taking pickup orders now' : ''}</p>
                  {loc.slug === 'three-squares-donki' && <p className="mt-1 text-sm text-warm-600">For help, contact the Main team or WhatsApp.</p>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cart clear confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div ref={confirmRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cart-clear-title" className="bg-white rounded-xl p-6 max-w-sm w-full max-h-[90dvh] overflow-y-auto shadow-xl">
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
                disabled={switching}
                autoFocus
                className="flex-1 px-4 py-2.5 border border-warm-300 rounded-lg text-warm-700 font-medium hover:bg-warm-50 transition"
              >
                Keep Current
              </button>
              <button
                onClick={confirmSwitch}
                disabled={switching}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                {switching ? 'Switching…' : 'Switch & Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
