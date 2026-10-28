import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  pending?: boolean;
  itemLabel: string;
  size?: 'md' | 'lg';
}

/** Absolute quantities; the caller owns stock rules, saving and removal. */
export function QuantityStepper({ value, onChange, min = 1, max, disabled = false,
  pending = false, itemLabel, size = 'md' }: QuantityStepperProps) {
  const blocked = disabled || pending;
  const canDecrease = !blocked && value > min;
  const canIncrease = !blocked && (max === undefined || value < max);
  return <div role="group" aria-label={`Quantity of ${itemLabel}`} aria-busy={pending || undefined}
    className="inline-flex shrink-0 items-center gap-1">
    <IconButton variant="secondary" size={size} aria-label={`Decrease quantity of ${itemLabel}`}
      disabled={!canDecrease} onClick={() => { if (canDecrease) onChange(Math.max(min, value - 1)); }}><Minus /></IconButton>
    <output className={`w-[6ch] shrink-0 text-center tabular-nums font-semibold ${size === 'lg' ? 'text-base leading-6' : 'text-sm leading-5'}`}
      aria-label={`Current quantity of ${itemLabel}`}>{value}</output>
    <IconButton variant="secondary" size={size} aria-label={`Increase quantity of ${itemLabel}`}
      disabled={!canIncrease} onClick={() => { if (canIncrease) onChange(Math.min(max ?? Infinity, value + 1)); }}><Plus /></IconButton>
  </div>;
}
