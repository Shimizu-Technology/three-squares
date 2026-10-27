export interface CateringDraft { quote: string; notes: string; quoteDirty: boolean; notesDirty: boolean }
export const CATERING_STATUS: Record<string, string> = {
  pending: 'Needs quote', quoted: 'Quote recorded', accepted: 'Accepted', declined: 'Declined', completed: 'Completed', cancelled: 'Cancelled',
};
export function validQuoteAmount(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 99999999.99;
}
export function mergeCateringDraft(draft: CateringDraft | undefined, saved: { admin_notes?: string; quoted_amount?: number | null }): CateringDraft {
  return { quote: draft?.quoteDirty ? draft.quote : saved.quoted_amount == null ? '' : saved.quoted_amount.toFixed(2),
    notes: draft?.notesDirty ? draft.notes : saved.admin_notes || '', quoteDirty: draft?.quoteDirty || false, notesDirty: draft?.notesDirty || false };
}
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Guam', year: 'numeric', month: 'short', day: 'numeric' });
export function cateringEventDate(value: string) {
  const date = new Date(`${value}T12:00:00+10:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}
