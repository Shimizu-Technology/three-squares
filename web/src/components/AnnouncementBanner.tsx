import { useState, useEffect, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import useAppConfig from '../hooks/useAppConfig';
import { ANNOUNCEMENT_STYLE_COLORS } from '../constants/announcementStyles';

const DISMISS_KEY_PREFIX = 'announcement-dismissed:';

export default function AnnouncementBanner() {
  const config = useAppConfig();
  const prefersReducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const enabled = config?.announcement_enabled && !!config?.announcement_text?.trim();
  // Tie dismiss key to announcement content so updated messages reappear
  const dismissKey = useMemo(
    () => `${DISMISS_KEY_PREFIX}${config?.announcement_text?.trim() ?? ''}`,
    [config?.announcement_text]
  );

  useEffect(() => {
    // Check sessionStorage inside the effect to avoid stale-closure edge cases
    const isDismissed = sessionStorage.getItem(dismissKey) === 'true';
    if (enabled && !isDismissed) {
      setMounted(true);
      if (prefersReducedMotion) {
        setVisible(true);
      } else {
        // Trigger slide-down animation on next frame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setVisible(true));
        });
      }
    }
  }, [enabled, dismissKey, prefersReducedMotion]);

  const handleDismiss = () => {
    if (prefersReducedMotion) {
      setMounted(false);
      sessionStorage.setItem(dismissKey, 'true');
    } else {
      setVisible(false);
      setTimeout(() => {
        setMounted(false);
        sessionStorage.setItem(dismissKey, 'true');
      }, 300);
    }
  };

  if (!mounted || !enabled) return null;

  return (
    <div
      className="overflow-hidden"
      style={prefersReducedMotion ? {
        maxHeight: '200px',
        opacity: 1,
      } : {
        maxHeight: visible ? '200px' : '0px',
        opacity: visible ? 1 : 0,
        transition: 'max-height 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        className="relative flex items-center justify-center px-4 pr-10 py-2 shadow-sm sm:px-10"
        style={{ backgroundColor: ANNOUNCEMENT_STYLE_COLORS[config?.announcement_style ?? 'gold'] ?? ANNOUNCEMENT_STYLE_COLORS.gold }}
      >
        <p className="text-white text-sm font-medium text-center leading-snug">
          {config?.announcement_text}
        </p>
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1 rounded-sm transition-colors"
          aria-label="Dismiss announcement"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
