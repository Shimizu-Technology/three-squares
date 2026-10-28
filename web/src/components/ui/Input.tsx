import type { ComponentProps, ReactNode } from 'react';

type TextInputType = 'text' | 'search' | 'email' | 'tel' | 'url' | 'password' | 'number' | 'date' | 'datetime-local' | 'time';
export type InputProps = Omit<ComponentProps<'input'>, 'type'> & { type?: TextInputType; leading?: ReactNode };
/** Single-line fields. Checkboxes, switches and file pickers use their own semantics. */
export function Input({ className = '', type = 'text', leading, ...props }: InputProps) {
  const input = <input {...props} type={type} className={`ui-input ${className}`.trim()} data-leading={leading ? '' : undefined} data-ui-control="input" />;
  return leading ? <span className="ui-field-control"><span className="ui-field-affix" aria-hidden="true">{leading}</span>{input}</span> : input;
}
