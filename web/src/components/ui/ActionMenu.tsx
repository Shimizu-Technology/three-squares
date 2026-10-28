import { useEffect, useRef, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

/** A native disclosure of commands; ordinary tab order, Escape and outside dismissal. */
export function ActionMenu({label, children}: {label: string; children: ReactNode}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const place = () => {
    const details = ref.current;
    if (!details?.open) return;
    const anchor = details.querySelector('summary')?.getBoundingClientRect();
    const panel = details.querySelector('.ui-action-menu__commands')?.getBoundingClientRect();
    if (anchor && panel) details.dataset.side = innerHeight - anchor.bottom < panel.height && anchor.top >= panel.height ? 'top' : 'bottom';
  };
  const close = (restoreFocus: boolean) => {
    if (!ref.current) return;
    ref.current.open = false;
    if (restoreFocus) ref.current.querySelector('summary')?.focus();
  };
  useEffect(() => {
    // Observe the native open change in a microtask before paint rather than
    // waiting for the queued toggle event or overriding native activation.
    const observer = new MutationObserver(place);
    if (ref.current) observer.observe(ref.current, { attributes: true, attributeFilter: ['open'] });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); };
  }, []);
  return <details ref={ref} className="ui-action-menu" onKeyDown={event => {
    if (event.key === 'Escape' && ref.current?.open) { event.preventDefault(); event.stopPropagation(); close(true); }
    // Safari can keep sequential focus on a summary after reopening it.
    // Enter the commands explicitly; subsequent Tab/Shift+Tab stays native.
    if (event.key === 'Tab' && !event.shiftKey && ref.current?.open && event.target === ref.current.querySelector('summary')) {
      const first = ref.current.querySelector<HTMLButtonElement>('.ui-action-menu__commands button:not(:disabled)');
      if (first) { event.preventDefault(); first.focus(); }
    }
  }}>
    <summary aria-label={label} data-ui-control="action-menu"><MoreVertical aria-hidden="true" /></summary>
    <div className="ui-action-menu__commands" onClickCapture={event => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) close(true);
    }}>{children}</div>
  </details>;
}
