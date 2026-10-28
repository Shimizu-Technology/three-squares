import AdminFilterBar from '../../components/admin/AdminFilterBar';
import { NavigationLink } from '../../components/ui/NavigationLink';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { statusTone } from '../../components/ui/workflowStatus';
import { StatusBadge } from '../../components/ui/StatusBadge';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { Textarea } from '../../components/ui/Textarea';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Field } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';
import { authGet, authPatch, authPost } from '../../services/authApi';
import AdminRequestState from '../../components/admin/AdminRequestState';
import Dialog from '../../components/ui/Dialog';
import { CATERING_STATUS, cateringEventDate, mergeCateringDraft, validQuoteAmount, type CateringDraft } from '../../components/admin/catering/cateringWorkflow';
import { formatGuamDate } from '../../utils/collectionSchedule';

interface CateringInquiry {
  id: number; contact_name: string; contact_email: string; contact_phone?: string; company_name?: string;
  event_type: string; event_date: string; event_time?: string; guest_count: number; budget_range?: string;
  status: string; days_until_event: number | null; urgent: boolean; created_at: string; updated_at?: string;
  venue_address?: string; menu_preferences?: string; special_requests?: string; dietary_restrictions?: string;
  admin_notes?: string; quoted_amount?: number | null; quoted_at?: string;
}
interface Stats { total: number; pending: number; quoted: number; active: number; upcoming_this_week: number; urgent: number }
interface PageMeta { page: number; total: number; total_pages: number }
interface Feedback { error?: string; success?: string; conflict?: boolean }
const transitions: Record<string, [string, string][]> = {
  pending: [['cancelled', 'Cancel inquiry']], quoted: [['accepted', 'Record acceptance'], ['declined', 'Record decline'], ['cancelled', 'Cancel inquiry']],
  accepted: [['completed', 'Mark completed'], ['cancelled', 'Cancel inquiry']], declined: [['cancelled', 'Cancel inquiry']],
};
const failureMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : 'Save not confirmed. Your draft is still here. Refresh details before retrying.';
  const data = error.response?.data;
  return Array.isArray(data?.errors) ? data.errors.join('. ') : data?.error || 'Save not confirmed. Your draft is still here. Refresh details before retrying.';
};

