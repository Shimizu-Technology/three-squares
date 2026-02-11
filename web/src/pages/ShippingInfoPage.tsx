import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import Breadcrumbs from '../components/Breadcrumbs';

export default function ShippingInfoPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Shipping Info' }
        ]} />
      </div>

      {/* Hero Section */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-warm-900 tracking-tight">
              Shipping Information
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-warm-600">
              Bringing island vibes to your doorstep — from Guam to anywhere in the world.
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        {/* Processing Times */}
        <FadeIn immediate>
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-6 text-warm-900 tracking-tight">Processing Times</h2>
            <div className="rounded-lg p-8 bg-warm">
              <p className="text-lg text-warm-700 leading-relaxed mb-4">
                All orders are processed within <span className="font-semibold text-warm-900">1–3 business days</span> after
                payment is confirmed. Orders placed on weekends or holidays will be processed on the next business day.
              </p>
              <p className="text-warm-600">
                You'll receive an email confirmation when your order is placed and another when it ships with tracking information.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Shipping Options */}
        <div className="mb-16">
          <FadeIn immediate>
            <h2 className="text-3xl font-bold mb-8 text-warm-900 tracking-tight">Shipping Options</h2>
          </FadeIn>

          <StaggerContainer immediate className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Domestic */}
            <StaggerItem>
              <div className="rounded-lg p-8 bg-warm h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-warm-900">Domestic (U.S. & Territories)</h3>
                </div>
                <p className="text-warm-600 leading-relaxed mb-4">
                  We ship all domestic orders via <span className="font-medium text-warm-900">USPS</span> from our location in Guam.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><span className="font-medium text-warm-900">USPS Priority Mail:</span> 5–7 business days</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><span className="font-medium text-warm-900">USPS Priority Mail Express:</span> 2–3 business days</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Free shipping on orders over $75</span>
                  </li>
                </ul>
              </div>
            </StaggerItem>

            {/* International */}
            <StaggerItem>
              <div className="rounded-lg p-8 bg-warm h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-warm-900">International Shipping</h3>
                </div>
                <p className="text-warm-600 leading-relaxed mb-4">
                  We ship internationally via USPS from Guam. Delivery times and rates vary by destination.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span><span className="font-medium text-warm-900">Estimated delivery:</span> 7–21 business days</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Rates calculated at checkout based on weight and destination</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-tsPrimary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Customs duties and taxes are the buyer's responsibility</span>
                  </li>
                </ul>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>

        {/* Tracking */}
        <FadeIn immediate>
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-6 text-warm-900 tracking-tight">Tracking Your Order</h2>
            <div className="prose prose-lg max-w-none">
              <p className="text-lg text-warm-700 leading-relaxed mb-4">
                Once your order ships, you'll receive an email with your USPS tracking number. You can use this number
                to track your package at{' '}
                <a
                  href="https://www.usps.com/manage/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-tsPrimary hover:text-red-700 transition font-medium"
                >
                  usps.com
                </a>.
              </p>
              <p className="text-lg text-warm-700 leading-relaxed">
                If you have any questions about your shipment, feel free to{' '}
                <a href="/contact" className="text-tsPrimary hover:text-red-700 transition font-medium">
                  contact us
                </a>{' '}
                with your order number and we'll be happy to help.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Important Notes */}
        <FadeIn immediate>
          <div className="rounded-lg p-8 bg-warm mb-16">
            <h2 className="text-2xl font-semibold mb-4 text-warm-900 tracking-tight">Important Notes</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-warm-600">
                <span className="text-tsPrimary font-bold text-lg leading-none mt-0.5">•</span>
                <span>Shipping from Guam may take slightly longer than mainland U.S. orders — but we promise the island love is worth the wait!</span>
              </li>
              <li className="flex items-start gap-3 text-warm-600">
                <span className="text-tsPrimary font-bold text-lg leading-none mt-0.5">•</span>
                <span>During peak seasons and holidays, processing and delivery times may be extended.</span>
              </li>
              <li className="flex items-start gap-3 text-warm-600">
                <span className="text-tsPrimary font-bold text-lg leading-none mt-0.5">•</span>
                <span>We are not responsible for delays caused by weather, natural disasters, or carrier issues.</span>
              </li>
              <li className="flex items-start gap-3 text-warm-600">
                <span className="text-tsPrimary font-bold text-lg leading-none mt-0.5">•</span>
                <span>Please ensure your shipping address is correct at checkout. We are not responsible for packages shipped to incorrect addresses.</span>
              </li>
            </ul>
          </div>
        </FadeIn>

        {/* CTA */}
        <FadeIn immediate>
          <div className="text-center py-8">
            <h2 className="text-2xl font-semibold mb-4 text-warm-900 tracking-tight">Have Questions?</h2>
            <p className="mb-6 max-w-xl mx-auto text-warm-600">
              Our team is here to help with any shipping concerns.
            </p>
            <a
              href="/contact"
              className="group inline-flex items-center gap-2 bg-warm-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-warm-800 transition"
            >
              Contact Us
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
