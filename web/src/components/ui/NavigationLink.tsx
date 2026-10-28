import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type NavigationLinkProps = (LinkProps | (AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; to?: never })) & { surface?: 'default' | 'dark' };

/** Navigation retains anchor semantics, with a real 44px target on every input. */
export function NavigationLink({ surface = 'default', ...props }: NavigationLinkProps) {
  const className = `ui-navigation-link${surface === 'dark' ? ' ui-navigation-link--on-dark' : ''} ${props.className || ''}`.trim();
  if (props.to !== undefined) return <Link {...props as LinkProps} className={className} data-ui-navigation />;
  return <a {...props as AnchorHTMLAttributes<HTMLAnchorElement>} className={className} data-ui-navigation />;
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
