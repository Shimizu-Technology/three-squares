import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type NavigationLinkProps = {surface?: 'default' | 'dark'; context?: 'public' | 'admin'; brand?: boolean; compact?: boolean; record?: boolean} & (
  | (LinkProps & {href?: never})
  | (AnchorHTMLAttributes<HTMLAnchorElement> & {href: string; to?: never})
);

/** Native navigation; the admin context supplies wrapping workspace/record targets. */
export function NavigationLink({className = '', surface = 'default', context = 'public', brand = false, compact = false, record = false, ...props}: NavigationLinkProps) {
  const shared = {'data-ui-navigation':true, 'data-ui-control':context === 'admin' ? 'navigation' : undefined, 'data-context':context, 'data-brand':brand || undefined, 'data-compact':compact || undefined, 'data-record':record || undefined, className:`ui-navigation-link${surface === 'dark' ? ' ui-navigation-link--on-dark' : ''} ${className}`.trim()};
  if (props.href !== undefined) return <a {...props as AnchorHTMLAttributes<HTMLAnchorElement>} {...shared} />;
  return <Link {...props as LinkProps} {...shared} />;
}

/** A navigation disclosure changes visibility, so it uses a named native button. */
export function NavigationDisclosure({ expanded, onToggle, controlsId, children, surface = 'default' }: {
  expanded: boolean; onToggle(): void; controlsId: string; children: ReactNode; surface?: 'default' | 'dark';
}) {
  return <button type="button" className={`ui-navigation-disclosure${surface === 'dark' ? ' ui-navigation-link--on-dark' : ''}`}
    aria-expanded={expanded} aria-controls={controlsId} onClick={onToggle}>
    {children}
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d={expanded ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>;
}
