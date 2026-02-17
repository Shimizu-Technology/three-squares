import { useEffect, useState } from 'react';
import { ImageOff, ShoppingBag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import useAppConfig from '../../hooks/useAppConfig';

// ── Configuration ────────────────────────────────────────────────────────────
// Easy to swap: change the icon, colors, or opacity in one place.
const PLACEHOLDER_DEFAULTS = {
  bgClass: 'bg-warm-100',
  logoSrc: '/images/three-squares-placeholder.svg',
  textColor: 'text-warm-400',
  text: '',
};

// ── Variant presets ──────────────────────────────────────────────────────────
const VARIANT_STYLES = {
  card: {
    iconSize: 'w-12 h-12',
    showText: true,
    textSize: 'text-xs',
    gap: 'gap-2',
  },
  detail: {
    iconSize: 'w-16 h-16',
    showText: true,
    textSize: 'text-base',
    gap: 'gap-3',
  },
  thumbnail: {
    iconSize: 'w-6 h-6',
    showText: false,
    textSize: 'text-xs',
    gap: 'gap-1',
  },
} as const;

// ── Props ────────────────────────────────────────────────────────────────────
interface PlaceholderImageProps {
  /** Layout variant — controls icon size and whether "No Image" text appears. */
  variant?: keyof typeof VARIANT_STYLES;
  /** Extra classes merged onto the outer wrapper. */
  className?: string;
  /** Extra classes merged onto the icon element. */
  iconClassName?: string;
  /** Override the default icon (must be a lucide-react icon component). */
  icon?: LucideIcon;
  /** Override the fallback text (only shown for card / detail variants). */
  text?: string;
}

export default function PlaceholderImage({
  variant = 'card',
  className = '',
  iconClassName = '',
  icon: IconOverride,
  text,
}: PlaceholderImageProps) {
  const appConfig = useAppConfig();
  const styles = VARIANT_STYLES[variant];
  const label = text ?? PLACEHOLDER_DEFAULTS.text;
  const logoSrc = appConfig?.placeholder_image_url || PLACEHOLDER_DEFAULTS.logoSrc;
  const [currentLogoSrc, setCurrentLogoSrc] = useState(logoSrc);
  const [logoFailed, setLogoFailed] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- sync props to local state intentionally */
  useEffect(() => {
    setCurrentLogoSrc(logoSrc);
    setLogoFailed(false);
  }, [logoSrc]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center ${PLACEHOLDER_DEFAULTS.bgClass} ${className}`}
    >
      {IconOverride ? (
        <IconOverride
          className={`${styles.iconSize} ${iconClassName}`}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ) : (
        logoFailed ? (
          <ImageOff
            className={`${styles.iconSize} ${PLACEHOLDER_DEFAULTS.textColor} ${iconClassName}`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ) : (
          <img
            src={currentLogoSrc}
            alt="Three Squares"
            className={`w-full h-full object-cover ${iconClassName}`}
            onError={() => {
              if (currentLogoSrc !== PLACEHOLDER_DEFAULTS.logoSrc) {
                setCurrentLogoSrc(PLACEHOLDER_DEFAULTS.logoSrc);
                return;
              }
              setLogoFailed(true);
            }}
          />
        )
      )}
      {styles.showText && label && (
        <span
          className={`${styles.textSize} ${PLACEHOLDER_DEFAULTS.textColor} font-medium mt-1 select-none`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// Re-export a handy icon for consumers that want to swap it inline
export { ImageOff, ShoppingBag };
