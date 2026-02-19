import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Phone, MessageCircle, ChevronRight, Calendar } from 'lucide-react';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import { locationsApi } from '../services/api';
import type { Location as ApiLocation } from '../services/api';

interface Location {
  name: string;
  address: string;
  mapAddress: string;
  hours: {
    days: string;
    time: string;
  }[];
  phone?: string;
  whatsapp?: string;
  image: string;
  featured?: boolean;
  note?: string;
}

const locations: Location[] = [
  {
    name: 'Three Squares Main',
    address: '416 Chalan San Antonio, Tamuning, GU 96913',
    mapAddress: '416+Chalan+San+Antonio,+Tamuning,+GU+96913',
    hours: [
      { days: 'Tuesday - Saturday', time: '8:00 AM - 8:00 PM' },
      { days: 'Sunday', time: '8:00 AM - 5:00 PM' },
      { days: 'Monday', time: 'Closed' },
    ],
    phone: '(671) 646-2652',
    whatsapp: '(671) 864-6656',
    image: '/images/plated1.jpg',
    featured: true,
  },
  {
    name: 'Three Squares @ Donki',
    address: 'Inside Don Quijote, Tamuning',
    mapAddress: 'Don+Quijote,+Tamuning,+Guam',
    hours: [
      { days: 'Daily', time: '10:00 AM - 10:00 PM' },
    ],
    image: '/images/three-squares-donki.png',
    note: 'Open until sold out',
  },
];

function formatDateRange(start?: string | null, end_?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  const parts: string[] = [];
  if (start) parts.push(new Date(start).toLocaleDateString('en-US', opts));
  if (end_) parts.push(new Date(end_).toLocaleDateString('en-US', opts));
  return parts.join(' — ');
}

