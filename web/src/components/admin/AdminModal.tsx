import { useId } from 'react';
import type { ReactNode, RefObject } from 'react';
import { DialogHeader } from '../ui/DialogHeader';
import { DialogActions } from '../ui/DialogActions';
import Dialog from '../ui/Dialog';

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Max width — defaults to 'max-w-2xl' */
  maxWidth?: string;
  /** Optional footer with action buttons */
  footer?: ReactNode;
  /** Enable print-friendly styling */
  printable?: boolean;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export default function AdminModal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-2xl',
  footer,
  printable = false,
  dismissible = true,
  initialFocusRef,
  returnFocusRef,
  children,
}: AdminModalProps) {
  const titleId = useId();
  const subtitleId = useId();
  const requestClose = () => { if (dismissible) onClose(); };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}
      labelledBy={titleId}
      describedBy={subtitle ? subtitleId : undefined}
      dismissible={dismissible}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      className={`admin-scope rounded-xl ${maxWidth} w-full flex flex-col min-h-0 ${
        printable ? 'print:shadow-none print:max-h-none print:overflow-visible print-content' : ''
      }`}
    >
      {printable && open && (
        <style>{`
          @media print {
            body * { visibility: hidden; }
            aside, header, nav,
            [class*='sidebar'], [class*='Sidebar'] { display: none !important; }
            .md\\:pl-64, [class*='md:pl-64'] { padding-left: 0 !important; }
            .print-content, .print-content * { visibility: visible; }
            .print-content {
              position: absolute; left: 0; top: 0; width: 100%;
              padding: 0; margin: 0; max-width: 100% !important;
              max-height: none !important; overflow: visible !important;
              box-shadow: none !important; border-radius: 0 !important;
              background: white !important;
              -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
            .print-hide { display: none !important; }
            .print-content button { display: none !important; }
            .print-content a { text-decoration: none; color: inherit; }
            @page { margin: 0.5in; size: auto; }
          }
        `}</style>
      )}
      <DialogHeader titleId={titleId} title={title} subtitle={subtitle} subtitleId={subtitleId}
        onClose={requestClose} closeLabel={`Close ${title}`} disabled={!dismissible} />

      {/* Body */}
      <div
        className={`flex-auto min-h-0 overflow-y-auto p-4 sm:p-6 overscroll-contain ${
          printable ? 'print:overflow-visible' : ''
        }`}
      >
        {children}
      </div>

      {/* Footer */}
      {footer && <DialogActions>{footer}</DialogActions>}
    </Dialog>
  );
}
