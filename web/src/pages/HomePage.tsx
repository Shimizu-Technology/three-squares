import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { UtensilsCrossed, MapPin, Phone, Clock, ChevronRight } from 'lucide-react';
import FeaturedProducts from '../components/FeaturedProducts';
import FadeIn from '../components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '../components/animations/StaggerContainer';
import { homepageApi, type HomepageSection } from '../services/api';

// Strip emoji characters from text (replace with empty string)
const stripEmoji = (text: string): string =>
  text.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '').replace(/\s{2,}/g, ' ').trim();

// Default fallback content - Three Squares focused
const defaultHero = {
  title: "Good Food. Good Mood.",
  subtitle: "Guam-style comfort food made with love since 2016. Dine in, take out, or let us cater your next event.",
  badge_text: "Three Squares",
  button_text: "View Our Menu",
  button_link: "/products",
  secondary_button_text: "Order Catering",
  secondary_button_link: "/catering",
  background_image_url: "/images/plated1.jpg" as string | null,
  settings: {
    badge_text: "Three Squares",
    secondary_button_text: "Order Catering",
    secondary_button_link: "/catering",
  },
};

const defaultCategoryCards: Array<{
  id?: number;
  title: string;
  subtitle: string;
  button_text: string;
  button_link: string;
  image_url: string;
}> = [
  {
    title: "Daily Menu",
    subtitle: "Fresh island-style plates served daily",
    button_text: "View Menu",
    button_link: "/products",
    image_url: "/images/Cheeseburger.jpg"
  },
  {
    title: "Catering",
    subtitle: "Let us handle your next event",
    button_text: "Learn More",
    button_link: "/catering",
    image_url: "/images/catering4.jpg"
  },
  {
    title: "Locations",
    subtitle: "Two convenient spots on Guam",
    button_text: "Find Us",
    button_link: "/locations",
    image_url: "/images/Three_Squares_%40_Donki.png"
  }
];

const storefrontCards = [
  {
    title: 'Three Squares',
    subtitle: 'Daily comfort food plates and local favorites for pickup.',
    cta: 'Shop Three Squares',
    to: '/shop/three-squares',
    image_url: '/images/Cheeseburger.jpg',
  },
  {
    title: 'Latte Stone Cookies',
    subtitle: 'Artisan shortbread cookies baked in small batches, cut in the iconic shape of the latte stone. Shipped nationwide.',
    cta: 'Shop Cookies',
    to: '/shop/latte-stone-cookies',
    image_url: '/images/IMG-4158.jpg',
  },
  {
    title: 'Catering',
    subtitle: 'Party trays and catering packages for events and gatherings.',
    cta: 'Shop Catering',
    to: '/shop/catering',
    image_url: '/images/Cocktail_Stations_-_Assorted_Poppers.jpg',
  },
];

const heroEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function HomePage() {
  const [hero, setHero] = useState<HomepageSection | null>(null);
  const [categoryCards, setCategoryCards] = useState<HomepageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const data = await homepageApi.getSections();

        if (data.grouped.hero && data.grouped.hero.length > 0) {
          setHero(data.grouped.hero[0]);
        }

        if (data.grouped.category_card && data.grouped.category_card.length > 0) {
          setCategoryCards(data.grouped.category_card);
        }
      } catch {
        // Silently fall back to defaults
      } finally {
        setLoading(false);
      }
    };

    fetchSections();
  }, []);

  // Use dynamic or fallback content
  const isHeroReady = !loading;
  const heroContent = isHeroReady ? (hero || defaultHero) : null;
  const cardsContent = categoryCards.length > 0 ? categoryCards : defaultCategoryCards;
  const heroImageUrl = isHeroReady
    ? heroContent?.background_image_url || defaultHero.background_image_url
    : null;
  const heroSettings = heroContent?.settings || defaultHero.settings;
  const heroBadgeText =
    typeof heroSettings.badge_text === 'string'
      ? heroSettings.badge_text
      : defaultHero.settings.badge_text;
  const secondaryButtonText =
    typeof heroSettings.secondary_button_text === 'string'
      ? heroSettings.secondary_button_text
      : defaultHero.settings.secondary_button_text;
  const secondaryButtonLink =
    typeof heroSettings.secondary_button_link === 'string'
      ? heroSettings.secondary_button_link
      : defaultHero.settings.secondary_button_link;

  // Animation helper — skip motion when user prefers reduced motion
  const heroMotion = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 30 } as const,
          animate: { opacity: 1, y: 0 } as const,
          transition: { duration: 0.8, delay, ease: heroEase },
        };

  return (
    <div className="min-h-screen">
      {/* ============================================================ */}
      {/* HERO SECTION                                                 */}
      {/* Food photo + warm overlay for Three Squares branding         */}
      {/* ============================================================ */}
      <section className="relative bg-warm-900 text-white min-h-[85vh] flex items-center overflow-hidden">
        {/* Background photo */}
        {heroImageUrl && (
          <img
            src={heroImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            aria-hidden="true"
          />
        )}

        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/60" />
        {/* Warm gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(139,69,19,0.3) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.5) 100%)'
          }}
        />

        {/* Subtle warm color orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 w-full text-center">
          {!isHeroReady || !heroContent ? null : (
            <>
              {/* Badge */}
              {heroBadgeText && (
                <motion.div {...heroMotion(0)}>
                  <span
                    className="inline-flex items-center gap-2 px-5 py-2 bg-black/40 backdrop-blur-md border border-white/20 text-sm font-semibold rounded-full mb-8 text-white"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                  >
                    <UtensilsCrossed className="w-4 h-4" />
                    {stripEmoji(heroBadgeText)}
                  </span>
                </motion.div>
              )}

              {/* Heading */}
              <motion.h1
                {...heroMotion(0.15)}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1] tracking-tight"
                style={{ color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 4px 25px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)' }}
              >
                {stripEmoji(heroContent.title || defaultHero.title)}
              </motion.h1>

              {/* Subtitle */}
              {heroContent.subtitle && (
                <motion.p
                  {...heroMotion(0.3)}
                  className="text-lg sm:text-xl mb-12 max-w-2xl mx-auto leading-relaxed font-medium"
                  style={{ color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.9), 0 2px 15px rgba(0,0,0,0.5)' }}
                >
                  {stripEmoji(heroContent.subtitle)}
                </motion.p>
              )}

              {/* CTA Buttons */}
              <motion.div
                {...heroMotion(0.45)}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <Link
                  to={heroContent.button_link || "/products"}
                  className="group btn-primary text-lg px-10 py-4 inline-flex items-center justify-center gap-2"
                >
                  {heroContent.button_text || "View Our Menu"}
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                {secondaryButtonText && secondaryButtonLink && (
                  <Link
                    to={secondaryButtonLink}
                    className="border-2 border-white/50 text-white hover:bg-white/15 rounded-xl text-lg px-8 py-4 inline-flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 font-medium"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                  >
                    {secondaryButtonText}
                  </Link>
                )}
              </motion.div>
            </>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* QUICK INFO BAR                                               */}
      {/* ============================================================ */}
      <section className="bg-warm-100 text-warm-700 py-4 border-y border-warm-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-sm sm:text-base">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-warm-500" />
              <span>2 Locations on Guam</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-warm-500" />
              <a href="tel:+16716462652" className="hover:underline hover:text-warm-900">(671) 646-2652</a>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warm-500" />
              <span>Tue-Sat 8am-8pm</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SHOP BY BUSINESS                                             */}
      {/* ============================================================ */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">
                Shop by Business
              </h2>
              <p className="mt-3 text-warm-600 max-w-2xl mx-auto">
                Enter the storefront that matches what you want to order.
              </p>
            </div>
          </FadeIn>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {storefrontCards.map((card) => (
              <StaggerItem key={card.title}>
                <Link
                  to={card.to}
                  className="group block overflow-hidden rounded-2xl border border-warm-100 bg-white shadow-sm hover:shadow-md transition"
                >
                  <div className="relative h-44 sm:h-48">
                    <img
                      src={card.image_url}
                      alt={card.title}
                      className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/35" />
                  </div>
                  <div className="p-5 sm:p-6">
                    <h3 className="text-xl font-bold text-warm-900 mb-2">{card.title}</h3>
                    <p className="text-warm-600 text-sm leading-relaxed mb-4">{card.subtitle}</p>
                    <span className="inline-flex items-center gap-1.5 text-tsPrimary font-semibold text-sm">
                      {card.cta}
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SHOP BY CATEGORY — bento grid                                */}
      {/* ============================================================ */}
      {!loading && cardsContent.length > 0 && (
        <section className="py-20 sm:py-28 bg-warm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeIn>
              <div className="text-center mb-12 sm:mb-16">
                <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight">
                  What We Offer
                </h2>
                <p className="mt-4 text-warm-600 text-lg max-w-2xl mx-auto">
                  From daily plates to full-service catering, we&apos;ve got you covered
                </p>
                <div className="w-12 h-1 bg-tsGold rounded-full mx-auto mt-6" />
              </div>
            </FadeIn>

            {/* Bento grid — layout adapts to number of cards */}
            {cardsContent.length === 1 && (
              <FadeIn>
                <CategoryCard card={cardsContent[0]} className="aspect-video md:aspect-21/9" />
              </FadeIn>
            )}

            {cardsContent.length === 2 && (
              <StaggerContainer className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <StaggerItem className="md:col-span-6">
                  <CategoryCard card={cardsContent[0]} className="aspect-4/3 min-h-[280px]" />
                </StaggerItem>
                <StaggerItem className="md:col-span-6">
                  <CategoryCard card={cardsContent[1]} className="aspect-4/3 min-h-[280px]" />
                </StaggerItem>
              </StaggerContainer>
            )}

            {cardsContent.length >= 3 && (
              <StaggerContainer className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <StaggerItem className="md:col-span-7 md:row-span-2">
                  <CategoryCard card={cardsContent[0]} className="aspect-4/3 md:aspect-auto md:h-full min-h-[280px]" />
                </StaggerItem>
                <StaggerItem className="md:col-span-5">
                  <CategoryCard card={cardsContent[1]} className="aspect-4/3" />
                </StaggerItem>
                <StaggerItem className="md:col-span-5">
                  <CategoryCard card={cardsContent[2]} className="aspect-4/3" />
                </StaggerItem>
                {cardsContent.slice(3).map((card, i) => (
                  <StaggerItem key={card.id || i + 3} className="md:col-span-4">
                    <CategoryCard card={card} className="aspect-4/3" />
                  </StaggerItem>
                ))}
              </StaggerContainer>
            )}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* FEATURED MENU ITEMS                                          */}
      {/* ============================================================ */}
      <section className="bg-white">
        <FeaturedProducts />
      </section>

      {/* ============================================================ */}
      {/* ABOUT SECTION — editorial split layout                       */}
      {/* ============================================================ */}
      <section className="bg-white py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 items-center">
            {/* Image — 7 columns with decorative offset */}
            <FadeIn direction="left" className="md:col-span-7">
              <div className="relative">
                <img
                  src="/images/staff1.jpeg"
                  alt="Three Squares team at work"
                  className="w-full rounded-2xl relative z-10"
                  loading="lazy"
                />
                {/* Decorative offset rectangle */}
                <div className="absolute z-0 -bottom-4 -right-4 w-full h-full bg-warm rounded-2xl" />
              </div>
            </FadeIn>

            {/* Text — 5 columns */}
            <FadeIn direction="right" delay={0.1} className="md:col-span-5">
              <div>
                <span className="text-sm font-medium text-tsPrimary mb-3 block uppercase tracking-wider">
                  About Us
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-6 text-warm-900 tracking-tight">
                  Good Food, Good Mood, Good Service
                </h2>
                <p className="text-warm-600 mb-6 leading-relaxed">
                  Locally owned and operated since 2016, Three Squares is your home 
                  for authentic Guam-style comfort food. From local favorites like 
                  Loco Moco and Tinaktak to our famous fried chicken, every dish is 
                  made fresh with quality ingredients.
                </p>
                <p className="text-warm-600 mb-8 leading-relaxed">
                  As part of B&G Pacific, we also provide full-service catering 
                  for corporate events, weddings, fiestas, and private gatherings. 
                  We&apos;re proud to be HUBZone certified and rated by over 140 
                  reviewers on Yelp.
                </p>
                <Link
                  to="/about"
                  className="group inline-flex items-center gap-2 text-warm-900 font-semibold hover:text-tsPrimary transition-colors"
                >
                  Learn More About Us
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* LOCATIONS PREVIEW                                            */}
      {/* ============================================================ */}
      <section className="bg-warm-50 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight">
                Visit Us
              </h2>
              <p className="mt-4 text-warm-600 text-lg">
                Two convenient locations to serve you
              </p>
              <div className="w-12 h-1 bg-tsGold rounded-full mx-auto mt-6" />
            </div>
          </FadeIn>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Main Location */}
            <StaggerItem>
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-warm-100 h-full">
                <h3 className="text-xl font-bold text-warm-900 mb-4">Three Squares Main</h3>
                <div className="space-y-3 text-warm-600">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
                    <span>416 Chalan San Antonio, Tamuning</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
                    <div>
                      <p>Tue-Sat: 8am - 8pm</p>
                      <p>Sun: 8am - 5pm</p>
                      <p className="text-warm-400">Mon: Closed</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
                    <a href="tel:+16716462652" className="hover:text-tsPrimary transition-colors">
                      (671) 646-2652
                    </a>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Donki Location */}
            <StaggerItem>
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-warm-100 h-full">
                <h3 className="text-xl font-bold text-warm-900 mb-4">Three Squares @ Donki</h3>
                <div className="space-y-3 text-warm-600">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
                    <span>Inside Don Quijote, Tamuning</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-tsPrimary shrink-0 mt-0.5" />
                    <div>
                      <p>Daily: 10am - 10pm</p>
                      <p className="text-warm-400 text-sm">or until sold out</p>
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>

          <FadeIn delay={0.3}>
            <div className="text-center mt-10">
              <Link
                to="/locations"
                className="inline-flex items-center gap-2 text-tsPrimary font-semibold hover:text-primary-dark transition-colors"
              >
                View All Location Details
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

    </div>
  );
}

