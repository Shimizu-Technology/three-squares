import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LocationInfo {
  id: number;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  hours_json?: Record<string, string>;
}

interface LocationStore {
  // State
  selectedLocation: LocationInfo | null;
  locations: LocationInfo[];
  showPicker: boolean;

  // Actions
  setSelectedLocation: (location: LocationInfo | null) => void;
  setLocations: (locations: LocationInfo[]) => void;
  clearLocation: () => void;
  setShowPicker: (show: boolean) => void;
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      selectedLocation: null,
      locations: [],
      showPicker: false,

      setSelectedLocation: (location) => set({ selectedLocation: location, showPicker: false }),
      setLocations: (locations) => set({ locations }),
      clearLocation: () => set({ selectedLocation: null }),
      setShowPicker: (show) => set({ showPicker: show }),
    }),
    {
      name: 'tsq-location',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ selectedLocation: state.selectedLocation }),
    }
  )
);
