import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';
import type { LocationInfo } from '../store/locationStore';

interface UseLocationFromUrlResult {
  /** True while resolving the slug from the URL */
  resolving: boolean;
  /** Set when the slug doesn't match any active location */
  notFound: boolean;
  /** The slug from the URL (null if not present) */
  locationSlug: string | null;
  /** Clear the URL-driven location and show the picker */
  clearUrlLocation: () => void;
}

/**
 * Reads `?location=<slug>` from the URL, resolves it to a location,
 * and auto-selects it in the locationStore. If the slug is invalid,
 * sets notFound=true.
 */
export function useLocationFromUrl(): UseLocationFromUrlResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const locationSlug = searchParams.get('location') || null;
  const [resolving, setResolving] = useState(!!locationSlug);
  const [notFound, setNotFound] = useState(false);
  const { setSelectedLocation, locations, setLocations } = useLocationStore();
  const resolvedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (!locationSlug) {
      setResolving(false);
      setNotFound(false);
      resolvedSlugRef.current = null;
      return;
    }

    // Don't re-resolve the same slug
    if (resolvedSlugRef.current === locationSlug) {
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      setResolving(true);
      setNotFound(false);

      try {
        // First try to find in already-loaded locations
        let loc = locations.find((l) => l.slug === locationSlug);

        if (!loc) {
          // Fetch from API
          try {
            const fetched = await locationsApi.getLocationBySlug(locationSlug);
            loc = fetched as LocationInfo;
          } catch {
            // 404 or network error
          }
        }

        if (cancelled) return;

        if (loc) {
          resolvedSlugRef.current = locationSlug;
          setSelectedLocation(loc);
          setNotFound(false);

          // Also ensure locations list is populated
          if (locations.length === 0) {
            try {
              const resp = await locationsApi.getLocations();
              if (!cancelled) setLocations(resp.locations || []);
            } catch {
              // Silently fail
            }
          }
        } else {
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [locationSlug, locations, setSelectedLocation, setLocations]);

  const clearUrlLocation = async () => {
    // Import cartStore dynamically to avoid circular deps
    const { useCartStore } = await import('../store/cartStore');
    const cartStore = useCartStore.getState();
    const hasItems = (cartStore.items?.length ?? 0) > 0;

    if (hasItems) {
      const confirmed = window.confirm(
        'Changing locations will clear your cart. Continue?'
      );
      if (!confirmed) return;
      await cartStore.clearCart();
    }

    resolvedSlugRef.current = null;
    const params = new URLSearchParams(searchParams);
    params.delete('location');
    setSearchParams(params, { replace: true });
    // Clear the selected location so the picker shows
    useLocationStore.getState().clearLocation();
  };

  return { resolving, notFound, locationSlug, clearUrlLocation };
}