export default function LocationsPage() {
  const [temporaryLocations, setTemporaryLocations] = useState<ApiLocation[]>([]);

  useEffect(() => {
    const fetchTemporary = async () => {
      try {
        const response = await locationsApi.getLocations();
        const locs = response.locations || [];
        setTemporaryLocations(locs.filter((l) => l.location_type && l.location_type !== 'permanent'));
      } catch {
        // Silently fail - temporary locations are supplementary
      }
    };
    fetchTemporary();
  }, []);

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Hero Section */}
      <section className="relative bg-gray-900 text-white py-20 sm:py-28 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/images/catering4.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/72" />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(139,69,19,0.28) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.62) 100%)'
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <span
              className="inline-block px-5 py-2 bg-black/35 backdrop-blur-sm border border-white/30 text-sm font-semibold rounded-full mb-6 text-white shadow-lg"
              style={{ color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}
            >
              Visit Us Today
            </span>
          </FadeIn>
          
          <FadeIn delay={0.1}>
            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 tracking-tight text-white"
              style={{ color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 4px 25px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)' }}
            >
              Our Locations
            </h1>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <p
              className="text-lg sm:text-xl text-white max-w-2xl mx-auto leading-relaxed"
              style={{ color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.9), 0 2px 15px rgba(0,0,0,0.5)' }}
            >
              Find us at two convenient locations on Guam. Stop by for delicious 
              island-style comfort food, or contact us for catering orders.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Locations Grid */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {locations.map((location) => (
              <StaggerItem key={location.name}>
                <LocationCard location={location} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* Dynamic Popup/Event Locations */}
      {temporaryLocations.length > 0 && (
        <section className="py-16 sm:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn>
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight">
                  Pop-ups & Events
                </h2>
                <p className="text-warm-600 text-lg mt-3 max-w-2xl mx-auto">
                  Catch us at these limited-time locations!
                </p>
              </div>
            </FadeIn>
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {temporaryLocations.map((loc) => (
                <StaggerItem key={loc.id}>
                  <div className="bg-warm-50 rounded-xl border border-warm-200 p-6 h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          loc.location_type === 'popup'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {loc.location_type === 'popup' ? 'Pop-up' : 'Event'}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-warm-900 mb-2">{loc.name}</h3>
                    {loc.description && (
                      <p className="text-warm-600 text-sm mb-3">{loc.description}</p>
                    )}
                    {loc.address && (
                      <p className="text-warm-600 text-sm flex items-start gap-1.5 mb-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-warm-400" />
                        {loc.address}
                      </p>
                    )}
                    {(loc.starts_at || loc.ends_at) && (
                      <p className="text-warm-500 text-sm flex items-start gap-1.5">
                        <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0 text-warm-400" />
                        {formatDateRange(loc.starts_at, loc.ends_at)}
                      </p>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* Catering CTA - aligned with Catering page actions */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 mb-6 tracking-tight">
              Catering Inquiries
            </h2>
          </FadeIn>
          
          <FadeIn delay={0.1}>
            <p className="text-warm-600 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
              Planning an event? B&G Pacific provides professional catering services 
              for corporate events, weddings, parties, and more. We&apos;re HUBZone certified.
            </p>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/catering?inquiry=true"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-warm-600 text-white rounded-xl font-medium text-lg hover:bg-warm-700 transition-all duration-200 hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
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
    </div>
  );
}

interface LocationCardProps {
  location: Location;
}

function LocationCard({ location }: LocationCardProps) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${location.mapAddress}`;
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(location.mapAddress)}&z=15&output=embed`;
  
  return (
    <motion.div
      className="bg-white rounded-2xl shadow-lg overflow-hidden border border-warm-100 h-full flex flex-col"
      whileHover={{ y: -4, boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.1)' }}
      transition={{ duration: 0.2 }}
    >
      {/* Image */}
      <div className="relative h-56 sm:h-64 overflow-hidden">
        <img
          src={location.image}
          alt={location.name}
          className="w-full h-full object-cover"
        />
        {location.featured && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-tsPrimary text-white text-sm font-medium rounded-full">
            Main Location
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6 sm:p-8 flex-1 flex flex-col">
        <h3 className="text-2xl font-bold text-warm-900 mb-4">{location.name}</h3>
        
        {/* Address */}
        <div className="flex items-start gap-3 mb-4">
          <MapPin className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
          <div>
            <p className="text-warm-700">{location.address}</p>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-tsPrimary hover:text-primary-dark text-sm font-medium mt-1 transition-colors"
            >
              Get Directions
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Hours */}
        <div className="flex items-start gap-3 mb-4">
          <Clock className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
          <div className="space-y-1">
            {location.hours.map((schedule, idx) => (
              <p key={idx} className="text-warm-700">
                <span className="font-medium">{schedule.days}:</span>{' '}
                <span className={schedule.time === 'Closed' ? 'text-warm-400' : ''}>
                  {schedule.time}
                </span>
              </p>
            ))}
            {location.note && (
              <p className="text-warm-500 text-sm italic">{location.note}</p>
            )}
          </div>
        </div>

        {/* Contact */}
        {(location.phone || location.whatsapp) && (
          <div className="flex items-start gap-3 mt-auto pt-4 border-t border-warm-100">
            <Phone className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
            <div className="space-y-1">
              {location.phone && (
                <a
                  href={`tel:+1${location.phone.replace(/\D/g, '')}`}
                  className="block text-warm-700 hover:text-tsPrimary transition-colors"
                >
                  {location.phone}
                </a>
              )}
              {location.whatsapp && (
                <a
                  href={`https://wa.me/1${location.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp: {location.whatsapp}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Map Preview */}
      <div className="px-6 pb-6 sm:px-8 sm:pb-8 space-y-3">
        <div className="w-full h-32 rounded-xl overflow-hidden border border-warm-200">
          <iframe
            src={mapEmbedUrl}
            title={`Map of ${location.name}`}
            className="w-full h-full"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-tsPrimary hover:text-primary-dark text-sm font-medium transition-colors"
        >
          Open in Google Maps
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    </motion.div>
  );
}
