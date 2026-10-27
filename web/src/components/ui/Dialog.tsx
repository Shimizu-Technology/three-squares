import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
  className?: string;
  /** Escape/backdrop may be blocked during a save or a required choice. */
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Defaults to the element focused immediately before opening. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Controlled native modal: top-layer stacking, inert background and focus containment. */
export default function Dialog({
  open, onOpenChange, labelledBy, describedBy, children, className = '',
  dismissible = true, initialFocusRef, returnFocusRef,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPointerDown = useRef(false);
  const lastFocus = useRef<Element | null>(null);
  const pointerOpener = useRef<HTMLElement | null>(null);
  useLockBodyScroll(open);

  useEffect(() => {
    if (open) return;
    // Async openers may temporarily disable themselves while loading, causing
    // the browser to move focus to body before the dialog opens.
    const rememberFocus = () => {
      if (document.activeElement !== document.body) {
        if (!pointerOpener.current || !document.activeElement?.contains(pointerOpener.current)) pointerOpener.current = null;
        lastFocus.current = document.activeElement;
      }
    };
    const rememberPointer = (event: PointerEvent) => {
      // Safari does not focus buttons on pointer activation.
      pointerOpener.current = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, a[href], input, select, textarea, [tabindex]') : null;
    };
    const rememberKey = () => { pointerOpener.current = null; rememberFocus(); };
    rememberFocus();
    document.addEventListener('focusin', rememberFocus);
    document.addEventListener('pointerdown', rememberPointer);
    document.addEventListener('keydown', rememberKey);
    return () => {
      document.removeEventListener('focusin', rememberFocus);
      document.removeEventListener('pointerdown', rememberPointer);
      document.removeEventListener('keydown', rememberKey);
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = returnFocusRef?.current || pointerOpener.current ||
      (document.activeElement === document.body ? lastFocus.current : document.activeElement);
    dialog.showModal();
    initialFocusRef?.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocusRef, returnFocusRef]);

  const outsidePanel = (event: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };

  return createPortal(
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`ts-dialog m-auto max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] border-0 bg-white p-0 text-warm-900 shadow-2xl ${className}`}
      data-lenis-prevent
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        event.stopPropagation();
        const panel = event.currentTarget;
        const controls = Array.from(panel.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
        )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') &&
          !element.closest('[inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        // A radio group is one Tab stop; arrow keys retain their native behavior.
        const stops = controls.filter((element) => {
          if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) return true;
          const group = controls.filter((other) => other instanceof HTMLInputElement &&
            other.type === 'radio' && other.name === element.name && other.form === element.form) as HTMLInputElement[];
          return element === (group.find((radio) => radio.checked) || group[0]);
        });
        event.preventDefault();
        const index = stops.indexOf(document.activeElement as HTMLElement);
        const next = index < 0 ? (event.shiftKey ? stops.length - 1 : 0)
          : (index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
        (stops[next] || panel).focus();
      }}
      onCancel={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (dismissible) onOpenChange(false);
      }}
      onClose={(event) => {
        event.stopPropagation();
        // Ignore a queued close event if React has already reopened the panel.
        if (open && !event.currentTarget.open) onOpenChange(false);
      }}
      onPointerDown={(event) => { backdropPointerDown.current = outsidePanel(event); }}
      onClick={(event) => {
        if (dismissible && backdropPointerDown.current && outsidePanel(event)) onOpenChange(false);
        backdropPointerDown.current = false;
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
