import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { MapPin, Clock, Phone, MessageCircle, ChevronRight, ClipboardList } from 'lucide-react';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';

interface Location {
  slug: string;
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
  imageAlt: string;
  featured?: boolean;
}

const locations: Location[] = [
  {
    slug: 'three-squares-main',
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
    image: '/images/Loco_Moco.JPG',
    imageAlt: 'Loco moco from the Three Squares menu',
    featured: true,
  },
  {
    slug: 'three-squares-donki',
    name: 'Three Squares @ Donki',
    address: 'Inside Don Quijote, Tamuning',
    mapAddress: 'Don+Quijote,+Tamuning,+Guam',
    hours: [
      { days: 'Daily', time: '10:00 AM - 10:00 PM' },
    ],
    image: '/images/three-squares-donki.png',
    imageAlt: 'Three Squares @ Donki',
  },
];

export default function LocationsPage() {
  return (
    <div className="min-h-screen bg-warm-50">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-tsPrimary mb-4">Find Three Squares</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-warm-900 tracking-tight">Main or Donki?</h1>
        <p className="mt-4 text-lg text-warm-700 max-w-2xl leading-relaxed">Find the menu and directions for each Three Squares location in Tamuning. Main is on Chalan San Antonio; Donki is inside Don Quijote.</p>
      </section>

      {/* Locations Grid */}
      <section className="py-10 sm:py-14">
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
              Planning a gathering? Send Three Squares an inquiry with your event details so the team can discuss a quote.
            </p>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button to="/catering?inquiry=true" size="lg" icon={<ClipboardList />}>Request a Quote</Button>
              <Button href="tel:+16716462652" variant="secondary" size="lg" icon={<Phone />}>Call (671) 646-2652</Button>
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
  
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-warm-100 h-full flex flex-col">
      {/* Image */}
      <div className="relative h-56 sm:h-64 overflow-hidden">
        <img
          src={location.image}
          alt={location.imageAlt}
          className="w-full h-full object-cover"
        />
        {location.featured && (
          <StatusBadge tone="info" className="absolute top-4 left-4">Main Location</StatusBadge>
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
        <Button to={`/menu/${location.slug}`} aria-label={`View ${location.name} menu`} className="mt-6" icon={<ChevronRight />}>View Menu</Button>
      </div>


    </div>
  );
}
