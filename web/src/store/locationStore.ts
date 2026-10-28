import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LocationInfo {
  id: number;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  hours_json?: Record<string, string>;
  accepting_orders_now?: boolean;
}

interface LocationStore {
  // State
  selectedLocation: LocationInfo | null;
  locations: LocationInfo[];
  showPicker: boolean;
  requestedLocation: LocationInfo | null;

  // Actions
  setSelectedLocation: (location: LocationInfo | null) => void;
  setLocations: (locations: LocationInfo[]) => void;
  clearLocation: () => void;
  setShowPicker: (show: boolean) => void;
  /** Send a public shortcut through the picker's cart-check/confirmation policy. */
  requestLocation: (location: LocationInfo | null) => void;
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      selectedLocation: null,
      locations: [],
      showPicker: false,
      requestedLocation: null,

      setSelectedLocation: (location) => set({ selectedLocation: location, showPicker: false }),
      setLocations: (locations) => set({ locations }),
      clearLocation: () => set({ selectedLocation: null }),
      setShowPicker: (show) => set({ showPicker: show }),
      requestLocation: (location) => set({ requestedLocation: location }),
    }),
    {
      name: 'tsq-location',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ selectedLocation: state.selectedLocation }),
    }
  )
);
