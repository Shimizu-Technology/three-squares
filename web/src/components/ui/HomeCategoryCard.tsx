import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import OptimizedImage from './OptimizedImage';

const layouts = {
  feature: 'aspect-video md:aspect-21/9',
  half: 'aspect-4/3 min-h-[280px]',
  lead: 'aspect-4/3 md:aspect-auto md:h-full min-h-[280px]',
  standard: 'aspect-4/3',
};

/** Branded home navigation; one link, decorative photo, no nested commands. */
interface HomeCategoryCardProps {
  card: {
    id?: number;
    title: string | null;
    subtitle?: string | null;
    button_text?: string | null;
    button_link?: string | null;
    image_url?: string | null;
  };
  layout?: 'feature' | 'half' | 'lead' | 'standard';
}

export function HomeCategoryCard({ card, layout = 'standard' }: HomeCategoryCardProps) {
  return (
    <Link
      to={card.button_link || "/products"}
      data-ui-control="home-category"
      data-home-category-card={layout}
      className={`ui-home-category group relative w-full min-w-0 overflow-hidden rounded-2xl block ${layouts[layout]}`}
    >
      <span className="absolute inset-0" aria-hidden="true">
        <OptimizedImage src={card.image_url} alt="" context="card"
          className="ui-home-category__image w-full h-full object-cover" />
      </span>
      {/* Balanced overlay: keeps photos visible while preserving text readability */}
      <div className="absolute inset-0 bg-black/32" aria-hidden="true" />
      <div className="absolute inset-0 bg-linear-to-t from-black/72 via-black/28 to-transparent" aria-hidden="true" />
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
            <ChevronRight aria-hidden="true" className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
