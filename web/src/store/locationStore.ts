import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LocationInfo {
  id: number;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
}

interface LocationStore {
  // State
  selectedLocation: LocationInfo | null;
  locations: LocationInfo[];

  // Actions
  setSelectedLocation: (location: LocationInfo | null) => void;
  setLocations: (locations: LocationInfo[]) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      selectedLocation: null,
      locations: [],

      setSelectedLocation: (location) => set({ selectedLocation: location }),
      setLocations: (locations) => set({ locations }),
      clearLocation: () => set({ selectedLocation: null }),
    }),
    {
      name: 'tsq-location',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ selectedLocation: state.selectedLocation }),
    }
  )
);
