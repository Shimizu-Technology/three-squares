import { Button } from '../components/ui/Button';
import { ClipboardList, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import FadeIn from '../components/animations/FadeIn';
import Breadcrumbs from '../components/Breadcrumbs';
import api from '../services/api';
import Dialog from '../components/ui/Dialog';
import { minCateringEventDate } from '../utils/cateringDate';

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
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showForm && (error || submitted)) outcomeRef.current?.focus();
  }, [showForm, error, submitted]);

  // Keep an unseen response if a request finishes while the dialog is closed.
  // The success Close action acknowledges it and starts the next inquiry.
  const openInquiry = () => setShowForm(true);

  // Allow deep-linking directly to the inquiry form from other pages.
  useEffect(() => {
    if (searchParams.get('inquiry') === 'true') {
      setShowForm(true);
    }
  }, [searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post('/catering', {
        inquiry: {
          ...formData,
          guest_count: parseInt(formData.guest_count, 10),
        }
      });
      setSubmitted(true);
      setFormData(initialFormState);
    } catch (err: unknown) {
      const apiErrors = axios.isAxiosError(err)
        ? err.response?.data?.errors
        : undefined;
      setError(Array.isArray(apiErrors) && apiErrors.length > 0
        ? apiErrors.join(', ')
        : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const minDateStr = minCateringEventDate();

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Catering' }
        ]} />
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-tsPrimary mb-4">Three Squares catering</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-warm-900 tracking-tight leading-tight">Food for your gathering</h1>
          <p className="mt-5 text-lg text-warm-700 leading-relaxed max-w-xl">Tell us about your event and the food you have in mind. A catering inquiry starts a conversation about availability and a quote.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={openInquiry} size="lg">Request a quote</Button>
            <Button to="/products?business_line=catering" variant="secondary" size="lg">Browse catering items</Button>
          </div>
          <p className="mt-5 text-sm text-warm-600">Submitting an inquiry does not place or pay for an order.</p>
        </div>
        <figure className="overflow-hidden rounded-2xl bg-warm-100">
          <img src="/images/catering7.jpg" alt="Food arranged in a catering tray" className="w-full aspect-[4/3] object-cover" loading="eager" />
        </figure>
      </section>

      <section className="bg-white py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-warm-200 p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-warm-900">Choosing from the menu?</h2>
            <p className="mt-3 text-warm-700">Browse the catering items currently listed online, then choose a pickup location when ordering.</p>
            <Button to="/products?business_line=catering" className="mt-6" variant="link">View catering items</Button>
          </div>
          <div className="rounded-2xl border border-warm-200 p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-warm-900">Planning an event?</h2>
            <p className="mt-3 text-warm-700">Share the date, guest count and menu preferences. The team can review your request and discuss a quote.</p>
            <Button onClick={openInquiry} className="mt-6" variant="link">Open inquiry form</Button>
          </div>
        </div>
      </section>

      {/* Catering Inquiry Form */}
      <Dialog open={showForm} onOpenChange={setShowForm} labelledBy="catering-form-title"
        className={`w-[calc(100vw-2rem)] max-w-3xl rounded-2xl border border-warm-200 overflow-hidden flex flex-col ${submitted ? '' : 'h-[calc(100dvh-2rem)]'}`}>
              {submitted ? (
                <div ref={outcomeRef} role="status" tabIndex={-1} className="p-8 text-center overflow-y-auto">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 id="catering-form-title" className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h3>
                  <p className="text-gray-600 mb-6">
                    Your inquiry has been received. The team can review your details and follow up about a quote.
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
                  <div className="shrink-0 px-5 py-4 sm:px-6 sm:py-5 border-b border-warm-200 bg-warm-50/80 flex justify-between items-center">
                    <div>
                      <h3 id="catering-form-title" className="text-xl sm:text-2xl font-bold text-gray-900">Request a Catering Quote</h3>
                      <p className="text-sm text-gray-500 mt-1">Share your event details so the team can discuss a quote.</p>
                    </div>
                    <button
                      onClick={() => setShowForm(false)}
                      className="shrink-0 w-11 h-11 flex items-center justify-center text-warm-500 hover:text-warm-700 transition rounded-md hover:bg-white"
                      aria-label="Close modal"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form
                    onSubmit={handleSubmit}
                    aria-describedby={error ? 'catering-form-error' : undefined}
                    className="px-5 py-5 sm:px-6 sm:py-6 space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
                  >
                    {error && (
                      <div id="catering-form-error" ref={outcomeRef} role="alert" tabIndex={-1} className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                        {error}
                      </div>
                    )}

                    {/* Contact Info */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900">Contact Information</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="catering-contact-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                          <input
                            id="catering-contact-name"
                            type="text"
                            name="contact_name"
                            value={formData.contact_name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="catering-contact-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                          <input
                            id="catering-contact-email"
                            type="email"
                            name="contact_email"
                            value={formData.contact_email}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="catering-contact-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            id="catering-contact-phone"
                            type="tel"
                            name="contact_phone"
                            value={formData.contact_phone}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="catering-company-name" className="block text-sm font-medium text-gray-700 mb-1">Company/Organization</label>
                          <input
                            id="catering-company-name"
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
                          <label htmlFor="catering-event-type" className="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
                          <select
                            id="catering-event-type"
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
                          <label htmlFor="catering-guest-count" className="block text-sm font-medium text-gray-700 mb-1">Number of Guests *</label>
                          <input
                            id="catering-guest-count"
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
                          <label htmlFor="catering-event-date" className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
                          <input
                            id="catering-event-date"
                            type="date"
                            name="event_date"
                            value={formData.event_date}
                            onChange={handleInputChange}
                            required
                            min={minDateStr}
                            aria-describedby="catering-date-help"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                          <p id="catering-date-help" className="mt-1 text-sm text-warm-500">Choose a date at least three days ahead.</p>
                        </div>
                        <div>
                          <label htmlFor="catering-event-time" className="block text-sm font-medium text-gray-700 mb-1">Event Time</label>
                          <input
                            id="catering-event-time"
                            type="time"
                            name="event_time"
                            value={formData.event_time}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="catering-budget-range" className="block text-sm font-medium text-gray-700 mb-1">Budget Range</label>
                          <select
                            id="catering-budget-range"
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
                          <label htmlFor="catering-venue-address" className="block text-sm font-medium text-gray-700 mb-1">Venue Address</label>
                          <input
                            id="catering-venue-address"
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
                        <label htmlFor="catering-menu-preferences" className="block text-sm font-medium text-gray-700 mb-1">Menu Preferences</label>
                        <textarea
                          id="catering-menu-preferences"
                          name="menu_preferences"
                          value={formData.menu_preferences}
                          onChange={handleInputChange}
                          rows={2}
                          placeholder="Any specific dishes or cuisines you're interested in?"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="catering-dietary-restrictions" className="block text-sm font-medium text-gray-700 mb-1">Dietary Restrictions</label>
                        <input
                          id="catering-dietary-restrictions"
                          type="text"
                          name="dietary_restrictions"
                          value={formData.dietary_restrictions}
                          onChange={handleInputChange}
                          placeholder="Vegetarian, gluten-free, allergies, etc."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 focus:border-warm-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="catering-special-requests" className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                        <textarea
                          id="catering-special-requests"
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
                        Submitting this form requests a quote. It does not confirm availability or place an order.
                      </p>
                    </div>
                  </form>
                </>
              )}
      </Dialog>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-tsPrimary mb-4">From the kitchen</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight">Tell us what your table needs</h2>
          <p className="mt-4 text-warm-700 leading-relaxed">The inquiry form has room for your event date, guest count, food preferences and other details. The team will need to confirm the menu, availability and price with you.</p>
          <Button onClick={openInquiry} className="mt-6" size="lg">Request a quote</Button>
        </div>
        <img src="/images/Mini_Bentos.jpg" alt="Boxed meals from Three Squares" className="w-full aspect-[4/3] object-cover rounded-2xl" loading="eager" />
      </section>

      {/* CTA Section */}
      <div className="bg-tsNavy py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn immediate>
            <div className="rounded-2xl bg-black/20 border border-white/10 p-6 sm:p-8">
              <h2
                className="text-3xl font-bold mb-4"
                style={{ color: '#ffffff', textShadow: '0 1px 8px rgba(0,0,0,0.45)' }}
              >
                Ready to Plan Your Event?
              </h2>
              <p
                className="text-lg mb-8"
                style={{ color: 'rgba(255,255,255,0.95)', textShadow: '0 1px 6px rgba(0,0,0,0.35)' }}
              >
                Send your event details so the team can discuss a quote with you.
              </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button onClick={openInquiry} size="lg" surface="dark" icon={<ClipboardList />}>Request a Quote</Button>
              <Button href="tel:+16716462652" variant="secondary" size="lg" surface="dark" icon={<Phone />}>Call (671) 646-2652</Button>
            </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
