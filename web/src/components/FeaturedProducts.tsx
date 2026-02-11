import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { productsApi, formatPrice, locationsApi } from '../services/api';
import type { Product } from '../services/api';
import { useCartStore } from '../store/cartStore';
import { evaluateCartCompatibility } from '../utils/cartCompatibility';
import ProductBadge from './ProductBadge';
import FadeIn from './animations/FadeIn';
import { StaggerContainer, StaggerItem } from './animations/StaggerContainer';
import { ProductGridSkeleton } from './Skeleton';
import PlaceholderImage from './ui/PlaceholderImage';
import OptimizedImage from './ui/OptimizedImage';

export default function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locationNameById, setLocationNameById] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cartItems = useCartStore((state) => state.cart?.items || []);

  useEffect(() => {
    const fetchFeaturedProducts = async () => {
      try {
        setIsLoading(true);
        // Fetch featured products, limit to 8 for homepage
        const response = await productsApi.getProducts({
          featured: true,
          per_page: 8
        });

        let featuredProducts = response.products;

        // If we have fewer than 6 featured products, fetch newest to fill the gap
        if (featuredProducts.length < 6) {
          const newestResponse = await productsApi.getProducts({
            per_page: 8 - featuredProducts.length,
            sort: 'newest'
          });

          // Combine featured + newest, remove duplicates
          const allProducts = [...featuredProducts, ...newestResponse.products];
          const uniqueProducts = allProducts.filter((product, index, self) =>
            index === self.findIndex((p) => p.id === product.id)
          );

          featuredProducts = uniqueProducts.slice(0, 8);
        }

        setProducts(featuredProducts);
      } catch {
        setError('Failed to load products');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeaturedProducts();
  }, []);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await locationsApi.getLocations();
        const nextMap = (response.locations || []).reduce<Record<number, string>>((acc, location) => {
          acc[location.id] = location.name;
          return acc;
        }, {});
        setLocationNameById(nextMap);
      } catch (_error) {
        setLocationNameById({});
      }
    };

    fetchLocations();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        <h2 className="text-3xl font-bold text-center mb-8 sm:mb-12 text-warm-900 tracking-tight">
          Featured Products
        </h2>
        <ProductGridSkeleton count={8} />
      </div>
    );
  }

  if (error || products.length === 0) {
    return null; // Don't show section if no products
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
      <FadeIn>
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-warm-900 tracking-tight">
            Featured Products
          </h2>
          <p className="text-base text-warm-500 max-w-2xl mx-auto">
            Discover our hand-picked local favorites from the Three Squares kitchen
          </p>
        </div>
      </FadeIn>

      <StaggerContainer
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mb-12"
        staggerDelay={0.06}
      >
        {products.map((product) => {
          const isOnSale = product.sale_price_cents && product.sale_price_cents < product.base_price_cents;
          const cartCompatibility = evaluateCartCompatibility(cartItems, product);
          const relevantLocationNames = cartCompatibility.relevantPickupLocationIds
            .map((id) => locationNameById[id])
            .filter(Boolean);
          const conflictText = relevantLocationNames.length > 0
            ? `Only pickup at ${relevantLocationNames.join(', ')}`
            : 'Pickup location conflicts with current cart';

          return (
            <StaggerItem key={product.id}>
              <Link
                to={`/products/${product.slug}`}
                className="group flex flex-col rounded-xl p-2 bg-white border border-warm-200 hover:border-warm-300 hover:shadow-md transition"
              >
                {/* Image */}
                <div className="relative bg-warm-100 overflow-hidden rounded-lg" style={{ aspectRatio: '1/1' }}>
                  {product.primary_image_url ? (
                    <OptimizedImage
                      src={product.primary_image_url}
                      alt={product.name}
                      context="featured"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <PlaceholderImage variant="detail" className="bg-warm-50" />
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
                    {isOnSale ? (
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
            </StaggerItem>
          );
        })}
      </StaggerContainer>

      {/* View All Button */}
      <FadeIn>
        <div className="text-center">
          <Link
            to="/products"
            className="group inline-flex items-center gap-2 text-base px-8 py-3 bg-warm-900 text-white rounded-lg hover:bg-warm-800 transition-all duration-200 hover:-translate-y-0.5 font-medium"
          >
            View All Products
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </FadeIn>
    </div>
  );
}
