import type { InputHTMLAttributes, ReactNode } from 'react';

type CheckFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style' | 'children'> & {
  type?: 'checkbox' | 'radio';
  children: ReactNode;
};

/** Native choice inside a full-width label with a 44px minimum hit region. */
export function CheckField({type = 'checkbox', children, ...props}: CheckFieldProps) {
  return <label className="ui-check-field" data-ui-control="check"><input {...props} type={type} /><span>{children}</span></label>;
}
