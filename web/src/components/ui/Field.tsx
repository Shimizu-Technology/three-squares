import { cloneElement, useId, type ReactElement, type ReactNode, type AriaAttributes } from 'react';

type FieldControl = AriaAttributes & { id?: string; required?: boolean };
interface FieldProps {
  label: string;
  children: ReactElement<FieldControl>;
  help?: ReactNode;
  error?: ReactNode;
  /** Layout only; field spacing belongs to the shared recipe. */
  className?: string;
}

/** Explicit label association and additive help/error descriptions for one control. */
export function Field({ label, children, help, error, className = '' }: FieldProps) {
  const generatedId = useId();
  const id = children.props.id || `field-${generatedId}`;
  const hasHelp = help !== undefined && help !== null && help !== false && help !== '';
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const describedBy = [...new Set([
    ...((children.props['aria-describedby'] || '').split(/\s+/).filter(Boolean)),
    ...(hasHelp ? [`${id}-help`] : []),
    ...(hasError ? [`${id}-error`] : []),
  ])].join(' ') || undefined;
  return <div className={`ui-field ${className}`.trim()}>
    <label className="ui-field__label" htmlFor={id}>{label}{children.props.required && <span aria-hidden="true"> *</span>}</label>
    {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': hasError ? true : children.props['aria-invalid'] })}
    {hasHelp && <p className="ui-field__help" id={`${id}-help`}>{help}</p>}
    {hasError && <p className="ui-field__error" id={`${id}-error`}>{error}</p>}
  </div>;
}
