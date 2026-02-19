import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import useAppConfig from '../hooks/useAppConfig';

const DISMISS_KEY = 'announcement-banner-dismissed';

export default function AnnouncementBanner() {
  const config = useAppConfig();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const enabled = config?.announcement_enabled && !!config?.announcement_text?.trim();
  const dismissed = sessionStorage.getItem(DISMISS_KEY) === 'true';

  useEffect(() => {
    if (enabled && !dismissed) {
      setMounted(true);
      // Trigger slide-down animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [enabled, dismissed]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      setMounted(false);
      sessionStorage.setItem(DISMISS_KEY, 'true');
    }, 300);
  };

  if (!mounted || !enabled) return null;

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-out"
      style={{
        maxHeight: visible ? '80px' : '0px',
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="relative flex items-center justify-center px-10 py-2 shadow-sm"
        style={{ backgroundColor: 'var(--color-accent-warm, #D4A030)' }}
      >
        <p className="text-white text-sm font-medium text-center leading-snug">
          {config.announcement_text}
        </p>
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:opacity-70 transition-opacity"
          aria-label="Dismiss announcement"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
