import { useState } from 'react';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import Breadcrumbs from '../components/Breadcrumbs';
import { api } from '../services/api';

// Event types and budget ranges (should match API)
const EVENT_TYPES = [
  { value: 'corporate', label: 'Corporate Event' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'party', label: 'Party / Celebration' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'funeral', label: 'Funeral / Memorial' },
  { value: 'other', label: 'Other' },
];

const BUDGET_RANGES = [
  '$500 or less',
  '$500 - $1,000',
  '$1,000 - $2,500',
  '$2,500 - $5,000',
  '$5,000 - $10,000',
  '$10,000+',
];

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

// Form initial state
const initialFormState = {
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  company_name: '',
  event_type: '',
  event_date: '',
  event_time: '',
  guest_count: '',
  budget_range: '',
  venue_address: '',
  menu_preferences: '',
  special_requests: '',
  dietary_restrictions: '',
};

export default function CateringPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post('/api/v1/catering', {
        inquiry: {
          ...formData,
          guest_count: parseInt(formData.guest_count, 10),
        }
      });
      setSubmitted(true);
      setFormData(initialFormState);
    } catch (err: any) {
      setError(err.response?.data?.errors?.join(', ') || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate minimum date (3 days from now)
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3);
  const minDateStr = minDate.toISOString().split('T')[0];

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
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center justify-center gap-2 bg-warm-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-warm-700 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Request a Quote
              </button>
              <a
                href="tel:+16716462652"
                className="inline-flex items-center justify-center gap-2 bg-white text-warm-700 border-2 border-warm-600 px-8 py-4 rounded-lg font-semibold hover:bg-warm-50 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call (671) 646-2652
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

      {/* Catering Inquiry Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="min-h-screen flex items-center justify-center p-4">
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {submitted ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h3>
                  <p className="text-gray-600 mb-6">
                    We've received your catering inquiry and will get back to you within 24-48 hours.
                  </p>
                  <button
                    onClick={() => { setShowForm(false); setSubmitted(false); }}
                    className="bg-warm-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-warm-700 transition"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-gray-900">Request a Catering Quote</h3>
                    <button
                      onClick={() => setShowForm(false)}
                      className="text-gray-400 hover:text-gray-600 transition"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                        {error}
                      </div>
                    )}

                    {/* Contact Info */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900">Contact Information</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                          <input
                            type="text"
                            name="contact_name"
                            value={formData.contact_name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                          <input
                            type="email"
                            name="contact_email"
                            value={formData.contact_email}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            type="tel"
                            name="contact_phone"
                            value={formData.contact_phone}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Company/Organization</label>
                          <input
                            type="text"
                            name="company_name"
                            value={formData.company_name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Event Details */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900">Event Details</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
                          <select
                            name="event_type"
                            value={formData.event_type}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          >
                            <option value="">Select type...</option>
                            {EVENT_TYPES.map(type => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Number of Guests *</label>
                          <input
                            type="number"
                            name="guest_count"
                            value={formData.guest_count}
                            onChange={handleInputChange}
                            required
                            min="1"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                          <input
                            type="date"
                            name="event_date"
                            value={formData.event_date}
                            onChange={handleInputChange}
                            required
                            min={minDateStr}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Event Time</label>
                          <input
                            type="time"
                            name="event_time"
                            value={formData.event_time}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Budget Range</label>
                          <select
                            name="budget_range"
                            value={formData.budget_range}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          >
                            <option value="">Select budget...</option>
                            {BUDGET_RANGES.map(range => (
                              <option key={range} value={range}>{range}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Venue Address</label>
                          <input
                            type="text"
                            name="venue_address"
                            value={formData.venue_address}
                            onChange={handleInputChange}
                            placeholder="Where is your event?"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900">Additional Information</h4>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Menu Preferences</label>
                        <textarea
                          name="menu_preferences"
                          value={formData.menu_preferences}
                          onChange={handleInputChange}
                          rows={2}
                          placeholder="Any specific dishes or cuisines you're interested in?"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Dietary Restrictions</label>
                        <input
                          type="text"
                          name="dietary_restrictions"
                          value={formData.dietary_restrictions}
                          onChange={handleInputChange}
                          placeholder="Vegetarian, gluten-free, allergies, etc."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                        <textarea
                          name="special_requests"
                          value={formData.special_requests}
                          onChange={handleInputChange}
                          rows={2}
                          placeholder="Any other details we should know?"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                        />
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-warm-600 text-white py-4 rounded-lg font-semibold hover:bg-warm-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Submitting...' : 'Submit Inquiry'}
                      </button>
                      <p className="text-sm text-gray-500 text-center mt-3">
                        We'll respond within 24-48 hours with a custom quote.
                      </p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
                    <button
                      onClick={() => setShowForm(true)}
                      className="block w-full text-center bg-warm-600 text-white py-3 rounded-lg font-semibold hover:bg-warm-700 transition"
                    >
                      Request Quote
                    </button>
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
              Submit an inquiry and we'll create a custom quote for your occasion.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center justify-center gap-2 bg-white text-warm-700 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Request a Quote
              </button>
              <a
                href="tel:+16716462652"
                className="inline-flex items-center justify-center gap-2 bg-warm-700 text-white px-8 py-4 rounded-lg font-semibold hover:bg-warm-800 transition border border-warm-500"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call (671) 646-2652
              </a>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
