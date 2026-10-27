import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import type { Collection, Product, Location } from '../services/api';
import { productsApi, collectionsApi, locationsApi } from '../services/api';
import { useLocationStore } from '../store/locationStore';
import ProductCard from '../components/ProductCard';
import FadeIn from '../components/animations/FadeIn';
import { PageHeaderSkeleton, ProductGridSkeleton } from '../components/Skeleton';
import useAppConfig from '../hooks/useAppConfig';
import { STOREFRONTS, isStorefrontEnabled, type StorefrontKey } from '../utils/storefronts';

interface PickupLocation {
  id: number;
  name: string;
  slug: string;
}

const storefrontThemes: Partial<Record<StorefrontKey, {
  image: string;
  surfaceClass: string;
  badgeClass: string;
  accentClass: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryAction?: { label: string; to: string };
  secondaryAction?: { label: string; to: string };
}>> = {
  three_squares: {
    image: '/images/plated1.jpg',
    surfaceClass: 'bg-white',
    badgeClass: 'bg-warm-100 text-warm-700 border border-warm-200',
    accentClass: 'text-tsPrimary',
    eyebrow: 'Three Squares',
    title: 'Three Squares Menu',
    subtitle: 'Island comfort food, local favorites, and daily essentials for pickup.',
    primaryAction: { label: 'Find a Location', to: '/locations' },
    secondaryAction: { label: 'About Three Squares', to: '/about' },
  },
  latte_stone: {
    image: '/images/IMG-4158.jpg',
    surfaceClass: 'bg-white',
    badgeClass: 'bg-tsPrimary/8 text-tsPrimary border border-tsPrimary/15',
    accentClass: 'text-tsPrimary',
    eyebrow: 'Latte Stone Cookies',
    title: 'Latte Stone Cookie Shop',
    subtitle: 'Cookie boxes, gifting assortments, and small-batch favorites for pickup or shipping.',
    primaryAction: { label: 'Browse Gift Boxes', to: '/products?business_line=latte_stone&collection=cookie-boxes' },
    secondaryAction: { label: 'Shipping Info', to: '/shipping' },
  },
  catering: {
    image: '/images/Cocktail_Stations_-_Assorted_Poppers.jpg',
    surfaceClass: 'bg-white',
    badgeClass: 'bg-tsGold/15 text-warm-800 border border-tsGold/30',
    accentClass: 'text-tsPrimary',
    eyebrow: 'Catering',
    title: 'Catering Menu',
    subtitle: 'Party trays, bentos, and event-ready packages for office lunches, fiestas, and large events.',
    primaryAction: { label: 'Request a Quote', to: '/catering?inquiry=true' },
    secondaryAction: { label: 'Back to Catering Overview', to: '/catering' },
  },
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
  const userLocationId = pickupLocation ? '' : locationId;
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
  const storefrontTheme = activeBusinessLine
    ? storefrontThemes[activeBusinessLine as StorefrontKey] ?? null
    : null;
  const businessLineContent = (() => {
    if (storefrontTheme) {
      return {
        eyebrow: storefrontTheme.eyebrow,
        title: storefrontTheme.title,
        subtitle: storefrontTheme.subtitle,
      };
    }

    if (activeBusinessLine === 'three_squares') {
      return {
        eyebrow: 'Three Squares',
        title: 'Three Squares Menu',
        subtitle: 'Island comfort food, local favorites, and daily essentials for pickup.',
      };
    }
    if (activeBusinessLine === 'latte_stone') {
      return {
        eyebrow: 'Latte Stone Cookies',
        title: 'Latte Stone Cookie Shop',
        subtitle: 'Cookie boxes and gifting picks with shipping and pickup availability.',
      };
    }
    if (activeBusinessLine === 'catering') {
      return {
        eyebrow: 'Catering',
        title: 'Catering Menu',
        subtitle: 'Party trays, bentos, and event-ready packages for your next gathering.',
      };
    }

    return {
      eyebrow: 'All Businesses',
      title: pickupLocation ? `${pickupLocation.name} Menu` : 'Browse Menu',
      subtitle: pickupLocation?.address || 'Guam comfort food favorites and island-made specialties.',
    };
  })();
  const visibleCollections = useMemo(() => {
    if (!activeBusinessLine) {
      return collections;
    }

    return collections.filter((item) => item.business_line === activeBusinessLine);
  }, [activeBusinessLine, collections]);
  const [availableProductTypes, setAvailableProductTypes] = useState<string[]>([]);
  const businessLineOptions = [
    { label: 'All', value: '' },
    ...enabledStorefronts.map((storefront) => ({
      label: storefront.label,
      value: storefront.key,
    })),
  ];

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const fetchCollections = useCallback(async () => {
    try {
      const response = await collectionsApi.getCollections();
      // Only show collections with 5+ products
      const mainCollections = response.collections.filter((c: { product_count: number }) => c.product_count >= 5);
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

  if (!error && (loading || resultContext !== requestContext)) {
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

  // Show a retryable error when the menu request fails
  if (error) {
    return (
      <div className="min-h-screen bg-warm-50">
        {/* Header */}
        <div className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-warm-900 mb-2">
              Shop <span className="text-tsPrimary">{businessLineContent.eyebrow}</span>
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
      {storefrontTheme ? (
        <section className={`border-b border-warm-200 ${storefrontTheme.surfaceClass}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
            <FadeIn>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                <div>
                  <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${storefrontTheme.badgeClass}`}>
                    {businessLineContent.eyebrow}
                  </p>
                  <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.7rem] font-bold tracking-tight text-warm-900">
                    {businessLineContent.title}
                  </h1>
                  <p className="mt-3 text-base sm:text-lg max-w-2xl text-warm-600 leading-relaxed">
                    {businessLineContent.subtitle}
                  </p>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    {storefrontTheme.primaryAction && (
                      <Link
                        to={storefrontTheme.primaryAction.to}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-tsPrimary px-6 py-3 font-semibold text-white hover:bg-primary-dark transition"
                      >
                        {storefrontTheme.primaryAction.label}
                      </Link>
                    )}
                    {storefrontTheme.secondaryAction && (
                      <Link
                        to={storefrontTheme.secondaryAction.to}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-warm-200 bg-white px-6 py-3 font-semibold text-warm-700 hover:bg-warm-50 transition"
                      >
                        {storefrontTheme.secondaryAction.label}
                      </Link>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-warm-500">
                    <span className="inline-flex items-center gap-2 rounded-full bg-warm-100 px-3 py-1.5">
                      <span className={`font-semibold ${storefrontTheme.accentClass}`}>{meta.total}</span>
                      items available
                    </span>
                    {visibleCollections.length > 0 && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-warm-100 px-3 py-1.5">
                        <span className={`font-semibold ${storefrontTheme.accentClass}`}>{visibleCollections.length}</span>
                        collections
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden lg:block">
                  <div className="overflow-hidden rounded-2xl border border-warm-200 shadow-sm bg-warm-100">
                    <img
                      src={storefrontTheme.image}
                      alt=""
                      className="h-52 w-full object-cover"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>
      ) : (
        <div className="bg-warm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <FadeIn>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-warm-500 mb-2">
                  {businessLineContent.eyebrow}
                </p>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-warm-900 mb-3 tracking-tight">
                  {businessLineContent.title}
                </h1>
                <p className="text-warm-500 text-base sm:text-lg max-w-2xl mx-auto">
                  {businessLineContent.subtitle}
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-warm-100 p-4 sm:p-6 mb-6">
          <div className="mb-4">
            <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">Shop by Business</p>
            <div className="overflow-x-auto pb-1 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
              <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              {businessLineOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => handleFilterChange('business_line', option.value)}
                  aria-pressed={activeBusinessLine === option.value}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm border transition ${
                    activeBusinessLine === option.value
                      ? 'bg-tsPrimary text-white border-tsPrimary'
                      : 'bg-warm-50 text-warm-700 border-warm-200 hover:border-warm-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative max-w-2xl mx-auto">
              <input
                type="text"
                id="menu-search"
                aria-label="Search products"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* Business Line Filter */}
            <div>
              <label htmlFor="menu-filter-business" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Business</label>
              <select
                id="menu-filter-business"
                value={activeBusinessLine}
                onChange={(e) => handleFilterChange('business_line', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
              >
                <option value="">All Businesses</option>
                {enabledStorefronts.map((storefront) => (
                  <option key={storefront.key} value={storefront.key}>
                    {storefront.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Collection Filter */}
            {visibleCollections.length > 0 && (
              <div>
                <label htmlFor="menu-filter-collection" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Collection</label>
                <select
                  id="menu-filter-collection"
                  value={collection}
                  onChange={(e) => handleFilterChange('collection', e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
                >
                  <option value="">All Collections</option>
                  {visibleCollections.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Product Type Filter */}
            {availableProductTypes.length > 0 && (
              <div>
                <label htmlFor="menu-filter-type" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Product Type</label>
                <select
                  id="menu-filter-type"
                  value={productType}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
                >
                  <option value="">All Types</option>
                  {availableProductTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Options */}
            <div>
              <label htmlFor="menu-filter-sort" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Sort By</label>
              <select
                id="menu-filter-sort"
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
            {!pickupLocation && <div>
              <label htmlFor="menu-filter-pickup" className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Pickup Location</label>
              <select
                id="menu-filter-pickup"
                value={locationId}
                onChange={(e) => handleFilterChange('location_id', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-warm-50 border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-warm-300 transition"
              >
                <option value="" disabled>Choose pickup location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id.toString()}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>}

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                disabled={!search && !collection && !productType && !sort && !userLocationId && !businessLine}
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
          {(search || collection || productType || sort || userLocationId || businessLine) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-warm-600 font-medium">Active filters:</span>
              {search && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">Search: "{search}"</span>
                  <button
                    onClick={() => handleSearch('')}
                    aria-label="Remove search filter"
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {collection && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">{visibleCollections.find(c => c.slug === collection)?.name || collections.find(c => c.slug === collection)?.name}</span>
                  <button
                    onClick={() => handleFilterChange('collection', '')}
                    aria-label="Remove collection filter"
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {businessLine && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">
                    Business: {activeBusinessLine === 'three_squares' ? 'Three Squares' : activeBusinessLine === 'latte_stone' ? 'Latte Stone Cookies' : 'Catering'}
                  </span>
                  <button
                    onClick={() => handleFilterChange('business_line', '')}
                    aria-label="Remove business filter"
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {productType && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">{productType}</span>
                  <button
                    onClick={() => handleFilterChange('type', '')}
                    aria-label="Remove product type filter"
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {sort && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">Sort: {sort === 'price_asc' ? 'Price ↑' : sort === 'price_desc' ? 'Price ↓' : sort === 'newest' ? 'Newest' : sort === 'name_asc' ? 'A-Z' : 'Z-A'}</span>
                  <button
                    onClick={() => handleFilterChange('sort', '')}
                    aria-label="Remove sort filter"
                    className="hover:bg-warm-700 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {userLocationId && (
                <span className="inline-flex max-w-full items-center gap-1.5 px-3 py-1 bg-warm-900 text-white text-sm rounded-full">
                  <span className="truncate max-w-[220px] sm:max-w-[280px]">Pickup: {locations.find((location) => location.id.toString() === userLocationId)?.name || 'Location'}</span>
                  <button
                    onClick={() => handleFilterChange('location_id', '')}
                    aria-label="Remove pickup location filter"
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
            {(search || collection || productType || userLocationId || businessLine) && (
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
                <ProductCard key={product.id} product={product} locationNameById={locationNameById} />
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
                        className={`min-w-[44px] min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg transition ${
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
