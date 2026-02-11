import { motion } from 'framer-motion';
import { MapPin, Clock, Phone, MessageCircle, Mail, ChevronRight } from 'lucide-react';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';

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
    image: '/images/Three_Squares_%40_Donki.png',
    note: 'Open until sold out',
  },
];

export default function LocationsPage() {
  return (
    <div className="min-h-screen bg-warm-50">
      {/* Hero Section */}
      <section className="relative bg-gray-900 text-white py-20 sm:py-28 overflow-hidden">
        {/* Background Image with stronger overlay */}
        <div className="absolute inset-0">
          <img
            src="/images/catering4.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gray-900/70" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <span className="inline-block px-5 py-2 bg-white/20 backdrop-blur-sm border border-white/30 text-sm font-semibold rounded-full mb-6 text-white shadow-lg">
              Visit Us Today
            </span>
          </FadeIn>
          
          <FadeIn delay={0.1}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 tracking-tight text-white drop-shadow-lg">
              Our Locations
            </h1>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <p className="text-lg sm:text-xl text-white max-w-2xl mx-auto leading-relaxed drop-shadow-md">
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

      {/* Contact Section */}
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
              <a
                href="mailto:sales@bgpacific.com"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-tsPrimary text-white rounded-xl font-medium text-lg hover:bg-primary-dark transition-all duration-200 hover:-translate-y-0.5"
              >
                <Mail className="w-5 h-5" />
                Email for Catering
              </a>
              <a
                href="https://wa.me/16718646656"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 text-white rounded-xl font-medium text-lg hover:bg-green-700 transition-all duration-200 hover:-translate-y-0.5"
              >
                <MessageCircle className="w-5 h-5" />
                WhatsApp Us
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
          <MapPin className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" />
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
          <Clock className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" />
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
            <Phone className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" />
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
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-xl overflow-hidden border border-warm-200 hover:border-tsPrimary transition-colors"
        >
          <img
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${location.mapAddress}&zoom=15&size=600x200&maptype=roadmap&markers=color:red%7C${location.mapAddress}&key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8`}
            alt={`Map of ${location.name}`}
            className="w-full h-32 object-cover"
            loading="lazy"
            onError={(e) => {
              // Fallback if Google Maps API fails
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">
                  <rect fill="#f5f5f4" width="600" height="200"/>
                  <text x="300" y="100" text-anchor="middle" fill="#a8a29e" font-family="system-ui" font-size="14">
                    Click to view map
                  </text>
                </svg>
              `);
            }}
          />
        </a>
      </div>
    </motion.div>
  );
}
