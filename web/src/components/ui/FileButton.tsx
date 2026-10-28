import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

type FileButtonProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style' | 'children'> & {
  children: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

/** Native file picker with a keyboard-focusable 44px action. */
export function FileButton({children, ...props}: FileButtonProps) {
  return <label className="ui-file-button" data-ui-control="file"><input {...props} type="file" className="ui-file-button__input" /><span>{children}</span></label>;
}
