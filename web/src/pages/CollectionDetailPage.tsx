import axios from 'axios';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collectionsApi } from '../services/api';
import type { Collection as ApiCollection, Product } from '../services/api';
import ProductCard from '../components/ProductCard';
import { ProductGridSkeleton, PageHeaderSkeleton } from '../components/Skeleton';
import FadeIn from '../components/animations/FadeIn';
import Breadcrumbs from '../components/Breadcrumbs';
import { useLocationStore } from '../store/locationStore';

type Collection = ApiCollection;

interface Meta {
  page: number;
  per_page: number;
  total: number;
}

export default function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [productType, setProductType] = useState('');
  const didScrollRef = useRef(false);
  const { selectedLocation } = useLocationStore();

  // Derive product type filter options from actual products
  const productTypes = useMemo(() => {
    const types = new Set<string>();
    products.forEach((p) => {
      if (p.product_type) types.add(p.product_type);
    });
    return Array.from(types).sort();
  }, [products]);

  // Reset pagination when location changes to avoid requesting a page that
  // doesn't exist at the new location (e.g., page 3 → empty grid).
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedLocation?.id]);

  useEffect(() => {
    if (slug) {
      fetchCollectionData();
    }
  }, [slug, currentPage, searchQuery, productType, selectedLocation?.id]);

  useEffect(() => {
    if (!didScrollRef.current) {
      didScrollRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const fetchCollectionData = async () => {
    if (!slug) return;

    try {
      setLoading(true);
      setError(null);
      const data = await collectionsApi.getCollectionBySlug(slug, {
        page: currentPage,
        per_page: 12,
        search: searchQuery || undefined,
        product_type: productType || undefined,
        location_id: selectedLocation?.id,
      });
      setCollection(data.collection);
      setProducts(data.products);
      setMeta(data.meta);
    } catch (err) {
      console.error('Failed to fetch collection:', err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to load collection' : 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchCollectionData();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setProductType('');
    setCurrentPage(1);
  };

  if (loading && !collection) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <PageHeaderSkeleton />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Collection not found'}</p>
          <Link
            to="/collections"
            className="px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition inline-block"
          >
            Back to Collections
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = meta ? Math.ceil(meta.total / meta.per_page) : 1;

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Breadcrumbs */}
      <div className="bg-warm-100 border-b border-warm-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs items={[
            { label: 'Shop', path: '/products' },
            { label: 'Collections', path: '/collections' },
            { label: collection.name }
          ]} />
        </div>
      </div>

      {/* Hero Banner - Clean design with Three Squares branding */}
      <div className="relative overflow-hidden bg-tsPrimary">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-linear-to-r from-tsPrimary via-red-700 to-tsPrimary" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <FadeIn>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-3 drop-shadow-md">
              {collection.name}
            </h1>
            {collection.description && (
              <p className="text-lg text-white/90 max-w-2xl mb-3">{collection.description}</p>
            )}
            <p className="text-sm text-white/70">
              {meta?.total || 0} {meta?.total === 1 ? 'product' : 'products'}
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-warm-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent transition"
              />
            </form>

            {/* Product Type Filter — derived from actual products */}
            {productTypes.length > 1 && (
              <select
                value={productType}
                onChange={(e) => {
                  setProductType(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-4 py-2 bg-white border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent transition"
              >
                <option value="">All Types</option>
                {productTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            )}

            {/* Clear Filters */}
            {(searchQuery || productType) && (
              <button
                onClick={handleClearFilters}
                className="px-6 py-2 bg-warm-200 text-warm-700 rounded-lg hover:bg-warm-300 transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="py-6">
            <ProductGridSkeleton count={8} />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No products found in this collection.</p>
            <button
              onClick={handleClearFilters}
              className="px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <>
            {/* Product Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

