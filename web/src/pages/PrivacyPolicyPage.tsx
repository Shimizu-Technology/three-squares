import { useEffect, useState } from 'react';
import FadeIn from '../components/animations/FadeIn';
import Breadcrumbs from '../components/Breadcrumbs';
import { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

export default function PrivacyPolicyPage() {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';
  const storePhone = appConfig?.store_info?.phone || '(671) 646-2652';
  const storePhoneTel = `tel:${storePhone.replace(/[^\d+]/g, '')}`;

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Privacy Policy' }
        ]} />
      </div>

      {/* Hero Section */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-warm-900 tracking-tight">
              Privacy Policy
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-warm-600">
              Your privacy matters to us. Here's how we handle your information.
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        <FadeIn immediate>
          <p className="text-sm text-warm-500 mb-12">
            Last updated: January 1, 2025
          </p>
        </FadeIn>

        {/* Introduction */}
        <FadeIn immediate>
          <section className="mb-12">
            <p className="text-lg text-warm-700 leading-relaxed">
              Three Squares / B&G Pacific LLC ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you visit our website
              and make purchases from our online store. Please read this policy carefully.
            </p>
          </section>
        </FadeIn>

        {/* Information We Collect */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Information We Collect</h2>
            
            <h3 className="text-lg font-semibold text-warm-900 mb-3">Personal Information</h3>
            <p className="text-warm-700 leading-relaxed mb-4">
              When you make a purchase or create an account, we may collect:
            </p>
            <ul className="space-y-2 mb-6">
              {[
                'Full name',
                'Email address',
                'Shipping and billing address',
                'Phone number',
                'Payment information (processed securely via Stripe)',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-warm-600">
                  <span className="text-tsPrimary font-bold leading-none mt-1">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <h3 className="text-lg font-semibold text-warm-900 mb-3">Order Data</h3>
            <p className="text-warm-700 leading-relaxed mb-4">
              We retain information about your orders, including items purchased, order total, shipping details,
              and order status for customer service and record-keeping purposes.
            </p>

            <h3 className="text-lg font-semibold text-warm-900 mb-3">Cookies & Analytics</h3>
            <p className="text-warm-700 leading-relaxed">
              Our website uses cookies and similar technologies to enhance your browsing experience, remember
              your preferences, and gather analytics data about site usage. You can control cookie settings
              through your browser preferences.
            </p>
          </section>
        </FadeIn>

        {/* How We Use Your Information */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">How We Use Your Information</h2>
            <p className="text-warm-700 leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="space-y-2">
              {[
                'Process and fulfill your orders',
                'Send order confirmations, shipping updates, and tracking information',
                'Communicate with you about your account or purchases',
                'Respond to your questions, comments, or customer service requests',
                'Improve our website, products, and services',
                'Send promotional emails (you can opt out at any time)',
                'Prevent fraud and ensure the security of our platform',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-warm-600">
                  <svg className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </FadeIn>

        {/* Third Parties */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Third-Party Services</h2>
            <p className="text-warm-700 leading-relaxed mb-6">
              We share your information only with trusted third parties that help us operate our business:
            </p>
            <div className="space-y-4">
              <div className="rounded-lg p-6 bg-warm">
                <h3 className="font-semibold text-warm-900 mb-2">Stripe (Payment Processing)</h3>
                <p className="text-warm-600 text-sm leading-relaxed">
                  Your payment information is processed securely through Stripe. We never store your full
                  credit card details on our servers. Stripe's privacy policy can be found at{' '}
                  <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-tsPrimary hover:text-red-700 transition">
                    stripe.com/privacy
                  </a>.
                </p>
              </div>
              <div className="rounded-lg p-6 bg-warm">
                <h3 className="font-semibold text-warm-900 mb-2">USPS (Shipping)</h3>
                <p className="text-warm-600 text-sm leading-relaxed">
                  We share your shipping address with USPS to fulfill and deliver your orders from our
                  location in Guam.
                </p>
              </div>
              <div className="rounded-lg p-6 bg-warm">
                <h3 className="font-semibold text-warm-900 mb-2">Clerk (Authentication)</h3>
                <p className="text-warm-600 text-sm leading-relaxed">
                  Account authentication is handled by Clerk. Your login credentials are managed securely
                  through their platform.
                </p>
              </div>
            </div>
          </section>
        </FadeIn>

        {/* Data Security */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Data Security</h2>
            <p className="text-lg text-warm-700 leading-relaxed mb-4">
              We take reasonable measures to protect your personal information from unauthorized access,
              alteration, disclosure, or destruction. These measures include:
            </p>
            <ul className="space-y-2">
              {[
                'SSL/TLS encryption for all data transmitted to and from our website',
                'Secure payment processing through PCI-compliant providers',
                'Regular security assessments and updates',
                'Limited employee access to personal information',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-warm-600">
                  <svg className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-warm-600 mt-4 text-sm">
              While we strive to protect your information, no method of electronic transmission or storage
              is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>
        </FadeIn>

        {/* Your Rights */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Your Rights</h2>
            <p className="text-warm-700 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="space-y-2">
              {[
                'Access the personal information we hold about you',
                'Request correction of inaccurate information',
                'Request deletion of your personal information',
                'Opt out of marketing communications at any time',
                'Disable cookies through your browser settings',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-warm-600">
                  <span className="text-tsPrimary font-bold leading-none mt-1">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </FadeIn>

        {/* Changes */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Changes to This Policy</h2>
            <p className="text-warm-700 leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices or
              for other operational, legal, or regulatory reasons. We will notify you of any material
              changes by posting the new policy on this page with an updated "Last updated" date.
            </p>
          </section>
        </FadeIn>

        {/* Contact */}
        <FadeIn immediate>
          <section className="rounded-lg p-8 bg-warm">
            <h2 className="text-2xl font-bold mb-4 text-warm-900 tracking-tight">Contact Us</h2>
            <p className="text-warm-700 leading-relaxed mb-4">
              If you have questions about this Privacy Policy or your personal information, please contact us:
            </p>
            <div className="space-y-2 text-warm-600">
              <p>
                <span className="font-medium text-warm-900">Email:</span>{' '}
                <a href={`mailto:${storeEmail}`} className="text-tsPrimary hover:text-red-700 transition">
                  {storeEmail}
                </a>
              </p>
              <p>
                <span className="font-medium text-warm-900">Phone:</span>{' '}
                <a href={storePhoneTel} className="text-tsPrimary hover:text-red-700 transition">
                  {storePhone}
                </a>
              </p>
              <p>
                <span className="font-medium text-warm-900">Address:</span>{' '}
                416 Chalan San Antonio, Tamuning, GU 96913
              </p>
            </div>
          </section>
        </FadeIn>
      </div>
    </div>
  );
}
