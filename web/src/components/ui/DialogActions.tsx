import type { ReactNode } from 'react';

/** Keep actions outside the scrolling body and reachable on short screens. */
export function DialogActions({children}: {children: ReactNode}) {
  return <div className="ui-dialog-actions print-hide">{children}</div>;
}
