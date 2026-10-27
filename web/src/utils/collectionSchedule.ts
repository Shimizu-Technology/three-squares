export type CollectionType = 'standard' | 'seasonal' | 'event' | 'limited_time';
export interface CollectionSchedule {
  collection_type?: CollectionType;
  starts_at?: string | null;
  ends_at?: string | null;
  auto_hide?: boolean;
  banner_text?: string | null;
  available?: boolean;
  availability_status?: 'unpublished' | 'upcoming' | 'active' | 'ended';
}

const guamParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Pacific/Guam', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function toGuamDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Map(guamParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}T${parts.get('hour')}:${parts.get('minute')}`;
}

export function fromGuamDateInput(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a valid Guam date and time.');
  const iso = `${value}:00+10:00`;
  if (toGuamDateInput(iso) !== value) throw new Error('Enter a valid Guam date and time.');
  return iso;
}

export function formatGuamDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Guam', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value)) + ' (Guam time)';
}
