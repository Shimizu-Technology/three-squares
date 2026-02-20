import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { collectionsApi } from '../services/api';
import type { Collection } from '../services/api';
import FadeIn from './animations/FadeIn';
import { StaggerContainer, StaggerItem } from './animations/StaggerContainer';
import OptimizedImage from './ui/OptimizedImage';

function getCountdownText(endsAt?: string | null): string | null {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 7) return days === 1 ? 'Ends tomorrow!' : `Ends in ${days} days!`;
  return null;
}

function formatDateRange(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt && !endsAt) return null;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = startsAt ? new Date(startsAt).toLocaleDateString(undefined, opts) : null;
  const end = endsAt ? new Date(endsAt).toLocaleDateString(undefined, opts) : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return null;
}

export default function FeaturedSpecials() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const data = await collectionsApi.getCollections({
          featured: true,
          per_page: 6,
        });
        // Filter to only non-standard collections that are featured
        const specials = data.collections.filter(
          (c) => c.is_featured && c.collection_type && c.collection_type !== 'standard'
        );
        setCollections(specials);
      } catch {
        // Silently fail — this is an optional section
      } finally {
        setLoading(false);
      }
    };

    fetchFeatured();
  }, []);

  if (loading || collections.length === 0) return null;

  return (
    <section className="py-16 sm:py-20 bg-gradient-to-b from-warm-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">
              🔥 Featured Specials
            </h2>
            <p className="mt-3 text-warm-600 max-w-2xl mx-auto">
              Limited-time offerings and seasonal favorites — don&apos;t miss out!
            </p>
            <div className="w-12 h-1 bg-tsGold rounded-full mx-auto mt-6" />
          </div>
        </FadeIn>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map((collection) => {
            const countdown = getCountdownText(collection.ends_at);
            const dateRange = formatDateRange(collection.starts_at, collection.ends_at);

            return (
              <StaggerItem key={collection.id}>
                <Link
                  to={`/collections/${collection.slug}`}
                  className="group block overflow-hidden rounded-2xl border-2 border-tsGold/30 bg-white shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="relative h-44 sm:h-48">
                    {collection.thumbnail_url ? (
                      <OptimizedImage
                        src={collection.thumbnail_url}
                        alt={collection.name}
                        context="card"
                        className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-warm-200 flex items-center justify-center">
                        <span className="text-4xl">🍽️</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    {countdown && (
                      <div className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse shadow-lg">
                        {countdown}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-warm-900 mb-1 group-hover:text-tsPrimary transition-colors">
                      {collection.name}
                    </h3>
                    {collection.banner_text && (
                      <p className="text-sm font-medium text-tsPrimary mb-2">
                        {collection.banner_text}
                      </p>
                    )}
                    {collection.description && (
                      <p className="text-sm text-warm-500 mb-3 line-clamp-2">
                        {collection.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {dateRange && (
                          <span className="text-xs text-warm-500 bg-warm-100 px-2 py-0.5 rounded">
                            {dateRange}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-tsPrimary font-semibold text-sm">
                        Order Now
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
