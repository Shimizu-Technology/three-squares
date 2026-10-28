import type { ReactNode } from 'react';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

export default function AdminFilterBar({children, actions}: {children: ReactNode; actions?: ReactNode}) {
  return <section aria-label="Filters" className="rounded-xl border border-gray-100 bg-white p-4">
    <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-2 lg:grid-cols-4">{children}</div>
    {actions && <div className="mt-4 flex flex-wrap justify-end gap-x-2 gap-y-3">{actions}</div>}
  </section>;
}
interface FilterSelectProps {
  label: string; value: string; onChange: (value: string) => void;
  options: {value: string; label: string}[]; placeholder?: string;
}
export function FilterSelect({label, value, onChange, options, placeholder}: FilterSelectProps) {
  return <Field label={label}><Select value={value} onChange={event => onChange(event.target.value)}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </Select></Field>;
}
interface FilterSearchProps {
  label: string; value: string; onChange: (value: string) => void; onSubmit?: () => void; placeholder?: string;
}
export function FilterSearch({label, value, onChange, onSubmit, placeholder}: FilterSearchProps) {
  return <Field label={label}><Input type="search" value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => {
    if(event.key === 'Enter' && onSubmit) { event.preventDefault(); onSubmit(); }
  }} placeholder={placeholder} /></Field>;
}
export function FilterDate({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
  return <Field label={label}><Input type="date" value={value} onChange={event => onChange(event.target.value)} /></Field>;
}
