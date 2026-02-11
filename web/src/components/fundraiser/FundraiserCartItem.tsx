import { Plus, Minus, Trash2, Package } from 'lucide-react';
import type { FundraiserCartItem as CartItemType } from '../../contexts/FundraiserCartContext';

interface FundraiserCartItemProps {
  item: CartItemType;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export default function FundraiserCartItem({
  item,
  onUpdateQuantity,
  onRemove,
}: FundraiserCartItemProps) {
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const canDecrease = item.quantity > item.minQuantity;
  const canIncrease = !item.maxQuantity || item.quantity < item.maxQuantity;

  return (
    <div className="flex items-center gap-4 py-4 border-b border-warm-100 last:border-b-0">
      {/* Image */}
      <div className="w-20 h-20 bg-warm-100 rounded-lg overflow-hidden shrink-0">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-warm-400">
            <Package className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-warm-900 truncate">{item.name}</h4>
        <p className="text-sm text-warm-600">{item.variantName}</p>
        <p className="font-semibold text-tsPrimary mt-1">
          {formatPrice(item.priceCents)}
        </p>
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdateQuantity(item.quantity - 1)}
          disabled={!canDecrease}
          className="p-2 border rounded-lg hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          aria-label="Decrease quantity"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-8 text-center font-medium">{item.quantity}</span>
        <button
          onClick={() => onUpdateQuantity(item.quantity + 1)}
          disabled={!canIncrease}
          className="p-2 border rounded-lg hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          aria-label="Increase quantity"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Remove Button */}
      <button
        onClick={onRemove}
        className="p-2 text-warm-400 hover:text-red-600 transition"
        aria-label="Remove item"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
}
