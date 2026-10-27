import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Phone, ChevronRight } from 'lucide-react';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import useAppConfig from '../hooks/useAppConfig';
import { locationsApi, type Location as ApiLocation } from '../services/api';
import { isStorefrontEnabled } from '../utils/storefronts';

function formatHours(hoursJson?: Record<string, string>) {
  if (!hoursJson || Object.keys(hoursJson).length === 0) {
    return [ { days: 'Hours', time: 'Call for current pickup availability' } ];
  }

  return Object.entries(hoursJson).map(([days, time]) => ({
    days,
    time,
  }));
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const config = useAppConfig();
  const cateringEnabled = isStorefrontEnabled(config, 'catering');

  useEffect(() => {
    const loadLocations = async () => {
      try {
        setLoading(true);
        const response = await locationsApi.getLocations();
        setLocations(response.locations || []);
        setError(null);
      } catch (err) {
        console.error('Failed to load locations:', err);
        setError('Unable to load locations right now.');
      } finally {
        setLoading(false);
      }
    };

    void loadLocations();
  }, []);

  const locationCards = useMemo(
    () => locations.map((location) => ({ ...location, hours: formatHours(location.hours_json) })),
    [locations]
  );

  return (
    <div className="min-h-screen bg-warm-50">
      <section className="relative bg-gray-900 text-white py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0">
          <img src="/images/catering4.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/72" />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(139,69,19,0.28) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.62) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <span className="inline-block px-5 py-2 bg-black/35 backdrop-blur-sm border border-white/30 text-sm font-semibold rounded-full mb-6 text-white shadow-lg">
              Visit Us Today
            </span>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 tracking-tight text-white">
              Our Locations
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-lg sm:text-xl text-white max-w-2xl mx-auto leading-relaxed">
              Browse the active pickup locations managed in admin and check each store&apos;s current order hours.
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="bg-white rounded-2xl border border-warm-100 shadow-sm p-8 text-center text-warm-600">
              Loading locations...
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center text-red-700">
              {error}
            </div>
          ) : locationCards.length === 0 ? (
            <div className="bg-white rounded-2xl border border-warm-100 shadow-sm p-8 text-center text-warm-600">
              No active pickup locations are available right now.
            </div>
          ) : (
            <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {locationCards.map((location) => (
                <StaggerItem key={location.id}>
                  <LocationCard location={location} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </section>

      {cateringEnabled && (
        <section className="py-16 sm:py-24 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <FadeIn>
              <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 mb-6 tracking-tight">
                Catering Inquiries
              </h2>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p className="text-warm-600 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
                Planning an event? B&G Pacific provides professional catering services for corporate events, weddings,
                parties, and more. We&apos;re HUBZone certified.
              </p>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/catering?inquiry=true"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-warm-600 text-white rounded-xl font-medium text-lg hover:bg-warm-700 transition-all duration-200 hover:-translate-y-0.5"
                >
                  Request a Quote
                </Link>
                <a
                  href="tel:+16716462652"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-warm-700 border-2 border-warm-600 rounded-xl font-medium text-lg hover:bg-warm-50 transition-all duration-200 hover:-translate-y-0.5"
                >
                  <Phone className="w-5 h-5" />
                  Call (671) 646-2652
                </a>
              </div>
            </FadeIn>
          </div>
        </section>
      )}
    </div>
  );
}

function LocationCard({
  location,
}: {
  location: ApiLocation & { hours: Array<{ days: string; time: string }> };
}) {
  const mapQuery = encodeURIComponent(location.address || location.name);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-warm-100 h-full flex flex-col">
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-warm-900 via-warm-700 to-tsPrimary text-white">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_white,_transparent_45%)]" />
        <div className="relative h-full p-6 flex flex-col justify-end">
          <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 mb-3">
            Pickup Location
          </span>
          <h2 className="text-2xl font-bold">{location.name}</h2>
          <p className="text-sm text-white/85 mt-1">Managed live from the admin location roster</p>
        </div>
      </div>

      <div className="p-6 sm:p-8 flex-1 flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
          <div>
            <p className="text-warm-700">{location.address || 'Address coming soon'}</p>
            {location.address && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-tsPrimary hover:text-primary-dark text-sm font-medium mt-1 transition-colors"
              >
                Get Directions
                <ChevronRight className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
          <div className="space-y-1">
            {location.hours.map((schedule) => (
              <p key={`${location.id}-${schedule.days}`} className="text-warm-700">
                <span className="font-medium">{schedule.days}:</span> {schedule.time}
              </p>
            ))}
          </div>
        </div>

        {location.phone && (
          <div className="flex items-start gap-3 mt-auto pt-4 border-t border-warm-100">
            <Phone className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
            <a
              href={`tel:+1${location.phone.replace(/\D/g, '')}`}
              className="text-warm-700 hover:text-tsPrimary transition-colors"
            >
              {location.phone}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
