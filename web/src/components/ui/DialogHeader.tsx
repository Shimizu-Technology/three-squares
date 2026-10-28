import type { ReactNode, Ref } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

interface DialogHeaderProps {
  titleId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
  onClose?: () => void;
  closeLabel?: string;
  disabled?: boolean;
  children?: ReactNode;
}

export function DialogHeader({titleId, title, subtitle, subtitleId, headingRef, headingTabIndex, onClose, closeLabel = 'Close dialog', disabled = false, children}: DialogHeaderProps) {
  return <div className="ui-dialog-header">
    <div className="min-w-0"><h2 id={titleId} ref={headingRef} tabIndex={headingTabIndex}>{title}</h2>
      {subtitle && <p id={subtitleId} className="ui-dialog-header__subtitle">{subtitle}</p>}{children}
    </div>
    {onClose && <IconButton aria-label={closeLabel} disabled={disabled} onClick={() => { if (!disabled) onClose(); }} className="shrink-0 print-hide"><X /></IconButton>}
  </div>;
}
