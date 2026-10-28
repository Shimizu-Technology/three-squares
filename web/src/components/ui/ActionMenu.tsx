import { useEffect, useRef, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

/** A native disclosure of commands; ordinary tab order, Escape and outside dismissal. */
export function ActionMenu({label, children}: {label: string; children: ReactNode}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = (restoreFocus: boolean) => {
    if (!ref.current) return;
    ref.current.open = false;
    if (restoreFocus) ref.current.querySelector('summary')?.focus();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return <details ref={ref} className="ui-action-menu" onKeyDown={event => {
    if (event.key === 'Escape' && ref.current?.open) { event.preventDefault(); event.stopPropagation(); close(true); }
  }}>
    <summary aria-label={label} data-ui-control="action-menu"><MoreVertical aria-hidden="true" /></summary>
    <div className="ui-action-menu__commands" onClickCapture={event => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) close(true);
    }}>{children}</div>
  </details>;
}
