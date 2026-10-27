import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { authGet, authPatch, authPost } from '../../services/authApi';
import { Calendar, Users, DollarSign, AlertCircle, CheckCircle, XCircle, Mail, Phone, Building, Eye } from 'lucide-react';
import AdminRequestState from '../../components/admin/AdminRequestState';
import AdminModal from '../../components/admin/AdminModal';

interface CateringInquiry {
  id: number;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  company_name?: string;
  event_type: string;
  event_date: string;
  event_time?: string;
  guest_count: number;
  budget_range?: string;
  status: string;
  days_until_event: number | null;
  urgent: boolean;
  created_at: string;
  venue_address?: string;
  menu_preferences?: string;
  special_requests?: string;
  dietary_restrictions?: string;
  admin_notes?: string;
  quoted_amount?: number;
  quoted_at?: string;
}

interface Stats {
  total: number;
  pending: number;
  quoted: number;
  active: number;
  upcoming_this_week: number;
  urgent: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-gray-100 text-gray-800',
  completed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-800',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding',
  corporate: 'Corporate Event',
  party: 'Party / Celebration',
  graduation: 'Graduation',
  funeral: 'Funeral / Memorial',
  memorial: 'Memorial',
  other: 'Other',
};

export default function AdminCateringPage() {
  const { getToken } = useAuth();
  const [inquiries, setInquiries] = useState<CateringInquiry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<CateringInquiry | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const detailContext = useRef<number | null>(null);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const active = useRef(false);
  const [loadedFilter, setLoadedFilter] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<number, { quote: string; notes: string; notesDirty: boolean }>>({});
  const quoteAmount = detailId === null ? '' : drafts[detailId]?.quote || '';
  const adminNotes = detailId === null ? '' : drafts[detailId]?.notes || '';
  const updateDraft = (patch: Partial<{ quote: string; notes: string }>) => {
    if (detailId === null) return;
    setDrafts(previous => ({ ...previous, [detailId]: { ...(previous[detailId] || { quote: '', notes: '', notesDirty: false }), ...patch, ...(patch.notes !== undefined ? { notesDirty: true } : {}) } }));
  };
  const hasData = loadedFilter === statusFilter;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      listRequest.current += 1;
      detailRequest.current += 1;
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!active.current) return;
    const generation = ++listRequest.current;
    setLoading(true);
    try {
      const [inquiriesRes, statsRes] = await Promise.all([
        authGet<{ inquiries: CateringInquiry[] }>(`/admin/catering${statusFilter ? `?status=${statusFilter}` : ''}`, getToken, { timeout: 20000 }),
        authGet<Stats>('/admin/catering/stats', getToken, { timeout: 20000 }),
      ]);
      if (generation !== listRequest.current) return;
      if (!Array.isArray(inquiriesRes.data.inquiries) || !statsRes.data) throw new Error('Invalid catering response');
      setInquiries(inquiriesRes.data.inquiries);
      setStats(statsRes.data);
      setLoadedFilter(statusFilter);
      setLoadError(false);
    } catch (error) {
      if (generation !== listRequest.current) return;
      console.error('Error fetching catering data:', error);
      setLoadError(true);
    } finally {
      if (generation === listRequest.current) setLoading(false);
    }
  }, [getToken, statusFilter]);

  useEffect(() => {
    void fetchData();
    return () => { listRequest.current += 1; };
  }, [fetchData, refreshVersion]);

  const closeDetails = () => {
    detailContext.current = null;
    detailRequest.current += 1;
    setDetailId(null);
  };

  const fetchInquiryDetails = async (id: number, refresh = false) => {
    if (!active.current || (refresh && detailContext.current !== id)) return;
    if (detailContext.current !== id) {
      setSelectedInquiry(null);
      setDetailError(false);
    }
    detailContext.current = id;
    setDetailId(id);
    const generation = ++detailRequest.current;
    setDetailLoading(true);
    try {
      const res = await authGet<{ inquiry: CateringInquiry }>(`/admin/catering/${id}`, getToken, { timeout: 20000 });
      if (generation !== detailRequest.current) return;
      if (res.data.inquiry?.id !== id) throw new Error('Invalid inquiry response');
      setSelectedInquiry(res.data.inquiry);
      setDrafts(previous => ({
        ...previous, [id]: previous[id]?.notesDirty ? previous[id] : {
          quote: previous[id]?.quote || '', notes: res.data.inquiry.admin_notes || '', notesDirty: false,
        },
      }));
      setDetailError(false);
    } catch (error) {
      if (generation !== detailRequest.current) return;
      console.error('Error fetching inquiry details:', error);
      setDetailError(true);
    } finally {
      if (generation === detailRequest.current) setDetailLoading(false);
    }
  };

  const handleQuote = async () => {
    if (!selectedInquiry || !quoteAmount) return;
    try {
      await authPost(`/admin/catering/${selectedInquiry.id}/quote`, {
        quoted_amount: parseFloat(quoteAmount),
        admin_notes: adminNotes,
      }, getToken);
      if (!active.current) return;
      setRefreshVersion(version => version + 1);
      fetchInquiryDetails(selectedInquiry.id, true);
      setDrafts(previous => ({ ...previous, [selectedInquiry.id]: { ...previous[selectedInquiry.id], quote: previous[selectedInquiry.id]?.quote === quoteAmount ? '' : previous[selectedInquiry.id]?.quote || '', notesDirty: previous[selectedInquiry.id]?.notes === adminNotes ? false : previous[selectedInquiry.id]?.notesDirty || false } }));
    } catch (error) {
      console.error('Error sending quote:', error);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedInquiry) return;
    try {
      await authPost(`/admin/catering/${selectedInquiry.id}/status`, { status }, getToken);
      if (!active.current) return;
      setRefreshVersion(version => version + 1);
      fetchInquiryDetails(selectedInquiry.id, true);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleUpdateNotes = async () => {
    if (!selectedInquiry) return;
    try {
      await authPatch(`/admin/catering/${selectedInquiry.id}`, {
        inquiry: { admin_notes: adminNotes },
      }, getToken);
      setDrafts(previous => ({ ...previous, [selectedInquiry.id]: {
        ...previous[selectedInquiry.id], notesDirty: previous[selectedInquiry.id]?.notes === adminNotes ? false : previous[selectedInquiry.id]?.notesDirty || false,
      } }));
      fetchInquiryDetails(selectedInquiry.id, true);
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Catering Inquiries</h1>
      <button type="button" onClick={() => void fetchData()} disabled={loading} className="btn-secondary mb-4 min-h-11 disabled:opacity-60">Refresh inquiries</button>

      <div className="mb-6">
        <AdminRequestState resource="Catering inquiries and stats" loading={loading} error={loadError} hasData={hasData} onRetry={() => void fetchData()} />
      </div>

      {/* Stats Cards */}
      {hasData && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4">
            <div className="text-sm text-yellow-600">Pending</div>
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-sm text-blue-600">Quoted</div>
            <div className="text-2xl font-bold text-blue-700">{stats.quoted}</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="text-sm text-green-600">Active</div>
            <div className="text-2xl font-bold text-green-700">{stats.active}</div>
          </div>
          <div className="bg-purple-50 rounded-lg shadow p-4">
            <div className="text-sm text-purple-600">This Week</div>
            <div className="text-2xl font-bold text-purple-700">{stats.upcoming_this_week}</div>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-4">
            <div className="text-sm text-red-600">Urgent</div>
            <div className="text-2xl font-bold text-red-700">{stats.urgent}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setLoadError(false); setStatusFilter(e.target.value); }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="quoted">Quoted</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {hasData && <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inquiries List */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {inquiries.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    onClick={() => fetchInquiryDetails(inquiry.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedInquiry?.id === inquiry.id ? 'bg-warm-50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{inquiry.contact_name}</div>
                      <div className="text-sm text-gray-500">{inquiry.company_name || inquiry.contact_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{EVENT_TYPE_LABELS[inquiry.event_type] || inquiry.event_type}</div>
                      <div className="text-sm text-gray-500">{inquiry.guest_count} guests</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{new Date(inquiry.event_date).toLocaleDateString()}</div>
                      {inquiry.urgent && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle className="w-3 h-3" /> Urgent
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[inquiry.status]}`}>
                        {inquiry.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchInquiryDetails(inquiry.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {inquiries.length === 0 && !loading && !loadError && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No catering inquiries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {/* Detail Modal */}
      {detailId !== null && (
        <AdminModal
          open={detailId !== null}
          onClose={closeDetails}
          title={selectedInquiry?.contact_name || `Inquiry #${detailId}`}
          subtitle={selectedInquiry ? `Inquiry #${selectedInquiry.id} • ${EVENT_TYPE_LABELS[selectedInquiry.event_type] || selectedInquiry.event_type}` : undefined}
          maxWidth="max-w-5xl"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeDetails}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          }
        >
          <AdminRequestState resource="Inquiry details" loading={detailLoading} error={detailError} hasData={selectedInquiry?.id === detailId} onRetry={() => void fetchInquiryDetails(detailId, true)} />
          {selectedInquiry && <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[selectedInquiry.status]}`}>
                {selectedInquiry.status}
              </span>
              {selectedInquiry.urgent && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" /> Urgent
                </span>
              )}
              {selectedInquiry.quoted_amount && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
                  Quote: ${selectedInquiry.quoted_amount.toFixed(2)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-2">
                <h3 className="font-semibold text-gray-900">Contact</h3>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${selectedInquiry.contact_email}`} className="text-blue-600 hover:underline">
                    {selectedInquiry.contact_email}
                  </a>
                </div>
                {selectedInquiry.contact_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <a href={`tel:${selectedInquiry.contact_phone}`} className="text-blue-600 hover:underline">
                      {selectedInquiry.contact_phone}
                    </a>
                  </div>
                )}
                {selectedInquiry.company_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="w-4 h-4 text-gray-400" />
                    {selectedInquiry.company_name}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-2">
                <h3 className="font-semibold text-gray-900">Event</h3>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">{new Date(selectedInquiry.event_date).toLocaleDateString()}</span>
                  {selectedInquiry.event_time && <span>at {selectedInquiry.event_time}</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-gray-400" />
                  {selectedInquiry.guest_count} guests
                </div>
                {selectedInquiry.budget_range && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    {selectedInquiry.budget_range}
                  </div>
                )}
              </div>
            </div>

            {(selectedInquiry.venue_address || selectedInquiry.menu_preferences || selectedInquiry.dietary_restrictions || selectedInquiry.special_requests) && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 text-sm">
                <h3 className="font-semibold text-gray-900">Additional Details</h3>
                {selectedInquiry.venue_address && (
                  <div>
                    <div className="text-gray-500 font-medium">Venue</div>
                    <div>{selectedInquiry.venue_address}</div>
                  </div>
                )}
                {selectedInquiry.menu_preferences && (
                  <div>
                    <div className="text-gray-500 font-medium">Menu Preferences</div>
                    <div>{selectedInquiry.menu_preferences}</div>
                  </div>
                )}
                {selectedInquiry.dietary_restrictions && (
                  <div>
                    <div className="text-gray-500 font-medium">Dietary Restrictions</div>
                    <div>{selectedInquiry.dietary_restrictions}</div>
                  </div>
                )}
                {selectedInquiry.special_requests && (
                  <div>
                    <div className="text-gray-500 font-medium">Special Requests</div>
                    <div>{selectedInquiry.special_requests}</div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {selectedInquiry.status === 'pending' && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="font-medium text-gray-900">Send Quote</div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Quote Amount ($)</label>
                    <input
                      type="number"
                      value={quoteAmount}
                      onChange={(e) => updateDraft({ quote: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleQuote}
                    disabled={!quoteAmount}
                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send Quote
                  </button>
                </div>
              )}

              {selectedInquiry.quoted_amount && (
                <div className="rounded-xl border border-gray-200 bg-green-50/40 p-4">
                  <div className="text-sm text-gray-500">Quoted Amount</div>
                  <div className="text-2xl font-bold text-green-600">${selectedInquiry.quoted_amount.toFixed(2)}</div>
                  {selectedInquiry.quoted_at && (
                    <div className="text-xs text-gray-400 mt-1">
                      Sent {new Date(selectedInquiry.quoted_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <label className="block text-sm font-medium text-gray-700">Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => updateDraft({ notes: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent text-sm"
                />
                <button
                  onClick={handleUpdateNotes}
                  className="text-sm font-medium text-tsPrimary hover:text-primary-dark"
                >
                  Save Notes
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <div className="font-medium text-gray-900 text-sm">Update Status</div>
                <div className="flex flex-wrap gap-2">
                  {selectedInquiry.status === 'quoted' && (
                    <>
                      <button
                        onClick={() => handleStatusChange('accepted')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200"
                      >
                        <CheckCircle className="w-4 h-4" /> Accept
                      </button>
                      <button
                        onClick={() => handleStatusChange('declined')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                      >
                        <XCircle className="w-4 h-4" /> Decline
                      </button>
                    </>
                  )}
                  {selectedInquiry.status === 'accepted' && (
                    <button
                      onClick={() => handleStatusChange('completed')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200"
                    >
                      <CheckCircle className="w-4 h-4" /> Mark Completed
                    </button>
                  )}
                  {!['completed', 'cancelled'].includes(selectedInquiry.status) && (
                    <button
                      onClick={() => handleStatusChange('cancelled')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
                    >
                      <XCircle className="w-4 h-4" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>}
        </AdminModal>
      )}
    </div>
  );
}
