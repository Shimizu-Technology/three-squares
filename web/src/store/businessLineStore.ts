import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BusinessLine = 'three_squares' | 'latte_stone_cookies' | 'bgpacific';

export interface BusinessLineOption {
  value: BusinessLine | 'all';
  label: string;
  shortLabel: string;
  color: string;       // bg color for pill
  textColor: string;   // text color for pill
  activeColor: string; // active bg
}

export const BUSINESS_LINES: BusinessLineOption[] = [
  {
    value: 'all',
    label: 'All Business Lines',
    shortLabel: 'All',
    color: 'bg-gray-100',
    textColor: 'text-gray-700',
    activeColor: 'bg-gray-700',
  },
  {
    value: 'three_squares',
    label: 'Three Squares',
    shortLabel: 'Three Squares',
    color: 'bg-amber-50',
    textColor: 'text-amber-800',
    activeColor: 'bg-amber-600',
  },
  {
    value: 'latte_stone_cookies',
    label: 'Latte Stone Cookies',
    shortLabel: 'Cookies',
    color: 'bg-orange-50',
    textColor: 'text-orange-900',
    activeColor: 'bg-orange-800',
  },
  {
    value: 'bgpacific',
    label: 'B&G Pacific',
    shortLabel: 'B&G Pacific',
    color: 'bg-blue-50',
    textColor: 'text-blue-800',
    activeColor: 'bg-blue-700',
  },
];

export const getBusinessLineOption = (value: string): BusinessLineOption =>
  BUSINESS_LINES.find((bl) => bl.value === value) || BUSINESS_LINES[0];

interface BusinessLineState {
  selected: BusinessLine | 'all';
  setSelected: (line: BusinessLine | 'all') => void;
}

export const useBusinessLineStore = create<BusinessLineState>()(
  persist(
    (set) => ({
      selected: 'all',
      setSelected: (line) => set({ selected: line }),
    }),
    {
      name: 'ts-admin-business-line',
    }
  )
);
