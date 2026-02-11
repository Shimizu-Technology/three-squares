import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import Breadcrumbs from '../components/Breadcrumbs';
import { Link } from 'react-router-dom';

// Catering packages data
const cateringPackages = [
  {
    name: "Breakfast Package",
    description: "Start your meeting right with our popular breakfast selections",
    minGuests: 10,
    pricePerPerson: "$12.99",
    items: [
      "Scrambled Eggs",
      "Bacon & Portuguese Sausage",
      "Hash Browns or Rice",
      "Fresh Fruit Platter",
      "Coffee & Juice Service"
    ]
  },
  {
    name: "Lunch Box Package",
    description: "Individual boxed lunches perfect for meetings and events",
    minGuests: 10,
    pricePerPerson: "$15.99",
    items: [
      "Choice of Entrée (Chicken Katsu, Kalbi, or Tinaktak)",
      "Rice & Side Salad",
      "Drink & Dessert",
      "Individually Packaged"
    ]
  },
  {
    name: "Fiesta Buffet",
    description: "Full buffet service for larger gatherings and celebrations",
    minGuests: 25,
    pricePerPerson: "$24.99",
    items: [
      "3 Entrée Selections",
      "Rice & 2 Side Dishes",
      "Garden Salad Bar",
      "Rolls & Butter",
      "Dessert Selection",
      "Beverage Station"
    ]
  },
  {
    name: "Executive Luncheon",
    description: "Upscale catering for corporate events and VIP gatherings",
    minGuests: 15,
    pricePerPerson: "$34.99",
    items: [
      "Premium Entrée Selection",
      "Gourmet Sides",
      "Fresh Salad Course",
      "Artisan Bread Service",
      "Dessert & Coffee Service",
      "Professional Setup & Service"
    ]
  }
];

// Services offered
const services = [
  {
    title: "Corporate Events",
    description: "From board meetings to company celebrations, we deliver professional catering that impresses.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  },
  {
    title: "Government & HUBZone",
    description: "Certified vendor for government contracts. Invoice and PO billing available.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    title: "Private Celebrations",
    description: "Birthdays, graduations, fiestas — we make your special moments delicious.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18z" />
      </svg>
    )
  },
  {
    title: "Drop-Off & Full Service",
    description: "Choose simple delivery or full-service with setup, serving, and cleanup.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  }
];

export default function CateringPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Catering' }
        ]} />
      </div>

      {/* Hero Section */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-gray-900 tracking-tight">
              Catering Services
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-gray-600 mb-8">
              From intimate gatherings to large corporate events, Three Squares delivers 
              Guam-style comfort food that brings people together.
            </p>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="https://wa.me/16714831234?text=Hi!%20I'd%20like%20to%20inquire%20about%20catering%20services."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-green-700 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp Us
              </a>
              <a
                href="tel:+16714831234"
                className="inline-flex items-center justify-center gap-2 bg-warm-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-warm-700 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call (671) 483-1234
              </a>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Services Grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <FadeIn>
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            How We Can Help
          </h2>
        </FadeIn>
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service, index) => (
            <StaggerItem key={index}>
              <div className="flex gap-4 p-6 rounded-xl border border-gray-100 hover:border-warm-200 hover:shadow-md transition">
                <div className="flex-shrink-0 w-12 h-12 bg-warm-100 rounded-lg flex items-center justify-center text-warm-600">
                  {service.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-2">{service.title}</h3>
                  <p className="text-gray-600">{service.description}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>

      {/* Catering Packages */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-3xl font-bold text-center mb-4 text-gray-900">
              Catering Packages
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              Choose from our popular packages or let us create a custom menu for your event. 
              All prices are per person with minimum guest requirements.
            </p>
          </FadeIn>
          
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {cateringPackages.map((pkg, index) => (
              <StaggerItem key={index}>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition h-full flex flex-col">
                  <div className="p-6 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-xl text-gray-900">{pkg.name}</h3>
                      <span className="bg-warm-100 text-warm-800 text-sm font-semibold px-3 py-1 rounded-full">
                        {pkg.pricePerPerson}/person
                      </span>
                    </div>
                    <p className="text-gray-600 mb-4">{pkg.description}</p>
                    <p className="text-sm text-gray-500 mb-4">Minimum {pkg.minGuests} guests</p>
                    <ul className="space-y-2">
                      {pkg.items.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-gray-700">
                          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <a
                      href={`https://wa.me/16714831234?text=Hi!%20I'm%20interested%20in%20the%20${encodeURIComponent(pkg.name)}%20catering%20package.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center bg-warm-600 text-white py-3 rounded-lg font-semibold hover:bg-warm-700 transition"
                    >
                      Request Quote
                    </a>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </div>

      {/* Lead Time & Info */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <FadeIn>
          <div className="bg-warm-50 rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Booking Information</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3 text-gray-900">Lead Time Requirements</h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-warm-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Small orders (10-25 guests):</strong> 48 hours notice</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-warm-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Medium orders (26-75 guests):</strong> 1 week notice</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-warm-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Large events (75+ guests):</strong> 2 weeks notice</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3 text-gray-900">Payment Options</h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Credit/Debit Cards
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Invoice/PO for Government & Corporate
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    50% deposit for large events
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* CTA Section */}
      <div className="bg-warm-600 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Plan Your Event?
            </h2>
            <p className="text-warm-100 text-lg mb-8">
              Contact us today for a custom quote. We'll work with you to create the perfect menu for your occasion.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="https://wa.me/16714831234?text=Hi!%20I'd%20like%20to%20request%20a%20catering%20quote."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-white text-warm-700 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Request Quote via WhatsApp
              </a>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 bg-warm-700 text-white px-8 py-4 rounded-lg font-semibold hover:bg-warm-800 transition border border-warm-500"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Form
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
