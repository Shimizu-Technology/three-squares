import type { CatalogPricing } from '../services/api';
import { formatPrice } from '../services/api';

/** All customer prices come from the same server contract, including "was". */
export default function CatalogPrice({ pricing, productType }: { pricing?: CatalogPricing; productType: string }) {
  if (!pricing?.purchasable || pricing.unit_price_cents === null) {
    return <span className="text-base font-medium text-warm-600">Contact us for a price</span>;
  }
  if (productType === 'complimentary_with_meal') {
    return <span className="text-base font-medium text-warm-600">Complimentary with a meal</span>;
  }
  return <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <span className="font-semibold text-warm-900">{pricing.price_varies ? 'From ' : ''}{formatPrice(pricing.unit_price_cents)}</span>
    {pricing.compare_at_price_cents !== null && <span className="text-sm text-warm-600 line-through"><span className="sr-only">Was </span>{formatPrice(pricing.compare_at_price_cents)}</span>}
  </span>;
}
