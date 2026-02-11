import { useEffect, useState } from 'react';
import axios from 'axios';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import Breadcrumbs from '../components/Breadcrumbs';
import { API_BASE_URL } from '../config';
import { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';
  const storePhone = appConfig?.store_info?.phone || '671-777-1234';
  const storePhoneTel = `tel:${storePhone.replace(/[^\d+]/g, '')}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await axios.post(`${API_BASE_URL}/api/v1/contact`, { contact: formData });
      setSubmitted(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.errors) {
        setError(err.response.data.errors.join(', '));
      } else {
        setError('Something went wrong. Please try again or email us directly.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Contact Us' }
        ]} />
      </div>

      {/* Hero Section */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-warm-900 tracking-tight">
              Contact Us
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-warm-600">
              We'd love to hear from you! Reach out with questions, feedback, or just to say Håfa Adai.
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <FadeIn>
              {submitted ? (
                <div className="rounded-lg p-8 bg-warm text-center">
                  <div className="mb-4"><svg className="w-12 h-12 mx-auto text-tsPrimary" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg></div>
                  <h2 className="text-2xl font-bold text-warm-900 mb-2">Mahalo for reaching out!</h2>
                  <p className="text-warm-600 mb-6">
                    We've received your message and will get back to you as soon as possible.
                  </p>
                  <button
                    onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
                    className="text-tsPrimary hover:text-red-700 font-medium transition"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-warm-700 mb-2">
                        Your Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg border border-warm-200 focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary transition text-warm-900"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-warm-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg border border-warm-200 focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary transition text-warm-900"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-warm-700 mb-2">
                      Subject
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-lg border border-warm-200 focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary transition text-warm-900 bg-white"
                    >
                      <option value="">Select a subject...</option>
                      <option value="general">General Inquiry</option>
                      <option value="order">Order Question</option>
                      <option value="shipping">Shipping & Delivery</option>
                      <option value="returns">Returns & Exchanges</option>
                      <option value="wholesale">Wholesale / Bulk Orders</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-warm-700 mb-2">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={6}
                      value={formData.message}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-lg border border-warm-200 focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary transition text-warm-900 resize-none"
                      placeholder="How can we help you?"
                    />
                  </div>
                  {error && (
                    <div className="rounded-lg p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-8 py-3 bg-warm-900 text-white rounded-lg font-medium hover:bg-warm-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              )}
            </FadeIn>
          </div>

          {/* Contact Info Sidebar */}
          <div className="lg:col-span-1">
            <StaggerContainer className="space-y-6">
              {/* Email */}
              <StaggerItem>
                <div className="rounded-lg p-6 bg-warm">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-warm-900 mb-1">Email</h3>
                      <a href={`mailto:${storeEmail}`} className="text-warm-600 hover:text-tsPrimary transition text-sm">
                        {storeEmail}
                      </a>
                    </div>
                  </div>
                </div>
              </StaggerItem>

              {/* Phone */}
              <StaggerItem>
                <div className="rounded-lg p-6 bg-warm">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-warm-900 mb-1">Phone</h3>
                      <a href={storePhoneTel} className="text-warm-600 hover:text-tsPrimary transition text-sm">
                        {storePhone}
                      </a>
                    </div>
                  </div>
                </div>
              </StaggerItem>

              {/* Address */}
              <StaggerItem>
                <div className="rounded-lg p-6 bg-warm">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-warm-900 mb-1">Visit Us</h3>
                      <address className="text-warm-600 text-sm not-italic leading-relaxed">
                        121 E. Marine Corps Dr<br />
                        Suite 1-103 & Suite 1-104<br />
                        Hagåtña, Guam 96910
                      </address>
                    </div>
                  </div>
                </div>
              </StaggerItem>

              {/* Social Links */}
              <StaggerItem>
                <div className="rounded-lg p-6 bg-warm">
                  <h3 className="font-medium text-warm-900 mb-4">Follow Us</h3>
                  <div className="flex gap-3">
                    <a
                      href="https://www.instagram.com/threesquaresguam"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-warm-500 hover:text-tsPrimary transition"
                      aria-label="Instagram"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </a>
                    <a
                      href="https://www.facebook.com/threesquaresguam"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-warm-500 hover:text-tsPrimary transition"
                      aria-label="Facebook"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
                      </svg>
                    </a>
                  </div>
                </div>
              </StaggerItem>
            </StaggerContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
