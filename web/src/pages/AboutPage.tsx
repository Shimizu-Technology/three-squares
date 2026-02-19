import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import Breadcrumbs from '../components/Breadcrumbs';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-warm-50">
      {/* Breadcrumbs */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'About Us' }
        ]} />
      </div>

      {/* Hero Section - Clean and minimal */}
      <div className="bg-warm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <FadeIn direction="none">
            <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 text-gray-900 tracking-tight">
              About Three Squares
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-lg sm:text-xl text-center max-w-2xl mx-auto text-gray-600">
              Good Food, Good Mood, Good Service — Guam's premier comfort food restaurant and catering service
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">

        {/* About Three Squares Section */}
        <FadeIn>
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-6 text-gray-900 tracking-tight">Our Story</h2>
            <div className="max-w-prose">
              <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                Locally owned and operated since 2016, Three Squares is a subsidiary of <strong>B&G 
                Pacific LLC</strong>, bringing over 50 years of combined experience in food and beverage 
                to Guam. Founded by Marie Guerrero (CEO) and Mark Borja (Managing Director), we&apos;re 
                passionate about serving authentic Guam-style comfort food that brings people together.
              </p>
              <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                B&G Pacific also encompasses <strong>Everything Guam LLC</strong>, the home of our 
                Latte Stone Cookies — artisan shortbread cookies baked in small batches and cut in the 
                iconic shape of the latte stone. We&apos;re sharing Guam with the world, one cookie at a time.
              </p>
              <p className="text-lg text-gray-700 leading-relaxed">
                Our menu celebrates the diverse culinary traditions of Guam — from traditional Chamorro 
                dishes like Tinaktak and Kelaguen to American comfort classics prepared with our own 
                island twist. Whether you're joining us for breakfast, lunch, or dinner, we promise a 
                meal that feels like home.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Our Philosophy */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <StaggerItem>
            <div className="rounded-xl p-8 bg-warm text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-tsGold/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-tsGold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Good Food</h3>
              <p className="text-gray-600 leading-relaxed">
                Fresh ingredients, authentic recipes, and dishes made with love. Our kitchen delivers 
                comfort food that satisfies the soul.
              </p>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="rounded-xl p-8 bg-warm text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-tsGold/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-tsGold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Good Mood</h3>
              <p className="text-gray-600 leading-relaxed">
                A warm, welcoming atmosphere where every guest feels like family. Good food naturally 
                creates good vibes.
              </p>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="rounded-xl p-8 bg-warm text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-tsGold/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-tsGold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Good Service</h3>
              <p className="text-gray-600 leading-relaxed">
                Attentive, friendly service from our team who genuinely care about your dining 
                experience.
              </p>
            </div>
          </StaggerItem>
        </StaggerContainer>

        {/* Signature Dishes */}
        <FadeIn>
          <div className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 text-gray-900 tracking-tight">Signature Dishes</h2>
            <div className="max-w-prose">
              <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                Our menu features beloved favorites that keep customers coming back:
              </p>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-tsGold flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  <span><strong>Three Squares Famous Fried Chicken</strong> — Our signature dish, 
                  crispy-fried to perfection</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-tsGold flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  <span><strong>BBQ Kalbi Shortribs</strong> — Korean-style marinated short ribs, 
                  a local favorite</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-tsGold flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  <span><strong>Tinaktak</strong> — Traditional Chamorro dish with beef and coconut milk</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-tsGold flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  <span><strong>Coconut Banana Cake</strong> — Our famous dessert that customers rave about</span>
                </li>
              </ul>
            </div>
          </div>
        </FadeIn>

        {/* Catering Services */}
        <FadeIn>
          <div className="mb-16 rounded-xl p-8 sm:p-10 bg-gradient-to-br from-tsSurface to-white border border-warm-200">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 tracking-tight">Full-Service Catering</h2>
            <p className="text-lg text-gray-700 mb-6 leading-relaxed">
              As a <strong>woman-owned, HUBZone certified</strong> business, Three Squares is proud to 
              offer catering services for corporate events, government functions, and private celebrations. 
              Our catering menu includes:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-tsGold">✓</span>
                <span>Take-Out & Party Platters</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-tsGold">✓</span>
                <span>Lunch & Dinner Buffets</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-tsGold">✓</span>
                <span>Bulk Order Bentos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-tsGold">✓</span>
                <span>Private Events at Three Squares</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-tsGold">✓</span>
                <span>Corporate Meeting Catering</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-tsGold">✓</span>
                <span>Cocktail Buffets</span>
              </div>
            </div>
            <div className="mt-8">
              <a
                href="/catering"
                className="inline-flex items-center gap-2 bg-tsPrimary text-white px-6 py-3 rounded-lg font-medium hover:bg-tsNavy transition"
              >
                View Catering Menu
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>
          </div>
        </FadeIn>

        {/* Locations */}
        <div className="mb-16">
          <FadeIn>
            <h2 className="text-2xl font-semibold mb-8 text-gray-900 tracking-tight">Our Locations</h2>
          </FadeIn>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <StaggerItem>
              <div className="border border-gray-200 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Three Squares - Main Restaurant</h3>
                <p className="text-tsPrimary font-medium mb-4">Chalan San Antonio</p>
                <address className="text-gray-600 not-italic mb-4">
                  416 Chalan San Antonio<br />
                  Tamuning, GU 96913
                </address>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Hours:</strong></p>
                  <p>Tue-Sat: 8am - 8pm</p>
                  <p>Sun: 8am - 5pm</p>
                  <p>Mon: Closed</p>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <a href="tel:+16716462652" className="text-tsPrimary hover:underline font-medium">
                    (671) 646-2652
                  </a>
                </div>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="border border-gray-200 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Three Squares @ Donki</h3>
                <p className="text-tsPrimary font-medium mb-4">Don Quijote Location</p>
                <address className="text-gray-600 not-italic mb-4">
                  Inside Don Quijote<br />
                  Tamuning, Guam
                </address>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Hours:</strong></p>
                  <p>Daily: 10am - 10pm</p>
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>

        {/* Contact Section */}
        <FadeIn>
          <div className="rounded-xl p-8 sm:p-10 mb-16 bg-warm text-center">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 tracking-tight">Get In Touch</h2>
            <p className="text-gray-600 mb-8 max-w-prose mx-auto">
              Questions about our menu or catering services? We'd love to hear from you!
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="tel:+16716462652"
                className="inline-flex items-center gap-2 bg-tsPrimary text-white px-6 py-3 rounded-lg hover:bg-tsNavy transition font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call Us
              </a>
              <a
                href="https://wa.me/16718646656"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-medium"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
              <a
                href="mailto:sales@bgpacific.com"
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email Us
              </a>
            </div>
            <div className="flex justify-center gap-6 mt-8">
              <a
                href="https://www.instagram.com/threesquaresguam"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-tsPrimary transition"
                aria-label="Instagram"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a
                href="https://www.facebook.com/threesquaresguam"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-tsPrimary transition"
                aria-label="Facebook"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
            </div>
          </div>
        </FadeIn>

        {/* Call to Action */}
        <FadeIn>
          <div className="text-center py-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 tracking-tight">Ready to Order?</h2>
            <p className="mb-6 max-w-xl mx-auto text-gray-600">
              Explore our menu and place your order online for dine-in, takeout, or catering.
            </p>
            <a
              href="/products"
              className="group inline-flex items-center gap-2 bg-tsPrimary text-white px-6 py-3 rounded-lg font-medium hover:bg-tsNavy transition"
            >
              View Our Menu
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
