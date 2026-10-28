import ProductCard from './ProductCard';
import { Button } from './ui/Button';
import { useLocationStore } from '../store/locationStore';
import { useState, useEffect } from 'react';
import { productsApi, locationsApi } from '../services/api';
import type { Product } from '../services/api';
import FadeIn from './animations/FadeIn';
import { StaggerContainer, StaggerItem } from './animations/StaggerContainer';
import { ProductGridSkeleton } from './Skeleton';


export default function FeaturedProducts() {
  const locationId = useLocationStore((state) => state.selectedLocation?.id);
  const [products, setProducts] = useState<Product[]>([]);
  const [locationNameById, setLocationNameById] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchFeaturedProducts = async () => {
      try {
        setIsLoading(true);
        // Fetch featured products, limit to 8 for homepage
        const response = await productsApi.getProducts({
          featured: true,
          location_id: locationId,
          per_page: 8
        });

        let featuredProducts = response.products;

        // If we have fewer than 6 featured products, fetch newest to fill the gap
        if (featuredProducts.length < 6) {
          const newestResponse = await productsApi.getProducts({
            per_page: 8 - featuredProducts.length,
            sort: 'newest',
            location_id: locationId
          });

          // Combine featured + newest, remove duplicates
          const allProducts = [...featuredProducts, ...newestResponse.products];
          const uniqueProducts = allProducts.filter((product, index, self) =>
            index === self.findIndex((p) => p.id === product.id)
          );

          featuredProducts = uniqueProducts.slice(0, 8);
        }

        if (active) { setProducts(featuredProducts); setError(null); }
      } catch {
        if (active) setError('Failed to load products');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchFeaturedProducts();
    return () => { active = false; };
  }, [locationId]);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await locationsApi.getLocations();
        const nextMap = (response.locations || []).reduce<Record<number, string>>((acc, location) => {
          acc[location.id] = location.name;
          return acc;
        }, {});
        setLocationNameById(nextMap);
      } catch {
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
        {products.map(product => <StaggerItem key={product.id}>
          <ProductCard product={product} locationNameById={locationNameById} />
        </StaggerItem>)}
      </StaggerContainer>

      {/* View All Button */}
      <FadeIn>
        <div className="text-center">
          <Button size="lg"
            to="/products"

          >
            View All Products
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Button>
        </div>
      </FadeIn>
    </div>
  );
}
