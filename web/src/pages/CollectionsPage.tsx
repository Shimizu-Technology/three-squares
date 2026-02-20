import axios from 'axios';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { collectionsApi } from '../services/api';
import type { Collection as ApiCollection } from '../services/api';
import { CollectionCardSkeleton, PageHeaderSkeleton } from '../components/Skeleton';
import FadeIn from '../components/animations/FadeIn';
import OptimizedImage from '../components/ui/OptimizedImage';

type Collection = ApiCollection;

interface Meta {
  page: number;
  per_page: number;
  total: number;
}

const COLLECTION_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  seasonal: { label: '🍂 Seasonal', className: 'bg-orange-100 text-orange-700' },
  event: { label: '🎉 Event Special', className: 'bg-purple-100 text-purple-700' },
  limited_time: { label: '⏰ Limited Time', className: 'bg-red-100 text-red-700' },
};

function formatDateRange(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt && !endsAt) return null;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = startsAt ? new Date(startsAt).toLocaleDateString(undefined, opts) : null;
  const end = endsAt ? new Date(endsAt).toLocaleDateString(undefined, opts) : null;
  if (start && end) return `Available ${start} – ${end}`;
  if (start) return `Available from ${start}`;
  if (end) return `Available until ${end}`;
  return null;
}

function getCountdownText(endsAt?: string | null): string | null {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 7) return days === 1 ? 'Ends tomorrow!' : `Ends in ${days} days!`;
  return null;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState(''); // For controlled input
  const didScrollRef = useRef(false);

  useEffect(() => {
    fetchCollections();
  }, [currentPage, searchQuery]);

  useEffect(() => {
    if (!didScrollRef.current) {
      didScrollRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await collectionsApi.getCollections({
        page: currentPage,
        per_page: 12,
        search: searchQuery || undefined,
      });
      setCollections(data.collections);
      setMeta(data.meta);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to load collections' : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setCurrentPage(1); // Reset to page 1 on new search
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="relative bg-warm-100 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-ts-surface)_0%,transparent_50%)] opacity-60" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
            <PageHeaderSkeleton />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <CollectionCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show empty state for errors or no collections
  if (error || (collections.length === 0 && !searchQuery)) {
    return (
      <div className="min-h-screen bg-warm-50">
        {/* Header */}
        <div className="relative bg-warm-100 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-ts-surface)_0%,transparent_50%)] opacity-60" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">Collections</h1>
            <p className="text-lg text-warm-500 max-w-2xl">
              Browse our curated collections of Chamorro pride apparel and merchandise
            </p>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="mb-6"><svg className="w-16 h-16 mx-auto text-warm-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" /></svg></div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Collections Coming Soon!</h2>
            <p className="text-gray-600 mb-8">
              We're organizing our products into beautiful collections. 
              Check back soon to browse by category!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={fetchCollections}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Refresh
              </button>
              <Link
                to="/products"
                className="px-6 py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition inline-block"
              >
                Browse All Products
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = meta ? Math.ceil(meta.total / meta.per_page) : 1;

  // Separate featured collection for hero spotlight
  const featuredCollection = collections.find((c) => c.featured);
  const regularCollections = collections.filter((c) => c !== featuredCollection);

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Themed Header */}
      <div className="relative bg-warm-100 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-ts-surface)_0%,transparent_50%)] opacity-60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <FadeIn>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              Collections
            </h1>
            <p className="text-lg sm:text-xl text-warm-500 max-w-2xl">
              Browse our curated collections of Chamorro pride apparel and merchandise
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Featured Collection Hero */}
      {featuredCollection && !searchQuery && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10 mb-4">
          <FadeIn delay={0.15}>
            <Link
              to={`/collections/${featuredCollection.slug}`}
              className="group block bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="aspect-4/3 md:aspect-auto bg-warm-100 relative overflow-hidden">
                  {featuredCollection.thumbnail_url ? (
                    <OptimizedImage
                      src={featuredCollection.thumbnail_url}
                      alt={featuredCollection.name}
                      context="hero"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center min-h-[240px]">
                      <svg className="w-24 h-24 text-warm-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
                  <span className="inline-flex items-center gap-1.5 bg-tsGold/20 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider w-fit mb-4">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Featured Collection
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-3 group-hover:text-tsPrimary transition-colors">
                    {featuredCollection.name}
                  </h2>
                  {featuredCollection.description && (
                    <p className="text-warm-500 mb-4 line-clamp-3">{featuredCollection.description}</p>
                  )}
                  {featuredCollection.banner_text && (
                    <p className="text-sm font-semibold text-tsPrimary mb-3">{featuredCollection.banner_text}</p>
                  )}
                  {(() => {
                    const dateRange = formatDateRange(featuredCollection.starts_at, featuredCollection.ends_at);
                    const countdown = getCountdownText(featuredCollection.ends_at);
                    return (dateRange || countdown) ? (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {dateRange && <span className="text-xs text-warm-500 bg-warm-100 px-2 py-0.5 rounded">{dateRange}</span>}
                        {countdown && <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded animate-pulse">{countdown}</span>}
                      </div>
                    ) : null;
                  })()}
                  <p className="text-sm text-warm-400">
                    {featuredCollection.product_count} {featuredCollection.product_count === 1 ? 'product' : 'products'}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-tsPrimary font-semibold group-hover:gap-3 transition-all">
                    Shop Collection
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          </FadeIn>
        </div>
      )}

      {/* Search Bar */}
      <div className="border-b border-warm-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search collections..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-warm-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent transition"
              />
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-warm-400"
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
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="px-6 py-2 bg-warm-200 text-warm-700 rounded-lg hover:bg-warm-300 transition"
              >
                Clear
              </button>
            )}
          </form>
          {searchQuery && (
            <p className="text-sm text-warm-500 mt-3">
              Showing {meta?.total || 0} result{meta?.total !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Collections Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <CollectionCardSkeleton key={i} />
            ))}
          </div>
        ) : (searchQuery ? collections : regularCollections).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-warm-500 mb-4">
              {searchQuery ? `No collections found for "${searchQuery}"` : 'No collections found'}
            </p>
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Section heading for remaining collections */}
            {featuredCollection && !searchQuery && regularCollections.length > 0 && (
              <FadeIn>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-6">
                  All Collections
                </h2>
              </FadeIn>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mb-8">
              {(searchQuery ? collections : regularCollections).map((collection) => (
                <Link
                  key={collection.id}
                  to={`/collections/${collection.slug}`}
                  className="group bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 block border border-warm-100"
                >
                  {/* Thumbnail */}
                  <div className="aspect-4/3 bg-warm-100 relative overflow-hidden">
                    {collection.thumbnail_url ? (
                      <OptimizedImage
                        src={collection.thumbnail_url}
                        alt={collection.name}
                        context="card"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          className="w-20 h-20 text-warm-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
                      {collection.featured && (
                        <span className="inline-flex items-center gap-1 bg-tsGold text-gray-900 px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          Featured
                        </span>
                      )}
                      {collection.collection_type && COLLECTION_TYPE_BADGES[collection.collection_type] && (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-lg ${COLLECTION_TYPE_BADGES[collection.collection_type].className}`}>
                          {COLLECTION_TYPE_BADGES[collection.collection_type].label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Collection Info */}
                  <div className="p-5 sm:p-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 group-hover:text-tsPrimary transition-colors">
                      {collection.name}
                    </h3>
                    {collection.description && (
                      <p className="text-sm text-warm-500 mb-3 line-clamp-2">
                        {collection.description}
                      </p>
                    )}
                    {collection.banner_text && (
                      <p className="text-sm font-medium text-tsPrimary mb-2">{collection.banner_text}</p>
                    )}
                    {(() => {
                      const dateRange = formatDateRange(collection.starts_at, collection.ends_at);
                      const countdown = getCountdownText(collection.ends_at);
                      return (dateRange || countdown) ? (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {dateRange && <span className="text-xs text-warm-500 bg-warm-100 px-2 py-0.5 rounded">{dateRange}</span>}
                          {countdown && <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded animate-pulse">{countdown}</span>}
                        </div>
                      ) : null;
                    })()}
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-warm-400">
                        {collection.product_count} {collection.product_count === 1 ? 'product' : 'products'}
                      </p>
                      <span className="text-tsPrimary opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium flex items-center gap-1">
                        Browse
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-1 sm:gap-2 flex-wrap">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Prev</span>
                </button>
                
                <div className="flex gap-1 sm:gap-2">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg ${
                          currentPage === pageNum
                            ? 'bg-tsPrimary text-white'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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

