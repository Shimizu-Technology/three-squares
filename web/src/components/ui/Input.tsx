import type { ComponentProps } from 'react';

type TextInputType = 'text' | 'search' | 'email' | 'tel' | 'url' | 'password' | 'number' | 'date' | 'datetime-local' | 'time';
export type InputProps = Omit<ComponentProps<'input'>, 'type'> & { type?: TextInputType };
/** Single-line fields. Checkboxes, switches and file pickers use their own semantics. */
export function Input({ className = '', type = 'text', ...props }: InputProps) {
  return <input {...props} type={type} className={`ui-input ${className}`.trim()} data-ui-control="input" />;
}
