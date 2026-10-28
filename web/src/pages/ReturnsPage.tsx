import { Button } from '../components/ui/Button';
import { useEffect, useState } from 'react';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import Breadcrumbs from '../components/Breadcrumbs';
import { configApi } from '../services/api';
import { getStorePhone, getStorePhoneTel, STORE_WHATSAPP_URL } from '../utils/storeContact';
import type { AppConfig } from '../types/order';

export default function ReturnsPage() {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configApi.getConfig().then(setAppConfig).catch(console.error);
  }, []);

  const storeEmail = appConfig?.store_info?.email || 'sales@bgpacific.com';
  const storePhone = getStorePhone(appConfig?.store_info?.phone);

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'Order Issues & Refunds' }
        ]} />
      </div>

      {/* Hero Section */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-warm-900 tracking-tight">
              Order Issues & Refunds
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-warm-600">
              We want you to be satisfied with your Three Squares experience. If something isn't right, we're here to help.
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        {/* Return Window */}
        <FadeIn immediate>
          <div className="mb-16">
            <div className="rounded-lg p-8 bg-warm">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-warm-900">Something Wrong with Your Order?</h2>
                  <p className="text-warm-600">Missing items, incorrect items, or food quality concerns</p>
                </div>
              </div>
              <p className="text-lg text-warm-700 leading-relaxed">
                Please <span className="font-semibold text-warm-900">contact us as soon as possible</span> if something is wrong with your food order.
                Share your order number and what happened so our team can review the issue and help with the next steps.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Conditions */}
        <div className="mb-16">
          <FadeIn immediate>
            <h2 className="text-3xl font-bold mb-8 text-warm-900 tracking-tight">Tell Us What Happened</h2>
          </FadeIn>
          <StaggerContainer immediate className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Eligible */}
            <StaggerItem>
              <div className="rounded-lg p-8 border border-warm-200 h-full">
                <h3 className="text-xl font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Order Issues We Can Review
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Missing items from your order</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Incorrect items or an order mix-up</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Food quality concerns</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Damaged or spilled food on arrival</span>
                  </li>
                </ul>
              </div>
            </StaggerItem>

            {/* Details That Help Us */}
            <StaggerItem>
              <div className="rounded-lg p-8 border border-warm-200 h-full">
                <h3 className="text-xl font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-warm-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8h.01M11 12h1v4h1m8-4a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Details That Help Us
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-warm-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Your order number and contact information</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-warm-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>The location and pickup or delivery time</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-warm-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Which items were affected and what went wrong</span>
                  </li>
                  <li className="flex items-start gap-2 text-warm-600">
                    <svg className="w-5 h-5 text-warm-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Photos of the issue, if available</span>
                  </li>
                </ul>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>

        {/* How to Return */}
        <FadeIn immediate>
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-8 text-warm-900 tracking-tight">How to Report an Order Issue</h2>
            <div className="space-y-6">
              {[
                {
                  step: '1',
                  title: 'Email us',
                  desc: `Send an email to ${storeEmail} with your order number, the affected items, and a description of the issue. You can also call or contact us on WhatsApp.`,
                },
                {
                  step: '2',
                  title: 'Review the details',
                  desc: 'Our team will review your order and may ask for more information to understand what happened.',
                },
                {
                  step: '3',
                  title: 'Discuss the next steps',
                  desc: 'Please speak with our team before bringing food back or arranging a replacement. We will discuss the available options for your order.',
                },
                {
                  step: '4',
                  title: 'Confirm the resolution',
                  desc: 'Our team will explain the agreed resolution and any refund details after reviewing the issue.',
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 bg-warm-900 text-white rounded-full flex items-center justify-center font-bold">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-warm-900 mb-1">{item.title}</h3>
                    <p className="text-warm-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Refund Timeline */}
        <FadeIn immediate>
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-6 text-warm-900 tracking-tight">Refund Processing</h2>
            <div className="rounded-lg p-8 bg-warm">
              <p className="text-lg text-warm-700 leading-relaxed mb-4">
                If a refund is approved, our team will explain how it will be processed.
                The time it takes to appear in your account can depend on your payment provider.
              </p>
              <p className="text-warm-600">
                Contact us if you have questions about an approved refund. Keep your order number handy so we can find your order.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Changes to Your Order */}
        <FadeIn immediate>
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-6 text-warm-900 tracking-tight">Changes to Your Order</h2>
            <div className="prose prose-lg max-w-none">
              <p className="text-lg text-warm-700 leading-relaxed mb-4">
                Need to change or cancel a food order? Contact us as soon as possible at{' '}
                <a href={`mailto:${storeEmail}`} className="text-tsPrimary hover:text-red-700 transition font-medium">
                  {storeEmail}
                </a>{' '}
                with your order number and the change you need.
              </p>
              <p className="text-lg text-warm-700 leading-relaxed">
                Available options depend on whether preparation has started and which items are available. Our team will confirm what can be changed.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* CTA */}
        <FadeIn immediate>
          <div className="text-center py-8">
            <h2 className="text-2xl font-semibold mb-4 text-warm-900 tracking-tight">Need Help?</h2>
            <p className="mb-6 max-w-xl mx-auto text-warm-600">
              Call or message us for help with missing items, incorrect items, food quality, or refund questions.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 justify-center">
              <Button
                href={getStorePhoneTel(storePhone)}
                variant="secondary"
              >
                Call {storePhone}
              </Button>
              <Button
                href={STORE_WHATSAPP_URL}
                variant="secondary"
              >
                WhatsApp
              </Button>
              <Button
                href="/contact"
                variant="primary"
              >
                Contact Us
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Button>
              <Button
                href={`mailto:${storeEmail}`}
                variant="secondary"
              >
                Email {storeEmail}
              </Button>
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
