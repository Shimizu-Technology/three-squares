import type { ComponentProps } from 'react';

/** Multiline content grows by rows and remains vertically resizable. */
export function Textarea({ className = '', rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} rows={rows} className={`ui-textarea ${className}`.trim()} data-ui-control="textarea" />;
}
