import type { DetailsHTMLAttributes, ReactNode, Ref } from 'react';

type DisclosureProps = Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'title' | 'className' | 'style'> & {
  title: ReactNode;
  summaryLabel?: string;
  ref?: Ref<HTMLDetailsElement>;
};

/** Native disclosure; keep controlled open state and the DOM ref for validation recovery. */
export function Disclosure({title, summaryLabel, children, ...props}: DisclosureProps) {
  return <details {...props} className="ui-disclosure"><summary aria-label={summaryLabel} data-ui-control="disclosure">{title}</summary><div className="mt-4">{children}</div></details>;
}
