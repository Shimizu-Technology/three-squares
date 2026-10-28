import { Link, type LinkProps } from 'react-router-dom';
import type { AnchorHTMLAttributes } from 'react';

type NavigationLinkProps = {brand?: boolean; compact?: boolean; record?: boolean} & (
  | (LinkProps & {href?: never})
  | (AnchorHTMLAttributes<HTMLAnchorElement> & {href: string; to?: never})
);

/** A wrapping 44px navigation/record link; aria-current owns the selected state. */
export function NavigationLink({className = '', brand = false, compact = false, record = false, ...props}: NavigationLinkProps) {
  const shared = {'data-ui-control':'navigation', 'data-brand':brand || undefined, 'data-compact':compact || undefined, 'data-record':record || undefined, className:`ui-navigation-link ${className}`.trim()};
  if (props.href !== undefined) return <a {...props as AnchorHTMLAttributes<HTMLAnchorElement>} {...shared} />;
  return <Link {...props as LinkProps} {...shared} />;
}