/* ================================================================== */
/* CategoryCard — reusable bento card for What We Offer section       */
/* ================================================================== */
interface CategoryCardProps {
  card: {
    id?: number;
    title: string | null;
    subtitle?: string | null;
    button_text?: string | null;
    button_link?: string | null;
    image_url?: string | null;
  };
  className?: string;
}

function CategoryCard({ card, className = '' }: CategoryCardProps) {
  return (
    <Link
      to={card.button_link || "/products"}
      className={`group relative overflow-hidden rounded-2xl block ${className}`}
    >
      <img
        src={card.image_url || "/images/Cheeseburger.jpg"}
        alt={card.title || "Category"}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        loading="lazy"
      />
      {/* Balanced overlay: keeps photos visible while preserving text readability */}
      <div className="absolute inset-0 bg-black/32" />
      <div className="absolute inset-0 bg-linear-to-t from-black/72 via-black/28 to-transparent" />
      {/* Text overlay */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8">
        <div className="rounded-xl bg-black/52 backdrop-blur-md border border-white/12 p-4 sm:p-5">
          <h3
            className="text-xl sm:text-2xl font-bold text-white mb-1"
            style={{ color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 4px 20px rgba(0,0,0,0.5)' }}
          >
            {card.title}
          </h3>
          {card.subtitle && (
            <p
              className="text-white/95 text-sm mb-2"
              style={{ color: '#ffffff', textShadow: '0 1px 8px rgba(0,0,0,0.85)' }}
            >
              {card.subtitle}
            </p>
          )}
          <span
            className="text-white/95 text-sm font-semibold inline-flex items-center gap-1"
            style={{ color: '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,0.75)' }}
          >
            {card.button_text || "Learn More"}
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
