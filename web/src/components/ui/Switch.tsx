import type { ButtonHTMLAttributes } from 'react';

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'style' | 'role'> & {
  'aria-label': string;
  'aria-checked': boolean;
};

/** Binary setting; the caller owns immediate or explicit saving. */
export function Switch(props: SwitchProps) {
  return <button {...props} type="button" role="switch" className="ui-switch" data-ui-control="switch"><span aria-hidden="true" /></button>;
}
