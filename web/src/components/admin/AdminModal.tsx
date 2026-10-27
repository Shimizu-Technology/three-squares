import { useId } from 'react';
import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
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
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center rounded-t-xl shrink-0">
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-bold text-gray-900 break-words">{title}</h2>
          {subtitle && (
            <p id={subtitleId} className="text-sm text-gray-500 mt-0.5 break-words">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={requestClose}
          disabled={!dismissible}
          className="text-gray-400 hover:text-gray-600 transition shrink-0 min-w-[44px] min-h-[44px] p-2 rounded-lg hover:bg-gray-100 print-hide"
          aria-label={`Close ${title}`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain ${
          printable ? 'print:overflow-visible' : ''
        }`}
      >
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl print-hide shrink-0">
          {footer}
        </div>
      )}
    </Dialog>
  );
}
