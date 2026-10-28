import type { CatalogPricing } from '../services/api';
import { formatPrice } from '../services/api';

/** All customer prices come from the same server contract, including "was". */
export default function CatalogPrice({ pricing, productType, compact = false }: { pricing?: CatalogPricing; productType: string; compact?: boolean }) {
  if (!pricing?.purchasable || pricing.unit_price_cents === null) {
    const label = pricing?.reason?.toLowerCase().includes('catering inquiry') ? 'Catering inquiry'
      : productType === 'market_price' ? 'Market price' : 'Price by request';
    return <span className={compact ? 'text-sm font-medium text-warm-600' : 'text-base font-medium text-warm-600'}>
      {compact ? label : pricing?.reason || 'Contact us for a price'}
    </span>;
  }
  if (productType === 'complimentary_with_meal') {
    return <span className={compact ? 'text-sm font-medium text-warm-600' : 'text-base font-medium text-warm-600'}>{compact ? 'With a meal' : 'Complimentary with a meal'}</span>;
  }
  return <span className={compact ? 'customer-price' : 'inline-flex flex-wrap items-baseline gap-x-2 gap-y-1'}>
    <span className={`${compact ? 'customer-price__current' : ''} font-semibold text-warm-900`} title={compact ? `${pricing.price_varies ? 'From ' : ''}${formatPrice(pricing.unit_price_cents)}` : undefined}>{pricing.price_varies ? 'From ' : ''}{formatPrice(pricing.unit_price_cents)}</span>
    {pricing.compare_at_price_cents !== null && <span className={`${compact ? 'customer-price__previous text-xs' : 'text-sm'} text-warm-600 line-through`}><span className="sr-only">Was </span>{formatPrice(pricing.compare_at_price_cents)}</span>}
  </span>;
}
