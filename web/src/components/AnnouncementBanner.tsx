import { IconButton } from './ui/IconButton';
import { useState } from 'react';
import { X } from 'lucide-react';
import useAppConfig from '../hooks/useAppConfig';
import { ANNOUNCEMENT_STYLE_COLORS } from '../constants/announcementStyles';

const DISMISS_KEY_PREFIX = 'announcement-dismissed:';

function wasDismissed(key: string): boolean {
  try { return sessionStorage.getItem(key) === 'true'; }
  catch { return false; }
}

export default function AnnouncementBanner() {
  const config = useAppConfig();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const enabled = config?.announcement_enabled && !!config?.announcement_text?.trim();
  // Tie dismiss key to announcement content so updated messages reappear
  const dismissKey = `${DISMISS_KEY_PREFIX}${config?.announcement_text?.trim() ?? ''}`;

  const handleDismiss = () => {
    try { sessionStorage.setItem(dismissKey, 'true'); }
    catch { /* The in-memory dismissal still works when storage is unavailable. */ }
    setDismissedKey(dismissKey);
  };

  if (!enabled || dismissedKey === dismissKey || wasDismissed(dismissKey)) return null;

  return (
    <div>
      <div
        className="relative min-h-11 flex items-center justify-center px-4 pr-16 py-2 shadow-sm sm:px-10"
        style={{ backgroundColor: ANNOUNCEMENT_STYLE_COLORS[config?.announcement_style ?? 'gold'] ?? ANNOUNCEMENT_STYLE_COLORS.gold }}
      >
        <p className="text-white text-sm font-medium text-center leading-snug">
          {config?.announcement_text}
        </p>
        <span className="absolute right-3 top-1/2 -translate-y-1/2"><IconButton
          onClick={handleDismiss}

          aria-label="Dismiss announcement" variant="ghost" surface="dark"
        >
          <X size={16} />
        </IconButton></span>
      </div>
    </div>
  );
}
