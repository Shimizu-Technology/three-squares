import { Link } from 'react-router-dom';
import type { Product } from '../services/api';
import { formatPrice } from '../services/api';
import { useCartStore } from '../store/cartStore';
import { evaluateCartCompatibility } from '../utils/cartCompatibility';
import ProductBadge from './ProductBadge';
import PlaceholderImage from './ui/PlaceholderImage';
import OptimizedImage from './ui/OptimizedImage';

const EMPTY_CART_ITEMS: Array<{ product: { allow_pickup?: boolean; allow_shipping?: boolean; available_location_ids?: number[] } }> = [];

interface ProductCardProps {
  product: Product;
  locationNameById?: Record<number, string>;
}

export default function ProductCard({ product, locationNameById = {} }: ProductCardProps) {
  const isOnSale = Boolean(product.sale_price_cents && product.sale_price_cents < product.base_price_cents);
  const cartItems = useCartStore((state) => state.cart?.items) ?? EMPTY_CART_ITEMS;
  const cartCompatibility = evaluateCartCompatibility(cartItems, product);
  const relevantLocationNames = cartCompatibility.relevantPickupLocationIds
    .map((id) => locationNameById[id])
    .filter(Boolean);
  const conflictText = relevantLocationNames.length > 0
    ? `Only pickup at ${relevantLocationNames.join(', ')}`
    : 'Pickup location conflicts with current cart';

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex flex-col rounded-xl p-2 bg-white border border-warm-200 hover:border-warm-300 hover:shadow-md transition h-full"
    >
      {/* Image */}
      <div className="relative bg-warm-100 overflow-hidden rounded-lg" style={{ aspectRatio: '1/1' }}>
        {product.primary_image_url ? (
          <OptimizedImage
            src={product.primary_image_url}
            alt={product.name}
            context="card"
            className="w-full h-full object-cover object-center bg-warm-50 group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <PlaceholderImage variant="card" className="bg-warm-50" />
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {!product.actually_available && <ProductBadge type="sold-out" />}
          {isOnSale && <ProductBadge type="sale" />}
        </div>
      </div>

      {/* Content */}
      <div className="pt-3 pb-1 flex flex-col grow">
        <h3 className="font-medium text-sm sm:text-base text-warm-900 mb-2 line-clamp-2 group-hover:text-tsPrimary transition">
          {product.name}
        </h3>

        <div className="mt-auto">
          {product.product_type === 'market_price' ? (
            <span className="text-base font-medium text-warm-600 italic">
              Market Price
            </span>
          ) : isOnSale ? (
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-warm-900">
                {formatPrice(product.sale_price_cents!)}
              </span>
              <span className="text-sm text-warm-400 line-through">
                {formatPrice(product.base_price_cents)}
              </span>
            </div>
          ) : (
            <span className="text-base font-medium text-warm-900">
              {formatPrice(product.base_price_cents)}
            </span>
          )}

          {cartCompatibility.reason === 'pickup_location' && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {conflictText}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
