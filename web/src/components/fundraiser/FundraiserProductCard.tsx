import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import type { FundraiserProduct } from '../../services/fundraiserPublicService';

interface FundraiserProductCardProps {
  product: FundraiserProduct;
  fundraiserSlug: string;
  canOrder: boolean;
}

export default function FundraiserProductCard({
  product,
  fundraiserSlug,
  canOrder,
}: FundraiserProductCardProps) {
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <Link
      to={`/f/${fundraiserSlug}/products/${product.slug}`}
      className="group bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition"
    >
      {/* Image */}
      <div className="aspect-square bg-warm-100 relative overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-warm-400">
            <Package className="w-12 h-12" />
          </div>
        )}
        {!product.in_stock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-warm-800 text-white px-3 py-1 rounded-full text-sm">
              Out of Stock
            </span>
          </div>
        )}
        {!canOrder && product.in_stock && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <span className="bg-warm-700 text-white px-3 py-1 rounded-full text-sm">
              Fundraiser Ended
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-warm-900 group-hover:text-tsPrimary transition line-clamp-2">
          {product.name}
        </h3>
        <p className="text-xl font-bold text-tsPrimary mt-2">
          {formatPrice(product.price_cents)}
        </p>
        {product.variants.length > 1 && (
          <p className="text-sm text-warm-500 mt-1">
            {product.variants.length} options available
          </p>
        )}
      </div>
    </Link>
  );
}
