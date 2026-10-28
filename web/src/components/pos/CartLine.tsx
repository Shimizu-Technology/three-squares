import { SlidersHorizontal, Trash2, ChevronDown } from 'lucide-react';
import type { CartItem } from '../admin/posCart';
import { IconButton } from '../ui/IconButton';
import { QuantityStepper } from '../ui/QuantityStepper';

export function CartLine({ item, selected, max, increaseDisabled, onChange, onSelect, onRemove }:
  {item: CartItem; selected: boolean; max?: number; increaseDisabled: boolean;
  onChange: (next: number) => void; onSelect: () => void; onRemove: () => void}) {
  return <article aria-label={`Cart item: ${item.product.name}`} className="pos-cart-line" data-selected={selected || undefined}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
      <details className="min-w-0">
        <summary className="flex min-h-11 cursor-pointer items-start gap-1 text-sm font-semibold text-slate-900"><ChevronDown aria-hidden="true" className="mt-1 h-3 w-3 shrink-0" /><span className="min-w-0 line-clamp-2">{item.product.name}</span></summary>
        <p className="text-sm">{item.product.name}</p>
      </details>
      <span className="text-sm font-semibold tabular-nums text-tsNavy">${((item.variant.price_cents * item.quantity) / 100).toFixed(2)}</span>
    </div>
    {item.variant.name !== 'Default' && <p className="text-xs text-slate-600">{item.variant.name}</p>}
    <div className="mt-2 flex items-center justify-between gap-1">
      <QuantityStepper value={item.quantity} min={0} max={increaseDisabled ? item.quantity : max} itemLabel={item.product.name} onChange={onChange} />
      <IconButton aria-label={`Select ${item.product.name} for quick quantity`} aria-pressed={selected} title="Select for quick quantity" onClick={onSelect}><SlidersHorizontal /></IconButton>
      <IconButton aria-label={`Remove ${item.product.name}`} onClick={onRemove}><Trash2 /></IconButton>
    </div>
  </article>;
}
