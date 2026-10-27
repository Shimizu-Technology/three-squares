import type { HTMLAttributes } from 'react';
import type { StatusTone } from './StatusBadge';

export function Notice({ tone = 'info', children, className = '', ...props }:
  HTMLAttributes<HTMLDivElement> & { tone?: StatusTone }) {
  return <div {...props} className={`ui-notice ui-tone--${tone} ${className}`.trim()}>{children}</div>;
}
