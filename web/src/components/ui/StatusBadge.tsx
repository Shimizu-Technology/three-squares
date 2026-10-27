import type { HTMLAttributes, ReactNode } from 'react';

export type StatusTone = 'attention' | 'info' | 'success' | 'neutral' | 'danger' | 'inactive';
export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; icon?: ReactNode };

export function StatusBadge({ tone = 'neutral', icon, children, className = '', ...props }: StatusBadgeProps) {
  return <span {...props} className={`ui-status-badge ui-tone--${tone} ${className}`.trim()}>
    {icon && <span className="ui-status-badge__icon" aria-hidden="true">{icon}</span>}{children}
  </span>;
}
