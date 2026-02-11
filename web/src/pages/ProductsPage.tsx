import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Product } from '../services/api';
import { productsApi, collectionsApi, locationsApi } from '../services/api';
import ProductCard from '../components/ProductCard';
import FadeIn from '../components/animations/FadeIn';
import { PageHeaderSkeleton, ProductGridSkeleton } from '../components/Skeleton';

interface Collection {
  id: number;
  name: string;
  slug: string;
}

interface PickupLocation {
  id: number;
  name: string;
  slug: string;
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ page: 1, per_page: 12, total: 0 });
  const didScrollRef = useRef(false);

  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const collection = searchParams.get('collection') || '';
  const productType = searchParams.get('type') || '';
  const sort = searchParams.get('sort') || '';
  const locationId = searchParams.get('location_id') || '';

  useEffect(() => {
    fetchCollections();
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [page, search, collection, productType, sort, locationId]);

  useEffect(() => {
    if (!didScrollRef.current) {
      didScrollRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const fetchCollections = async () => {
    try {
      const response = await collectionsApi.getCollections();
      // Only show collections with 5+ products
      const mainCollections = response.collections.filter((c: { product_count: number }) => c.product_count >= 5);
      setCollections(mainCollections);
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsApi.getLocations();
      setLocations(response.locations || []);
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await productsApi.getProducts({
        page,
        per_page: 12,
        search: search || undefined,
        collection: collection || undefined,
        product_type: productType || undefined,
        sort: sort || undefined,
        location_id: locationId ? Number(locationId) : undefined,
      });
      setProducts(response.products);
      setMeta(response.meta);
      setError(null);
    } catch (err) {
      setError('Failed to load products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    const params: Record<string, string> = {};
    if (value) params.search = value;
    if (collection) params.collection = collection;
    if (productType) params.type = productType;
    if (sort) params.sort = sort;
    if (locationId) params.location_id = locationId;
    setSearchParams(params);
  };

  const handleFilterChange = (filterType: 'collection' | 'type' | 'sort' | 'location_id', value: string) => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (filterType === 'collection') {
      if (value) params.collection = value;
      if (productType) params.type = productType;
      if (sort) params.sort = sort;
      if (locationId) params.location_id = locationId;
    } else if (filterType === 'type') {
      if (collection) params.collection = collection;
      if (value) params.type = value;
      if (sort) params.sort = sort;
      if (locationId) params.location_id = locationId;
    } else if (filterType === 'sort') {
      if (collection) params.collection = collection;
      if (productType) params.type = productType;
      if (value) params.sort = value;
      if (locationId) params.location_id = locationId;
    } else if (filterType === 'location_id') {
      if (collection) params.collection = collection;
      if (productType) params.type = productType;
      if (sort) params.sort = sort;
      if (value) params.location_id = value;
    }
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const handlePageChange = (newPage: number) => {
    const params: Record<string, string> = { page: newPage.toString() };
    if (search) params.search = search;
    if (collection) params.collection = collection;
    if (productType) params.type = productType;
    if (sort) params.sort = sort;
    if (locationId) params.location_id = locationId;
    setSearchParams(params);
  };

  if (loading && products.length === 0) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="bg-warm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <PageHeaderSkeleton />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProductGridSkeleton count={12} />
        </div>
      </div>
    );
  }

  // Show empty state instead of error when no products exist
  if (error && products.length === 0) {
    return (
      <div className="min-h-screen bg-warm-50">
        {/* Header */}
        <div className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-warm-900 mb-2">
              Shop <span className="text-tsPrimary">Three Squares</span>
            </h1>
            <p className="text-warm-600 text-sm sm:text-base">
              Chamorro pride. Island style. Premium quality.
            </p>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="mb-6"><svg className="w-16 h-16 mx-auto text-tsPrimary" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg></div>
            <h2 className="text-2xl font-bold text-warm-900 mb-4">Coming Soon!</h2>
            <p className="text-warm-600 mb-8">
              We're preparing our collection of premium Chamorro pride apparel. 
              Check back soon for amazing island-inspired designs!
            </p>
            <button
              onClick={fetchProducts}
              className="bg-tsPrimary text-white px-6 py-3 rounded-lg hover:bg-primary-dark transition"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(meta.total / meta.per_page);

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Header */}
      <div className="bg-warm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <FadeIn>
            <div className="text-center">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-warm-900 mb-3 tracking-tight">
                Browse Menu
              </h1>
              <p className="text-warm-500 text-base sm:text-lg max-w-2xl mx-auto">
                Guam comfort food favorites, catering trays, and island-made specialties.
              </p>
            </div>
          </FadeIn>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-warm-100 p-4 sm:p-6 mb-6">
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative max-w-2xl mx-auto">
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full px-4 py-3 pl-11 text-sm sm:text-base bg-warm-50 border border-warm-200 rounded-full focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition"
              />
              <svg
                className="absolute left-4 top-3.5 h-5 w-5 text-warm-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Collection Filter */}
            <div>
              <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Collection</label>
              <select
                value={collection}
                onChange={(e) => handleFilterChange('collection', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
              >
                <option value="">All Collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Type Filter */}
            <div>
              <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Product Type</label>
              <select
                value={productType}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
              >
                <option value="">All Types</option>
                <option value="T-Shirt">T-Shirt</option>
                <option value="Long Sleeve">Long Sleeve</option>
                <option value="Polo">Polo</option>
                <option value="Button Up">Button Up</option>
                <option value="Shorts">Shorts</option>
                <option value="Tank Top">Tank Top</option>
                <option value="Baseball Cap">Baseball Cap</option>
                <option value="Snapback">Snapback</option>
                <option value="Sticker">Sticker</option>
              </select>
            </div>

            {/* Sort Options */}
            <div>
              <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Sort By</label>
              <select
                value={sort}
                onChange={(e) => handleFilterChange('sort', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
              >
                <option value="">Featured</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="newest">Newest First</option>
                <option value="name_asc">Name: A-Z</option>
                <option value="name_desc">Name: Z-A</option>
              </select>
            </div>

            {/* Pickup Location Filter */}
            <div>
              <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Pickup Location</label>
              <select
                value={locationId}
                onChange={(e) => handleFilterChange('location_id', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
              >
                <option value="">All Locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id.toString()}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                disabled={!search && !collection && !productType && !sort && !locationId}
                className="w-full px-4 py-2.5 text-sm font-semibold text-warm-600 bg-warm-100 border border-warm-200 rounded-lg hover:bg-warm-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            </div>
          </div>

          {/* Active Filters Display */}
          {(search || collection || productType || sort || locationId) && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-warm-600 font-medium">Active filters:</span>
              {search && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  Search: "{search}"
                  <button
                    onClick={() => handleSearch('')}
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {collection && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  {collections.find(c => c.slug === collection)?.name}
                  <button
                    onClick={() => handleFilterChange('collection', '')}
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {productType && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  {productType}
                  <button
                    onClick={() => handleFilterChange('type', '')}
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {sort && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  Sort: {sort === 'price_asc' ? 'Price ↑' : sort === 'price_desc' ? 'Price ↓' : sort === 'newest' ? 'Newest' : sort === 'name_asc' ? 'A-Z' : 'Z-A'}
                  <button
                    onClick={() => handleFilterChange('sort', '')}
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {locationId && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  Pickup: {locations.find((location) => location.id.toString() === locationId)?.name || 'Location'}
                  <button
                    onClick={() => handleFilterChange('location_id', '')}
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-warm-600 text-sm sm:text-base">
            <span className="font-semibold text-warm-900">{meta.total}</span> products
            {(search || collection || productType || locationId) && (
              <span className="ml-1 text-warm-400">
                (filtered)
              </span>
            )}
          </p>
          {totalPages > 1 && (
            <p className="text-sm text-warm-500">
              Page {page} of {totalPages}
            </p>
          )}
        </div>

        {/* Products Grid */}
        {products.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-warm-100">
            <div className="mb-4"><svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></div>
            <p className="text-warm-700 text-lg font-medium mb-2">No products found</p>
            <p className="text-warm-500 mb-6">Try adjusting your search or filters</p>
            {search && (
              <button
                onClick={() => handleSearch('')}
                className="btn-primary"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8 mb-12">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 sm:gap-3">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium bg-white border border-warm-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-warm-50 hover:border-warm-300 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="hidden sm:inline">Previous</span>
                </button>
                
                <div className="flex gap-1 sm:gap-2">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`min-w-[40px] px-3 py-2 text-sm font-medium rounded-lg transition ${
                          page === pageNum
                            ? 'bg-tsPrimary text-white shadow-md'
                            : 'bg-white border border-warm-200 hover:bg-warm-50 hover:border-warm-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium bg-white border border-warm-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-warm-50 hover:border-warm-300 transition"
                >
                  <span className="hidden sm:inline">Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

