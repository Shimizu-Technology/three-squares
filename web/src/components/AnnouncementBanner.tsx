import { useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import useAppConfig from '../hooks/useAppConfig';
import { ANNOUNCEMENT_STYLE_COLORS } from '../constants/announcementStyles';

const DISMISS_KEY_PREFIX = 'announcement-dismissed:';

export default function AnnouncementBanner() {
  const config = useAppConfig();
  const prefersReducedMotion = useReducedMotion();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // Tie dismiss key to announcement content so updated messages reappear
  const dismissKey = useMemo(
    () => `${DISMISS_KEY_PREFIX}${config?.announcement_text?.trim() ?? ''}`,
    [config?.announcement_text]
  );
  const enabled = config?.announcement_enabled && !!config?.announcement_text?.trim();
  const persistedDismissed =
    typeof window !== 'undefined' && sessionStorage.getItem(dismissKey) === 'true';
  const dismissed = dismissedKey === dismissKey || persistedDismissed;
  const shouldRender = enabled && !dismissed;

  const handleDismiss = () => {
    sessionStorage.setItem(dismissKey, 'true');
    setDismissedKey(dismissKey);
  };

  return (
    <AnimatePresence initial={false}>
      {shouldRender && (
        <motion.div
          className="overflow-hidden"
          initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
