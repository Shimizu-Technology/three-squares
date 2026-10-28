import type { Product } from '../services/api';
import CatalogPrice from './CatalogPrice';
import { useCartStore } from '../store/cartStore';
import { evaluateCartCompatibility } from '../utils/cartCompatibility';
import ProductBadge from './ProductBadge';
import OptimizedImage from './ui/OptimizedImage';
import { CustomerCard } from './ui/CustomerCard';
import { StatusBadge } from './ui/StatusBadge';

const EMPTY_CART_ITEMS: Array<{ product: { allow_pickup?: boolean; allow_shipping?: boolean; available_location_ids?: number[] } }> = [];

interface ProductCardProps {
  product: Product;
  locationNameById?: Record<number, string>;
}

export default function ProductCard({ product, locationNameById = {} }: ProductCardProps) {
  const isOnSale = product.pricing?.compare_at_price_cents != null;
  const cartItems = useCartStore((state) => state.cart?.items) ?? EMPTY_CART_ITEMS;
  const cartCompatibility = evaluateCartCompatibility(cartItems, product);
  const relevantLocationNames = cartCompatibility.relevantPickupLocationIds
    .map((id) => locationNameById[id])
    .filter(Boolean);
  const conflictText = relevantLocationNames.length > 0
    ? `Only pickup at ${relevantLocationNames.join(', ')}`
    : 'Pickup location conflicts with current cart';

  return (
    <CustomerCard to={`/products/${product.slug}`}>
      {/* Image */}
      <div className="customer-card__media">
        <OptimizedImage
          src={product.primary_image_url}
          alt={product.name}
          context="card"
          className="w-full h-full object-cover object-center"
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {!product.actually_available && <ProductBadge type="sold-out" />}
          {isOnSale && <ProductBadge type="sale" />}
        </div>
        {cartCompatibility.reason === 'pickup_location' && (
          <div className="absolute bottom-2 left-2 right-2" title={conflictText}>
            <StatusBadge tone="attention">Pickup conflict</StatusBadge>
            <span className="sr-only">{conflictText}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="customer-card__body">
        <h3 className="customer-card__title">
          {product.name}
        </h3>

        <div className="customer-card__price">
          <CatalogPrice pricing={product.pricing} productType={product.product_type} compact />
        </div>
      </div>
    </CustomerCard>
  );
}
