import type { ComponentProps, ReactNode } from 'react';

/** Native single-choice select; retains platform picker and keyboard behavior. */
export function Select({ className = '', leading, ...props }: Omit<ComponentProps<'select'>, 'multiple' | 'size'> & { leading?: ReactNode }) {
  const select = <select {...props} className={`ui-select ${className}`.trim()} data-leading={leading ? '' : undefined} data-ui-control="select" />;
  return leading ? <span className="ui-field-control"><span className="ui-field-affix" aria-hidden="true">{leading}</span>{select}</span> : select;
}
