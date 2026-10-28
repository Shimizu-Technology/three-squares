import type { ReactNode } from 'react';

export interface Choice<T extends string> { value: T; label: ReactNode }
/** Wrapping, single-choice filter/section controls. Every choice is a native tab stop. */
export function ChoiceGroup<T extends string>({ label, value, choices, onChange, disabled = false }: {
  label: string; value: T; choices: readonly Choice<T>[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <div role="group" aria-label={label} className="ui-choice-group">
    {choices.map(choice => <button key={choice.value} type="button" data-ui-control="choice"
      className="ui-choice" aria-pressed={value === choice.value} disabled={disabled}
      onClick={() => onChange(choice.value)}>{choice.label}</button>)}
  </div>;
}
