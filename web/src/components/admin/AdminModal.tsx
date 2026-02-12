import { useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';

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
  children,
}: AdminModalProps) {
  useLockBodyScroll(open);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-white/30 ${
        printable ? 'print:bg-white print:p-0 print:block' : ''
      }`}
      onClick={onClose}
    >
      {printable && (
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
      <div
        className={`bg-white rounded-xl ${maxWidth} w-full max-h-[90vh] flex flex-col min-h-0 shadow-2xl ${
          printable ? 'print:shadow-none print:max-h-none print:overflow-visible print-content' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center rounded-t-xl shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition min-w-[44px] min-h-[44px] p-2 rounded-lg hover:bg-gray-100 print-hide"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div
          ref={modalContentRef}
          className={`flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain ${
            printable ? 'print:overflow-visible' : ''
          }`}
          onWheel={(event) => {
            if (modalContentRef.current) {
              modalContentRef.current.scrollTop += event.deltaY;
            }
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl print-hide shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
