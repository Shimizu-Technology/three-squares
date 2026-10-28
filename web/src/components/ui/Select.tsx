import type { ComponentProps } from 'react';

/** Native single-choice select; retains platform picker and keyboard behavior. */
export function Select({ className = '', ...props }: Omit<ComponentProps<'select'>, 'multiple' | 'size'>) {
  return <select {...props} className={`ui-select ${className}`.trim()} data-ui-control="select" />;
}