export default function AdminCateringPage() {
  const { getToken } = useAuth();
  const [inquiries, setInquiries] = useState<CateringInquiry[]>([]), [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState('active'), [page, setPage] = useState(1), [meta, setMeta] = useState<PageMeta>({ page: 1, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [loadedKey, setLoadedKey] = useState<string | null>(null), [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedInquiry, setSelectedInquiry] = useState<CateringInquiry | null>(null), [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState(false), [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, CateringDraft>>({}), [feedback, setFeedback] = useState<Record<number, Feedback>>({});
  const active = useRef(false), listRequest = useRef(0), detailRequest = useRef(0), detailContext = useRef<number | null>(null), writePending = useRef(false);
  const opener = useRef<HTMLElement | null>(null), errorRef = useRef<HTMLDivElement>(null);
  const listKey = `${statusFilter}|${page}`, hasData = loadedKey === listKey;
  const draft = detailId === null ? undefined : drafts[detailId], currentFeedback = detailId === null ? undefined : feedback[detailId];
  const quoteAmount = draft?.quote || '', adminNotes = draft?.notes || '';
  const current = selectedInquiry?.id === detailId ? selectedInquiry : null;
  const canWrite = !!current && !saving && !detailLoading && !detailError && !currentFeedback?.conflict;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; listRequest.current++; detailRequest.current++; };
  }, []);
  useEffect(() => { if (currentFeedback?.error) errorRef.current?.focus(); }, [currentFeedback?.error, detailId]);
  const fetchData = useCallback(async () => {
    if (!active.current) return;
    const generation = ++listRequest.current; setLoading(true);
    try {
      const [list, counts] = await Promise.all([
        authGet<{ inquiries: CateringInquiry[]; meta?: PageMeta }>('/admin/catering', getToken, { params: { status: statusFilter, page }, timeout: 20000 }),
        authGet<Stats>('/admin/catering/stats', getToken, { timeout: 20000 }),
      ]);
      if (generation !== listRequest.current) return;
      if (!Array.isArray(list.data.inquiries) || !counts.data) throw new Error('Invalid catering response');
      const pagination = list.data.meta || { page, total: list.data.inquiries.length, total_pages: 1 };
      setPage(pagination.page); setMeta(pagination); setInquiries(list.data.inquiries); setStats(counts.data);
      setLoadedKey(`${statusFilter}|${pagination.page}`); setLoadError(false);
    } catch { if (generation === listRequest.current) setLoadError(true); }
    finally { if (generation === listRequest.current) setLoading(false); }
  }, [getToken, statusFilter, page]);
  useEffect(() => { void fetchData(); return () => { listRequest.current++; }; }, [fetchData, refreshVersion]);

  const fetchInquiryDetails = async (id: number, refresh = false, trigger?: HTMLElement) => {
    if (!active.current || (refresh && detailContext.current !== id) || writePending.current) return;
    if (trigger) opener.current = trigger;
    if (detailContext.current !== id) { setSelectedInquiry(null); setDetailError(false); }
    detailContext.current = id; setDetailId(id); setDetailLoading(true);
    const generation = ++detailRequest.current;
    try {
      const response = await authGet<{ inquiry: CateringInquiry }>(`/admin/catering/${id}`, getToken, { timeout: 20000 });
      if (generation !== detailRequest.current) return;
      if (response.data.inquiry?.id !== id) throw new Error('Invalid inquiry response');
      setSelectedInquiry(response.data.inquiry);
      setDrafts(previous => ({ ...previous, [id]: mergeCateringDraft(previous[id], response.data.inquiry) }));
      setFeedback(previous => ({ ...previous, [id]: {} })); setDetailError(false);
    } catch { if (generation === detailRequest.current) setDetailError(true); }
    finally { if (generation === detailRequest.current) setDetailLoading(false); }
  };
  const closeDetails = () => {
    if (writePending.current) return;
    detailContext.current = null; detailRequest.current++; setDetailId(null);
  };
  const updateDraft = (patch: Partial<{ quote: string; notes: string }>) => {
    if (detailId === null) return;
    setDrafts(previous => ({ ...previous, [detailId]: { ...(previous[detailId] || { quote: '', notes: '', notesDirty: false, quoteDirty: false }), ...patch,
      ...(patch.notes !== undefined ? { notesDirty: true } : {}), ...(patch.quote !== undefined ? { quoteDirty: true } : {}) } }));
  };
  const mutate = async (action: 'quote' | 'notes' | 'status', status?: string) => {
    if (!current || !canWrite || writePending.current) return;
    const id = current.id, submittedQuote = quoteAmount, submittedNotes = adminNotes;
    if (action === 'quote' && !validQuoteAmount(submittedQuote)) {
      setFeedback(previous => ({ ...previous, [id]: { error: 'Enter a positive quote amount with at most two decimal places (up to 99,999,999.99).' } })); return;
    }
    writePending.current = true; setSaving(true); setFeedback(previous => ({ ...previous, [id]: {} }));
    try {
      const version = { expected_updated_at: current.updated_at };
      const response = action === 'notes'
        ? await authPatch<{ inquiry: CateringInquiry }>(`/admin/catering/${id}`, { ...version, inquiry: { admin_notes: submittedNotes } }, getToken, { timeout: 20000 })
        : await authPost<{ inquiry: CateringInquiry }>(`/admin/catering/${id}/${action}`, { ...version, ...(action === 'quote' ? { quoted_amount: submittedQuote, admin_notes: submittedNotes } : { status }) }, getToken, { timeout: 20000 });
      if (!active.current) return;
      const saved = response.data.inquiry;
      if (saved?.id !== id || !saved.updated_at) throw new Error('Save response not confirmed. Refresh details before retrying.');
      if (detailContext.current === id) setSelectedInquiry(saved);
      setDrafts(previous => {
        const existing = previous[id];
        return { ...previous, [id]: mergeCateringDraft(existing ? { ...existing,
          notesDirty: action !== 'status' && existing.notes === submittedNotes ? false : existing.notesDirty,
          quoteDirty: action === 'quote' && existing.quote === submittedQuote ? false : existing.quoteDirty } : undefined, saved) };
      });
      setFeedback(previous => ({ ...previous, [id]: { success: action === 'quote' ? 'Quote recorded. No email was sent by this app. Contact the customer separately.' : action === 'notes' ? 'Follow-up notes saved. This is a staff record, not a delivery receipt.' : 'Inquiry status recorded. No message was sent.' } }));
      setRefreshVersion(value => value + 1);
    } catch (error) {
      if (!active.current) return;
      const conflict = axios.isAxiosError(error) && error.response?.status === 409;
      // Unconfirmed writes also require an explicit refresh before another attempt.
      const unknown = !axios.isAxiosError(error) || !error.response || error.response.status >= 500;
      setFeedback(previous => ({ ...previous, [id]: { error: failureMessage(error), conflict: conflict || unknown } }));
    } finally { writePending.current = false; if (active.current) setSaving(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 [overflow-wrap:anywhere]">
    <AdminPageHeader title="Catering follow-up" subtitle={<>All-location inquiries for owners and managers. Record quotes and customer follow-up here; contact customers outside this app.</>} actions={<><IconButton aria-label="Refresh inquiries" type="button" onClick={() => void fetchData()} disabled={loading}><RefreshCw /></IconButton></>} />
    <AdminRequestState resource="Catering inquiries and stats" loading={loading} error={loadError} hasData={hasData} onRetry={() => void fetchData()} />
    {stats && hasData && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Needs quote', stats.pending], ['Quotes recorded', stats.quoted], ['Active inquiries', stats.active], ['Within 7 days', stats.urgent]].map(([label, value]) => <div key={label} className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm text-gray-700">{label}</p><p className="text-2xl font-semibold tabular-nums text-gray-900">{value}</p></div>)}</div>}
    <AdminFilterBar label="Catering filters"><Field label="Inquiry status"><Select aria-label="Inquiry status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); setLoadError(false); }}><option value="active">Active inquiries</option><option value="all">All inquiries</option>{Object.entries(CATERING_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></AdminFilterBar>
    {hasData && <>
      <p className="text-sm text-gray-700">{meta.total} matching inquiries · earliest event first</p>
      <div className="grid gap-4 xl:grid-cols-2">{inquiries.map(inquiry => <article key={inquiry.id} aria-label={`Inquiry ${inquiry.id}: ${inquiry.contact_name}`} className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-lg font-semibold text-gray-900">{inquiry.contact_name}</h2><StatusBadge tone={statusTone(inquiry.status)}>{CATERING_STATUS[inquiry.status] || inquiry.status}</StatusBadge></div>
        <p className="break-words text-sm text-gray-700">{inquiry.company_name || inquiry.contact_email}</p>
        <p className="text-gray-800">{cateringEventDate(inquiry.event_date)}{inquiry.event_time && ` · ${inquiry.event_time} (Guam)`}<br />{inquiry.guest_count} guests · {inquiry.event_type}</p>
        {inquiry.urgent && <p className="font-semibold text-amber-900">Event within 7 days</p>}
        <Button variant="primary" type="button" onClick={event => void fetchInquiryDetails(inquiry.id, false, event.currentTarget)}>View</Button>
      </article>)}</div>
      {inquiries.length === 0 && !loading && !loadError && <p className="rounded-lg border border-gray-200 bg-white p-6 text-gray-700">No catering inquiries found</p>}
      {meta.total_pages > 1 && <nav aria-label="Catering inquiry pages" className="flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" type="button" onClick={() => setPage(value => value - 1)} disabled={loading || page <= 1}>Previous inquiries</Button><span className="text-gray-700">Page {page} of {meta.total_pages}</span><Button variant="secondary" type="button" onClick={() => setPage(value => value + 1)} disabled={loading || page >= meta.total_pages}>Next inquiries</Button></nav>}
    </>}
    <Dialog open={detailId !== null} onOpenChange={open => { if (!open) closeDetails(); }} dismissible={!saving} labelledBy="catering-detail-title" returnFocusRef={opener} className="w-full rounded-xl sm:w-4xl">
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col"><header className="shrink-0 space-y-2 border-b border-gray-200 p-4 sm:p-6"><h2 id="catering-detail-title" className="break-words text-xl font-bold text-gray-900">{current?.contact_name || `Inquiry #${detailId}`}</h2><p className="text-sm text-gray-700">Inquiry #{detailId} · Manual follow-up</p></header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <AdminRequestState resource="Inquiry details" loading={detailLoading} error={detailError} hasData={!!current} onRetry={() => { if (detailId !== null) void fetchInquiryDetails(detailId, true); }} />
          {current && <>
            <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge tone={statusTone(current.status)}>{CATERING_STATUS[current.status] || current.status}</StatusBadge><Button variant="secondary" type="button" disabled={saving || detailLoading} onClick={() => void fetchInquiryDetails(current.id, true)}>Refresh details</Button></div>
            {currentFeedback?.error && <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900"><p>{currentFeedback.error}</p>{currentFeedback.conflict && <p>Your draft is retained. Refresh details, compare the saved notes below, then decide whether to retry.</p>}</div>}
            {currentFeedback?.success && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-900">{currentFeedback.success}</p>}
            <section className="space-y-2 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Contact outside this app</h3><p className="text-sm text-gray-700">Opening an email or phone link does not send a quote or record contact. Add the channel, date and outcome to the follow-up notes after you contact the customer.</p><NavigationLink href={`mailto:${current.contact_email}`}>{current.contact_email}</NavigationLink>{current.contact_phone && <NavigationLink href={`tel:${current.contact_phone}`}>{current.contact_phone}</NavigationLink>}{current.company_name && <p className="break-words text-gray-700">{current.company_name}</p>}</section>
            <section className="space-y-2 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Event details</h3><p className="text-gray-800">{cateringEventDate(current.event_date)}{current.event_time && ` · ${current.event_time} (Guam)`} · {current.guest_count} guests</p>{[['Budget', current.budget_range], ['Venue', current.venue_address], ['Menu preferences', current.menu_preferences], ['Dietary restrictions', current.dietary_restrictions], ['Special requests', current.special_requests]].filter(([,value]) => value).map(([label,value]) => <p key={label} className="whitespace-pre-wrap break-words text-gray-700"><span className="font-medium">{label}: </span>{value}</p>)}</section>
            {current.quoted_amount != null && <section className="rounded-lg border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Recorded quote: ${current.quoted_amount.toFixed(2)}</h3>{current.quoted_at && <p className="mt-1 text-sm text-gray-700">Recorded {formatGuamDate(current.quoted_at)}</p>}<p className="mt-2 text-sm text-gray-700">This is a saved quote, not evidence of delivery, customer acceptance, a deposit or a reservation.</p></section>}
            <fieldset disabled={!canWrite} className="min-w-0 space-y-5">
              {['pending', 'quoted'].includes(current.status) && <section className="space-y-3 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Record quote details</h3><p className="text-sm text-gray-700">This saves the amount and follow-up notes. No quote email is sent by this app.</p><Field label="Quote amount ($)"><Input type="text" inputMode="decimal" value={quoteAmount} onChange={event => updateDraft({ quote: event.target.value })} placeholder="0.00" /></Field><Button loading={saving} variant="primary" type="button" onClick={() => void mutate('quote')} disabled={!canWrite || !quoteAmount}>Record quote</Button></section>}
              <section className="space-y-3 rounded-lg border border-gray-200 p-4"><Field label="Follow-up notes (staff recorded)"><Textarea value={adminNotes} onChange={event => updateDraft({ notes: event.target.value })} rows={5} placeholder="Record the actual contact channel, date/time and outcome." /></Field><Button variant="secondary" type="button" disabled={!canWrite} onClick={() => void mutate('notes')}>Save Notes</Button></section>
              {(transitions[current.status] || []).length > 0 && <section className="space-y-3 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Record the actual outcome</h3><p className="text-sm text-gray-700">Record acceptance or decline only after the customer tells you. These actions do not take a payment or confirm a deposit.</p><div className="flex flex-wrap gap-2">{transitions[current.status].map(([status,label]) => <Button variant="secondary" key={status} type="button" disabled={!canWrite} onClick={() => void mutate('status', status)}>{label}</Button>)}</div></section>}
            </fieldset>
            {draft?.notesDirty && adminNotes !== (current.admin_notes || '') && <details className="rounded-lg border border-gray-200 p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium text-gray-800">Latest saved notes — compare with your draft</summary><p className="whitespace-pre-wrap break-words text-gray-700">{current.admin_notes || 'No saved notes.'}</p></details>}
          </>}
        </div><footer className="flex shrink-0 justify-end border-t border-gray-200 p-4"><Button variant="secondary" type="button" aria-label="Close modal" disabled={saving} onClick={closeDetails}>Close</Button></footer>
      </div>
    </Dialog>
  </div>;
}
