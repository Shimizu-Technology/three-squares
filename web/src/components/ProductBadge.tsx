import { StatusBadge } from './ui/StatusBadge';

interface ProductBadgeProps {
  type: 'sold-out' | 'sale' | 'new';
  saveAmount?: number; // For sale badge - how much you save in dollars
  className?: string;
}

export default function ProductBadge({ type, saveAmount, className = '' }: ProductBadgeProps) {
  if (type === 'sold-out') {
    return (
      <StatusBadge tone="attention" className={className}>
        Sold Out
      </StatusBadge>
    );
  }

  if (type === 'sale') {
    return (
      <StatusBadge tone="success" className={className}>
        {saveAmount ? `Save $${saveAmount}` : 'Sale'}
      </StatusBadge>
    );
  }

  if (type === 'new') {
    return (
      <StatusBadge tone="info" className={className}>
        New
      </StatusBadge>
    );
  }

  return null;
}

