// Shared announcement banner style → color map.
// Used by both AnnouncementBanner (public) and AdminSettingsPage (preview).
export const ANNOUNCEMENT_STYLE_COLORS: Record<string, string> = {
  gold:    'var(--color-accent-warm, #D4A030)',
  info:    '#2563EB', // blue-600
  success: '#16A34A', // green-600
  warning: '#D97706', // amber-600
  danger:  '#DC2626', // red-600
};

// For contexts that need raw hex (no CSS variables), e.g. admin preview
export const ANNOUNCEMENT_STYLE_HEX: Record<string, string> = {
  gold:    '#D4A030',
  info:    '#2563EB',
  success: '#16A34A',
  warning: '#D97706',
  danger:  '#DC2626',
};
