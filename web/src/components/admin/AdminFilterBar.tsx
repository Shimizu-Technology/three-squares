import type { ReactNode } from 'react';

interface AdminFilterBarProps {
  children: ReactNode;
  /** Optional right-aligned slot (e.g. Clear Filters button) */
  actions?: ReactNode;
}

/**
 * Consistent filter bar wrapper for admin list pages.
 * Place filter inputs as children; they’ll be laid out in a responsive grid.
 */
export default function AdminFilterBar({ children, actions }: AdminFilterBarProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {children}
      </div>
      {actions && (
        <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
          {actions}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Companion filter input components for consistent styling            */
/* ------------------------------------------------------------------ */

interface FilterSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function FilterSelect({ label, value, onChange, options, placeholder }: FilterSelectProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface FilterSearchProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

export function FilterSearch({ label, value, onChange, onSubmit, placeholder }: FilterSearchProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
          placeholder={placeholder}
          className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition text-sm"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
    </div>
  );
}

interface FilterDateProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}

export function FilterDate({ label, value, onChange }: FilterDateProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
      />
    </div>
  );
}
