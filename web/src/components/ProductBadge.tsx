interface ProductBadgeProps {
  type: 'sold-out' | 'sale' | 'new';
  saveAmount?: number; // For sale badge - how much you save in dollars
  className?: string;
}

export default function ProductBadge({ type, saveAmount, className = '' }: ProductBadgeProps) {
  if (type === 'sold-out') {
    return (
      <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-red-600 text-white ${className}`}>
        Sold Out
      </span>
    );
  }

  if (type === 'sale' && saveAmount) {
    return (
      <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-green-600 text-white ${className}`}>
        Save ${saveAmount}
      </span>
    );
  }

  if (type === 'new') {
    return (
      <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-tsGold text-warm-900 ${className}`}>
        New
      </span>
    );
  }

  return null;
}

