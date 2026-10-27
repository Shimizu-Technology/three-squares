import { Button, type ButtonProps } from './Button';

type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type IconButtonProps = OmitEach<ButtonProps, 'children' | 'icon'> & {
  'aria-label': string;
  children: ButtonProps['children'];
};

/** A named square action. The label is required even when a tooltip is present. */
export function IconButton({ children, className = '', variant = 'ghost', ...props }: IconButtonProps) {
  return <Button {...props as ButtonProps} variant={variant} className={`ui-icon-button ${className}`.trim()}>
    <span className="ui-button__icon" aria-hidden="true">{children}</span>
  </Button>;
}
