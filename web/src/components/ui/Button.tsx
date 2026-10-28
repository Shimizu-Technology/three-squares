import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Contrast treatment for controls placed on a dark brand surface. */
  surface?: 'default' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  /** Layout only (width, margin, alignment). Recipes belong to the primitive. */
  className?: string;
};
type OwnProps = keyof CommonProps;
export type ButtonProps = CommonProps & (
  | ({ to: LinkProps['to']; href?: never } & Omit<LinkProps, OwnProps | 'href'> & { ref?: Ref<HTMLAnchorElement> })
  | ({ href: string; to?: never } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, OwnProps> & { ref?: Ref<HTMLAnchorElement> })
  | ({ href?: never; to?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, OwnProps> & { ref?: Ref<HTMLButtonElement> })
);

// Inert anchors must not forward action handlers, including capture variants.
// Keep focus/blur and hover handlers available for explanatory tooltips.
function withoutActivationHandlers<Props extends object>(props: Props): Props {
  const filtered = { ...props };
  for (const key of Object.keys(filtered)) {
    if (/^on(?:Click|AuxClick|DoubleClick|Key(?:Down|Up|Press)|Mouse(?:Down|Up)|Pointer(?:Down|Up|Cancel)|Touch(?:Start|End|Cancel)|ContextMenu)(?:Capture)?$/.test(key)) delete filtered[key as keyof Props];
  }
  return filtered;
}

/** Shared geometry and semantics for actions; specialized widgets have their own primitives. */
export function Button({ variant = 'primary', size = 'md', surface = 'default', loading = false, disabled = false,
  icon, children, className = '', ...props }: ButtonProps) {
  const blocked = disabled || loading;
  const shared = {
    className: `ui-button ui-button--${variant} ui-button--${size}${surface === 'dark' ? ' ui-button--on-dark' : ''} ${className}`.trim(),
    'data-ui-control': 'button',
    'data-loading': loading || undefined,
    'aria-busy': loading || undefined,
    'aria-disabled': blocked || undefined,
  } as const;
  const content = <>
    <span className="ui-button__content">
      {icon && <span className="ui-button__icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
    {loading && <span className="ui-button__spinner" aria-hidden="true" />}
  </>;

  if (props.to !== undefined) {
    const { to, ...linkProps } = props as LinkProps;
    if (blocked) {
      // Router options are not DOM attributes on the inert anchor.
      const anchorProps = withoutActivationHandlers(linkProps);
      for (const key of ['replace', 'state', 'relative', 'reloadDocument', 'preventScrollReset', 'viewTransition', 'discover', 'prefetch'] as const) delete anchorProps[key];
      return <a {...anchorProps} {...shared} role="link" tabIndex={-1}
        onClickCapture={undefined} onClick={event => event.preventDefault()}>{content}</a>;
    }
    return <Link {...linkProps} {...shared} to={to}>{content}</Link>;
  }
  if (props.href !== undefined) {
    const { href, ...linkProps } = props as AnchorHTMLAttributes<HTMLAnchorElement>;
    const anchorProps = blocked ? withoutActivationHandlers(linkProps) : linkProps;
    return <a {...anchorProps} {...shared} href={blocked ? undefined : href}
      role={blocked ? 'link' : anchorProps.role} tabIndex={blocked ? -1 : anchorProps.tabIndex}
      onClickCapture={blocked ? undefined : anchorProps.onClickCapture}
      onClick={blocked ? event => event.preventDefault() : anchorProps.onClick}>{content}</a>;
  }
  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button {...buttonProps} {...shared} type={buttonProps.type ?? 'button'} disabled={blocked}>{content}</button>;
}
