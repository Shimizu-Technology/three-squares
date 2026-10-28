import { Disclosure } from '../components/ui/Disclosure';
import { IconButton } from '../components/ui/IconButton';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Collection, Product, Location } from '../services/api';
import { productsApi, collectionsApi, locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';
import ProductCard from '../components/ProductCard';
import { ProductGridSkeleton } from '../components/Skeleton';
import useAppConfig from '../hooks/useAppConfig';
import { STOREFRONTS, isStorefrontEnabled, type StorefrontKey } from '../utils/storefronts';

interface PickupLocation {
  id: number;
  name: string;
  slug: string;
}

const menuContent: Record<StorefrontKey, { title: string; subtitle: string }> = {
  three_squares: { title: 'Three Squares menu', subtitle: 'Choose a meal for pickup.' },
  latte_stone: { title: 'Latte Stone Cookies', subtitle: 'Browse cookies and gift boxes.' },
  catering: { title: 'Catering menu', subtitle: 'Browse dishes for your event, then request a quote.' },
};

const productTypeLabel = (value: string) => {
  if (value === 'local') return 'Meals';
  if (value === 'complimentary_with_meal') return 'Included with a meal';
  if (value === 'market_price') return 'Price by request';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default function ProductsPage({ pickupLocation }: { pickupLocation?: Location } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ page: 1, per_page: 12, total: 0 });
  const didScrollRef = useRef(false);
  const productRequest = useRef(0);
  const [resultContext, setResultContext] = useState<string | null>(null);
  const locationNameById = locations.reduce<Record<number, string>>((acc, location) => {
    acc[location.id] = location.name;
    return acc;
  }, {});

  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const collection = searchParams.get('collection') || '';
  const productType = searchParams.get('type') || '';
  const sort = searchParams.get('sort') || '';
  const config = useAppConfig();
  const { selectedLocation } = useLocationStore();
  const locationId = pickupLocation ? String(pickupLocation.id) : (selectedLocation?.id ? String(selectedLocation.id) : '');
  const requestedLocationId = searchParams.get('location_id');
  const businessLine = searchParams.get('business_line') || '';
  const requestedBusinessLine = STOREFRONTS.some((storefront) => storefront.key === businessLine)
    ? businessLine as StorefrontKey
    : '';
  const enabledStorefronts = STOREFRONTS.filter((storefront) => isStorefrontEnabled(config, storefront.key));
  const enabledStorefrontValues = new Set(enabledStorefronts.map((storefront) => storefront.key));
  const activeBusinessLine =
    config == null
      ? requestedBusinessLine
      : requestedBusinessLine && enabledStorefrontValues.has(requestedBusinessLine)
        ? requestedBusinessLine
        : '';
  const businessLineContent = activeBusinessLine ? menuContent[activeBusinessLine]
    : { title: 'Menu', subtitle: 'Choose your next meal for pickup.' };
  const visibleCollections = useMemo(() => {
    if (!activeBusinessLine) {
      return collections;
    }

    return collections.filter((item) => item.business_line === activeBusinessLine);
  }, [activeBusinessLine, collections]);
  const [availableProductTypes, setAvailableProductTypes] = useState<string[]>([]);

  useEffect(() => {
    if (config == null || !businessLine || activeBusinessLine) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('business_line');
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeBusinessLine, businessLine, config, searchParams, setSearchParams]);

  useEffect(() => {
    if (!didScrollRef.current) {
      didScrollRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [page]);

  const fetchCollections = useCallback(async () => {
    try {
      const response = await collectionsApi.getCollections();
      // Show every populated category
      const mainCollections = response.collections.filter((c: { product_count: number }) => c.product_count > 0);
      setCollections(mainCollections);
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const response = await locationsApi.getLocations();
      setLocations(response.locations || []);
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  }, []);

  const requestContext = JSON.stringify([locationId, activeBusinessLine, page, search, collection, productType, sort]);
  const fetchProducts = useCallback(async () => {
    const version = ++productRequest.current;
    try {
      setLoading(true);
      setError(null);
      const response = await productsApi.getProducts({
        page,
        per_page: 12,
        search: search || undefined,
        collection: collection || undefined,
        product_type: productType || undefined,
        sort: sort || undefined,
        location_id: locationId ? Number(locationId) : undefined,
        business_line: activeBusinessLine || undefined,
      });
      if (version !== productRequest.current) return;
      setProducts(response.products);
      setResultContext(requestContext);
      setMeta(response.meta);
      setAvailableProductTypes(response.meta.product_types || []);
      setError(null);
    } catch (err) {
      if (version === productRequest.current) setError('Failed to load products');
      console.error(err);
    } finally {
      if (version === productRequest.current) setLoading(false);
    }
  }, [activeBusinessLine, collection, locationId, page, productType, requestContext, search, sort]);

  useEffect(() => {
    void fetchCollections();
    void fetchLocations();
  }, [config, fetchCollections, fetchLocations]);

  useEffect(() => {
    void fetchProducts();
    return () => { productRequest.current += 1; };
  }, [config, fetchProducts]);

  const handleSearch = (value: string) => {
    const params: Record<string, string> = {};
    if (value) params.search = value;
    if (collection) params.collection = collection;
    if (productType) params.type = productType;
    if (sort) params.sort = sort;
    if (activeBusinessLine) params.business_line = activeBusinessLine;
    setSearchParams(params);
  };

  const handleFilterChange = (filterType: 'collection' | 'type' | 'sort' | 'location_id' | 'business_line', value: string) => {
    if (filterType === 'location_id') {
      const location = locations.find((item) => String(item.id) === value);
      if (location) {
        const next = new URLSearchParams(searchParams); next.delete('location_id');
        navigate(`/menu/${encodeURIComponent(location.slug)}?${next}`);
      }
      return;
    }
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (filterType === 'collection') {
      if (value) params.collection = value;
      if (productType) params.type = productType;
      if (sort) params.sort = sort;
      if (activeBusinessLine) params.business_line = activeBusinessLine;
    } else if (filterType === 'type') {
      if (collection) params.collection = collection;
      if (value) params.type = value;
      if (sort) params.sort = sort;
      if (activeBusinessLine) params.business_line = activeBusinessLine;
    } else if (filterType === 'sort') {
      if (collection) params.collection = collection;
      if (productType) params.type = productType;
      if (value) params.sort = value;
      if (activeBusinessLine) params.business_line = activeBusinessLine;
    } else if (filterType === 'business_line') {
      if (collection) params.collection = collection;
      if (productType) params.type = productType;
      if (sort) params.sort = sort;
      if (value) params.business_line = value;
    }
    setSearchParams(params);
  };

  useEffect(() => {
    if (pickupLocation || !requestedLocationId || locations.length === 0) return;
    const location = locations.find((item) => String(item.id) === requestedLocationId);
    if (!location) { navigate('/locations', { replace: true }); return; }
    const params = new URLSearchParams(searchParams);
    params.delete('location_id');
    navigate(`/menu/${encodeURIComponent(location.slug)}?${params}`, { replace: true });
  }, [pickupLocation, requestedLocationId, locations, searchParams, navigate]);

  const clearFilters = () => {
    setSearchParams({});
  };

  const handlePageChange = (newPage: number) => {
    const params: Record<string, string> = { page: newPage.toString() };
    if (search) params.search = search;
    if (collection) params.collection = collection;
    if (productType) params.type = productType;
    if (sort) params.sort = sort;
    if (activeBusinessLine) params.business_line = activeBusinessLine;
    setSearchParams(params);
  };

  const resultsLoading = !error && (loading || resultContext !== requestContext);
  const activeFilterCount = [search, collection, productType, sort, activeBusinessLine].filter(Boolean).length;

  // Show a retryable error when the menu request fails
  if (error) {
    return (
      <div className="min-h-screen bg-warm-50">
        {/* Header */}
        <div className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-warm-900 mb-2">
              {businessLineContent.title}
            </h1>
            <p className="text-warm-600 text-sm sm:text-base">
              {businessLineContent.subtitle}
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="mb-6"><svg className="w-16 h-16 mx-auto text-tsPrimary" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg></div>
            <h2 className="text-2xl font-bold text-warm-900 mb-4">Menu unavailable</h2>
            <p className="text-warm-600 mb-8">
              We could not load the menu. Please try again.
            </p>
            <Button
              onClick={fetchProducts}
              variant="primary"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(meta.total / meta.per_page);

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7">
        <h1 className="text-2xl sm:text-3xl font-bold text-warm-900">{businessLineContent.title}</h1>
        <p className="mt-1 text-sm text-warm-600">{businessLineContent.subtitle}</p>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Search and Filter Bar */}
        <div className="mb-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,260px)] sm:items-end">
            {/* Search Bar */}
            <div>
              <label htmlFor="menu-search" className="sr-only">Search menu</label>
              <div className="relative">
                <Input
                  type="text"
                  id="menu-search"
                  placeholder="Search menu..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Collection Filter */}
            {visibleCollections.length > 0 && (
              <div>
                <label htmlFor="menu-filter-collection" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Category</label>
                <Select
                  id="menu-filter-collection"
                  value={collection}
                  onChange={(e) => handleFilterChange('collection', e.target.value)}
                  className="w-full"
                >
                  <option value="">All categories</option>
                  {visibleCollections.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

          </div>

          <div className="mt-3 rounded-lg border border-warm-200 bg-white px-4"><Disclosure title={<>
              Filters and sort{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </>}>
            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pb-4">
              {/* Business Line Filter */}
              <div>
                <label htmlFor="menu-filter-business" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Menu</label>
                <Select
                  id="menu-filter-business"
                  value={activeBusinessLine}
                  onChange={(e) => handleFilterChange('business_line', e.target.value)}
                  className="w-full"
                >
                  <option value="">All menus</option>
                  {enabledStorefronts.map((storefront) => (
                    <option key={storefront.key} value={storefront.key}>
                      {storefront.label}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Product Type Filter */}
              {availableProductTypes.length > 0 && (
                <div>
                  <label htmlFor="menu-filter-type" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Item type</label>
                  <Select
                    id="menu-filter-type"
                    value={productType}
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                    className="w-full"
                  >
                    <option value="">All Types</option>
                    {availableProductTypes.map((type) => (
                      <option key={type} value={type}>
                        {productTypeLabel(type)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Sort Options */}
              <div>
                <label htmlFor="menu-filter-sort" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Sort By</label>
                <Select
                  id="menu-filter-sort"
                  value={sort}
                  onChange={(e) => handleFilterChange('sort', e.target.value)}
                  className="w-full"
                >
                  <option value="">Featured</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="newest">Newest First</option>
                  <option value="name_asc">Name: A-Z</option>
                  <option value="name_desc">Name: Z-A</option>
                </Select>
              </div>

              {/* Pickup Location Filter */}
              {!pickupLocation && <div>
                <label htmlFor="menu-filter-pickup" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Pickup Location</label>
                <Select
                  id="menu-filter-pickup"
                  value={locationId}
                  onChange={(e) => handleFilterChange('location_id', e.target.value)}
                  className="w-full"
                >
                  <option value="" disabled>Choose pickup location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id.toString()}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </div>}

              {/* Clear Filters Button */}
              <div className="flex items-end">
                <Button
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                  className="w-full" variant="secondary"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reset filters
                </Button>
              </div>
            </div>

          </Disclosure></div>

          {/* Active Filters Display */}
          {(search || collection || productType || sort || activeBusinessLine) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-warm-600 font-medium">Active filters:</span>
              {search && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">Search: "{search}"</span>
                  <IconButton
                    onClick={() => handleSearch('')}
                    aria-label="Remove search filter"
                    variant="ghost" surface="dark"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                </span>
              )}
              {collection && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">{visibleCollections.find(c => c.slug === collection)?.name || collections.find(c => c.slug === collection)?.name}</span>
                  <IconButton
                    onClick={() => handleFilterChange('collection', '')}
                    aria-label="Remove collection filter"
                    variant="ghost" surface="dark"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                </span>
              )}
              {businessLine && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">
                    Menu: {activeBusinessLine === 'three_squares' ? 'Three Squares' : activeBusinessLine === 'latte_stone' ? 'Latte Stone Cookies' : 'Catering'}
                  </span>
                  <IconButton
                    onClick={() => handleFilterChange('business_line', '')}
                    aria-label="Remove menu filter"
                    variant="ghost" surface="dark"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                </span>
              )}
              {productType && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">{productTypeLabel(productType)}</span>
                  <IconButton
                    onClick={() => handleFilterChange('type', '')}
                    aria-label="Remove product type filter"
                    variant="ghost" surface="dark"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                </span>
              )}
              {sort && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">Sort: {sort === 'price_asc' ? 'Price ↑' : sort === 'price_desc' ? 'Price ↓' : sort === 'newest' ? 'Newest' : sort === 'name_asc' ? 'A-Z' : 'Z-A'}</span>
                  <IconButton
                    onClick={() => handleFilterChange('sort', '')}
                    aria-label="Remove sort filter"
                    variant="ghost" surface="dark"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                </span>
              )}

            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-warm-600 text-sm sm:text-base">
            {resultsLoading ? 'Loading menu…' : <><span className="font-semibold text-warm-900">{meta.total}</span> {meta.total === 1 ? 'item' : 'items'}</>}
            {(search || collection || productType || activeBusinessLine) && (
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
        {resultsLoading ? <div role="status" aria-label="Loading menu"><ProductGridSkeleton count={12} /></div> : products.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-warm-100">
            <div className="mb-4"><svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></div>
            <p className="text-warm-700 text-lg font-medium mb-2">No products found</p>
            <p className="text-warm-500 mb-6">Try adjusting your search or filters</p>
            {search && (
              <Button
                onClick={() => handleSearch('')}
                variant="primary"
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6 lg:gap-8 mb-8">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} locationNameById={locationNameById} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3">
                <Button
                  aria-label="Previous page"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  variant="secondary"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="hidden sm:inline">Previous</span>
                </Button>

                <div className="contents">
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
                      <IconButton
                        key={pageNum}
                        aria-label={`Page ${pageNum}`}
                        aria-current={page === pageNum ? 'page' : undefined}
                        onClick={() => handlePageChange(pageNum)}
                        variant={page === pageNum ? 'primary' : 'secondary'}
                      >
                        {pageNum}
                      </IconButton>
                    );
                  })}
                </div>

                <Button
                  aria-label="Next page"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  variant="secondary"
                >
                  <span className="hidden sm:inline">Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
