import { useEffect, useState } from 'react';
import FadeIn from '../components/animations/FadeIn';
import Breadcrumbs from '../components/Breadcrumbs';
import { configApi } from '../services/api';
import type { AppConfig } from '../types/order';

export default function TermsOfServicePage() {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';
  const storePhone = appConfig?.store_info?.phone || '671-777-1234';
  const storePhoneTel = `tel:${storePhone.replace(/[^\d+]/g, '')}`;

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Terms of Service' }
        ]} />
      </div>

      {/* Hero Section */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-warm-900 tracking-tight">
              Terms of Service
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-warm-500">
              Please review these terms carefully before using our website or placing an order.
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        <FadeIn immediate>
          <p className="text-sm text-warm-400 mb-12">
            Last updated: January 1, 2025
          </p>
        </FadeIn>

        {/* Introduction */}
        <FadeIn immediate>
          <section className="mb-12">
            <p className="text-lg text-warm-600 leading-relaxed">
              Welcome to Three Squares. These Terms of Service (&quot;Terms&quot;) govern your use of our website
              at bgpacific.com and any purchases you make through our online store. By accessing our website
              or placing an order, you agree to be bound by these Terms.
            </p>
          </section>
        </FadeIn>

        {/* General Use */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Use of Our Website</h2>
            <p className="text-warm-600 leading-relaxed mb-4">
              You agree to use our website for lawful purposes only. You must not:
            </p>
            <ul className="space-y-2">
              {[
                'Use the site in any way that violates applicable laws or regulations',
                'Attempt to gain unauthorized access to any part of our website or systems',
                'Reproduce, duplicate, or resell any part of our website without permission',
                'Use automated tools to scrape, extract, or collect data from our website',
                'Transmit any harmful code, viruses, or disruptive technologies',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-warm-500">
                  <span className="text-tsPrimary font-bold leading-none mt-1">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </FadeIn>

        {/* Products & Orders */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Products & Orders</h2>
            <p className="text-warm-600 leading-relaxed mb-4">
              All products are subject to availability. We reserve the right to limit quantities or
              discontinue any product at any time without notice.
            </p>
            <p className="text-warm-600 leading-relaxed mb-4">
              We make every effort to display product colors, images, and descriptions as accurately as
              possible. However, we cannot guarantee that your monitor or device will display colors
              exactly as they appear in person.
            </p>
            <p className="text-warm-600 leading-relaxed">
              By placing an order, you confirm that all information you provide is accurate and complete.
              We reserve the right to cancel any order if we suspect fraud or if there are errors in
              pricing or product information.
            </p>
          </section>
        </FadeIn>

        {/* Pricing & Payment */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Pricing & Payment</h2>
            <p className="text-warm-600 leading-relaxed mb-4">
              All prices are listed in US Dollars (USD) and are subject to change without notice. Prices
              do not include shipping costs, which are calculated at checkout based on your delivery
              location.
            </p>
            <p className="text-warm-600 leading-relaxed">
              Payment is processed securely through Stripe. We accept major credit cards and other payment
              methods supported by Stripe. Your payment information is never stored on our servers.
            </p>
          </section>
        </FadeIn>

        {/* Shipping */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Shipping & Delivery</h2>
            <p className="text-warm-600 leading-relaxed mb-4">
              We ship from Hagåtña, Guam via USPS. Delivery times vary depending on your location and
              selected shipping method. Estimated delivery times are not guaranteed and may be affected
              by factors beyond our control.
            </p>
            <p className="text-warm-600 leading-relaxed">
              Risk of loss and title for items pass to you upon delivery to the carrier. For full details
              on shipping options and policies, please visit our{' '}
              <a href="/shipping" className="text-tsPrimary hover:text-red-700 transition">
                Shipping Info
              </a>{' '}
              page.
            </p>
          </section>
        </FadeIn>

        {/* Returns & Exchanges */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Returns & Exchanges</h2>
            <div className="rounded-lg p-6 bg-warm">
              <p className="text-warm-600 leading-relaxed mb-4">
                We want you to love your Three Squares gear. If you&apos;re not completely satisfied, please
                review our{' '}
                <a href="/returns" className="text-tsPrimary hover:text-red-700 transition">
                  Returns Policy
                </a>{' '}
                for details on eligibility, timeframes, and how to initiate a return or exchange.
              </p>
              <p className="text-warm-600 leading-relaxed">
                In general, items must be returned in their original, unworn condition within 30 days of
                delivery. Custom or personalized items may not be eligible for return.
              </p>
            </div>
          </section>
        </FadeIn>

        {/* Intellectual Property */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Intellectual Property</h2>
            <p className="text-warm-600 leading-relaxed">
              All content on this website — including text, graphics, logos, images, product designs,
              and software — is the property of Three Squares or its content suppliers and is protected by
              U.S. and international copyright, trademark, and other intellectual property laws. You may
              not reproduce, distribute, or create derivative works from any content without our prior
              written consent.
            </p>
          </section>
        </FadeIn>

        {/* Limitation of Liability */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Limitation of Liability</h2>
            <p className="text-warm-600 leading-relaxed mb-4">
              To the fullest extent permitted by law, Three Squares shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising out of or related to your
              use of our website or purchase of our products.
            </p>
            <p className="text-warm-600 leading-relaxed">
              Our total liability for any claim arising from your use of the website or purchase of
              products shall not exceed the amount you paid for the specific product(s) in question.
            </p>
          </section>
        </FadeIn>

        {/* Disclaimer */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Disclaimer</h2>
            <p className="text-warm-600 leading-relaxed">
              Our website and products are provided &quot;as is&quot; and &quot;as available&quot; without
              warranties of any kind, either express or implied. We do not warrant that the website will
              be uninterrupted, error-free, or free of viruses or other harmful components.
            </p>
          </section>
        </FadeIn>

        {/* Governing Law */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Governing Law</h2>
            <p className="text-warm-600 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the
              Territory of Guam and applicable United States federal law, without regard to conflict
              of law principles.
            </p>
          </section>
        </FadeIn>

        {/* Changes */}
        <FadeIn immediate>
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-warm-900 tracking-tight">Changes to These Terms</h2>
            <p className="text-warm-600 leading-relaxed">
              We reserve the right to update or modify these Terms at any time. Changes will be effective
              immediately upon posting to this page with an updated &quot;Last updated&quot; date. Your
              continued use of our website after changes are posted constitutes acceptance of the
              revised Terms.
            </p>
          </section>
        </FadeIn>

        {/* Contact */}
        <FadeIn immediate>
          <section className="rounded-lg p-8 bg-warm">
            <h2 className="text-2xl font-bold mb-4 text-warm-900 tracking-tight">Contact Us</h2>
            <p className="text-warm-600 leading-relaxed mb-4">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="space-y-2 text-warm-500">
              <p>
                <span className="font-medium text-warm-800">Email:</span>{' '}
                <a href={`mailto:${storeEmail}`} className="text-tsPrimary hover:text-red-700 transition">
                  {storeEmail}
                </a>
              </p>
              <p>
                <span className="font-medium text-warm-800">Phone:</span>{' '}
                <a href={storePhoneTel} className="text-tsPrimary hover:text-red-700 transition">
                  {storePhone}
                </a>
              </p>
              <p>
                <span className="font-medium text-warm-800">Address:</span>{' '}
                121 E. Marine Corps Dr, Suite 1-103 &amp; Suite 1-104, Hagåtña, Guam 96910
              </p>
            </div>
          </section>
        </FadeIn>
      </div>
    </div>
  );
}
