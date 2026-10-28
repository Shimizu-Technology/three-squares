import type { MouseEventHandler } from 'react';
import { StatusBadge } from '../ui/StatusBadge';

export interface POSProductTileProps {
  name: string;
  price: string;
  inCartQuantity?: number;
  soldOut?: boolean;
  atCapacity?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}
/** Stable sale anatomy; availability administration belongs to its own mode. */
export function POSProductTile({ name, price, inCartQuantity = 0, soldOut = false, atCapacity = false,
  disabled = false, onClick }: POSProductTileProps) {
  return <button type="button" className="pos-product-tile" data-in-cart={inCartQuantity > 0 || undefined}
    data-sold-out={soldOut || undefined} disabled={disabled || soldOut || atCapacity} onClick={onClick}
    aria-label={`${name}, ${price}${soldOut ? ', sold out' : atCapacity ? ', stock limit in cart' : ''}`}>
    <span className="pos-product-tile__title">{name}</span>
    <span className="pos-product-tile__price">{price}</span>
    <span className="pos-product-tile__state">
      {soldOut ? <StatusBadge tone="attention">Sold out</StatusBadge> : atCapacity ? <StatusBadge>Stock limit in cart</StatusBadge> :
        inCartQuantity > 0 ? <StatusBadge tone="success">In cart ({inCartQuantity})</StatusBadge> : null}
    </span>
  </button>;
}
