import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Calendar, ArrowRight } from 'lucide-react';
import api, { configApi } from '../services/api';
import { FundraiserCardSkeleton } from '../components/Skeleton';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import type { AppConfig } from '../types/order';

interface Fundraiser {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  goal_amount_cents: number | null;
  raised_amount_cents: number | null;
  progress_percentage: number;
  is_active: boolean;
  is_ended: boolean;
  product_count: number;
  participant_count: number;
}

export default function FundraisersListPage() {
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    loadFundraisers();
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';

  const loadFundraisers = async () => {
    try {
      const response = await api.get('/fundraisers');
      setFundraisers(response.data.fundraisers || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load fundraisers');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="bg-white border-b border-warm-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <div className="text-center">
              <div className="animate-pulse bg-warm-200 rounded-full w-16 h-16 mx-auto mb-6" />
              <div className="animate-pulse bg-warm-200 h-10 w-72 mx-auto mb-4 rounded-lg" />
              <div className="animate-pulse bg-warm-200 h-5 w-96 mx-auto rounded-lg" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <FundraiserCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadFundraisers}
            className="text-tsPrimary hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const activeFundraisers = fundraisers.filter(f => f.is_active && !f.is_ended);
  const endedFundraisers = fundraisers.filter(f => f.is_ended);

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Hero Section */}
      <div className="bg-white border-b border-warm-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <FadeIn>
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-tsPrimary/10 mb-6">
                <Heart className="w-8 h-8 text-tsPrimary" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-warm-900 mb-4">
                Support Our Fundraisers
              </h1>
              <p className="text-lg text-warm-500">
                Help support local teams, schools, and organizations by purchasing 
                Three Squares menu items. A portion of every sale goes directly to the cause.
              </p>
            </div>
          </FadeIn>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Active Fundraisers */}
        {activeFundraisers.length > 0 ? (
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-warm-900 mb-6 flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></span>
              Active Fundraisers
            </h2>
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeFundraisers.map((fundraiser) => (
                <StaggerItem key={fundraiser.id}>
                <Link
                  to={`/fundraisers/${fundraiser.slug}`}
                  className="group bg-white rounded-xl shadow-sm border border-warm-200 overflow-hidden hover:shadow-lg hover:border-tsPrimary/30 transition-all duration-300 block"
                >
                  {/* Image or Placeholder */}
                  <div className="aspect-video bg-linear-to-br from-tsPrimary/10 to-tsPrimary/5 relative overflow-hidden">
                    {fundraiser.image_url ? (
                      <img
                        src={fundraiser.image_url}
                        alt={fundraiser.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Heart className="w-16 h-16 text-tsPrimary/30" />
                      </div>
                    )}
                    {/* Active Badge */}
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-warm-900 group-hover:text-tsPrimary transition-colors mb-2">
                      {fundraiser.name}
                    </h3>
                    
                    {fundraiser.description && (
                      <p className="text-warm-600 text-sm mb-4 line-clamp-2">
                        {fundraiser.description}
                      </p>
                    )}

                    {/* Progress Bar (if goal exists) */}
                    {fundraiser.goal_amount_cents && fundraiser.goal_amount_cents > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-warm-600">
                            {formatPrice(fundraiser.raised_amount_cents || 0)} raised
                          </span>
                          <span className="text-warm-500">
                            {formatPrice(fundraiser.goal_amount_cents)} goal
                          </span>
                        </div>
                        <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-tsPrimary rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(fundraiser.progress_percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="flex items-center justify-between text-sm text-warm-500">
                      <div className="flex items-center space-x-4">
                        {fundraiser.end_date && (
                          <span className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            Ends {formatDate(fundraiser.end_date)}
                          </span>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-tsPrimary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>
        ) : (
          <section className="mb-16">
            <div className="text-center py-16 bg-white rounded-xl border border-warm-200">
              <Heart className="w-16 h-16 text-warm-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-warm-900 mb-2">
                No Active Fundraisers
              </h2>
              <p className="text-warm-600 max-w-md mx-auto">
                Check back soon! New fundraisers are added regularly to support 
                local teams and organizations.
              </p>
            </div>
          </section>
        )}

        {/* Ended Fundraisers */}
        {endedFundraisers.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-warm-700 mb-4">
              Past Fundraisers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {endedFundraisers.map((fundraiser) => (
                <div
                  key={fundraiser.id}
                  className="bg-white rounded-lg border border-warm-200 p-4 opacity-75"
                >
                  <h3 className="font-medium text-warm-700 mb-1">{fundraiser.name}</h3>
                  <p className="text-sm text-warm-500">
                    Ended {formatDate(fundraiser.end_date)}
                  </p>
                  {fundraiser.goal_amount_cents && fundraiser.raised_amount_cents && (
                    <p className="text-sm text-green-600 mt-2">
                      Raised {formatPrice(fundraiser.raised_amount_cents)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA for Organizations */}
        <section className="mt-16">
          <div className="bg-linear-to-r from-tsPrimary to-tsPrimary/90 rounded-2xl p-8 sm:p-12 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Want to Start a Fundraiser?
            </h2>
            <p className="text-white/90 max-w-2xl mx-auto mb-6">
              Partner with Three Squares to raise funds for your team, school, or organization. 
              We'll help you set up a custom fundraising page with exclusive merchandise.
            </p>
            <a
              href={`mailto:${storeEmail}?subject=Fundraiser Inquiry`}
              className="group inline-flex items-center px-6 py-3 bg-white text-tsPrimary font-semibold rounded-lg hover:bg-warm-100 transition-colors"
            >
              Contact Us
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
