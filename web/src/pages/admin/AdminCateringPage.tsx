import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Calendar, Users, DollarSign, AlertCircle, CheckCircle, XCircle, Mail, Phone, Building } from 'lucide-react';

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
  const [inquiries, setInquiries] = useState<CateringInquiry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<CateringInquiry | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    try {
      const [inquiriesRes, statsRes] = await Promise.all([
        api.get(`/admin/catering${statusFilter ? `?status=${statusFilter}` : ''}`),
        api.get('/admin/catering/stats'),
      ]);
      setInquiries(inquiriesRes.data.inquiries);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching catering data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInquiryDetails = async (id: number) => {
    try {
      const res = await api.get(`/admin/catering/${id}`);
      setSelectedInquiry(res.data.inquiry);
      setAdminNotes(res.data.inquiry.admin_notes || '');
    } catch (error) {
      console.error('Error fetching inquiry details:', error);
    }
  };

  const handleQuote = async () => {
    if (!selectedInquiry || !quoteAmount) return;
    try {
      await api.post(`/admin/catering/${selectedInquiry.id}/quote`, {
        quoted_amount: parseFloat(quoteAmount),
        admin_notes: adminNotes,
      });
      fetchData();
      fetchInquiryDetails(selectedInquiry.id);
      setQuoteAmount('');
    } catch (error) {
      console.error('Error sending quote:', error);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedInquiry) return;
    try {
      await api.post(`/admin/catering/${selectedInquiry.id}/status`, { status });
      fetchData();
      fetchInquiryDetails(selectedInquiry.id);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleUpdateNotes = async () => {
    if (!selectedInquiry) return;
    try {
      await api.patch(`/admin/catering/${selectedInquiry.id}`, {
        inquiry: { admin_notes: adminNotes },
      });
      fetchInquiryDetails(selectedInquiry.id);
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-warm-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Catering Inquiries</h1>

      {/* Stats Cards */}
      {stats && (
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
          onChange={(e) => setStatusFilter(e.target.value)}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inquiries List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                  </tr>
                ))}
                {inquiries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      No catering inquiries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedInquiry ? (
            <div className="bg-white rounded-lg shadow p-6 space-y-6 sticky top-4">
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-semibold text-gray-900">{selectedInquiry.contact_name}</h2>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[selectedInquiry.status]}`}>
                  {selectedInquiry.status}
                </span>
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
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

              {/* Event Details */}
              <div className="border-t pt-4 space-y-2">
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
                <div className="text-sm">
                  <span className="text-gray-500">Event Type:</span> {EVENT_TYPE_LABELS[selectedInquiry.event_type]}
                </div>
              </div>

              {/* Additional Details */}
              {(selectedInquiry.venue_address || selectedInquiry.menu_preferences || selectedInquiry.dietary_restrictions || selectedInquiry.special_requests) && (
                <div className="border-t pt-4 space-y-3 text-sm">
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

              {/* Quote Section */}
              {selectedInquiry.status === 'pending' && (
                <div className="border-t pt-4 space-y-3">
                  <div className="font-medium text-gray-900">Send Quote</div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Quote Amount ($)</label>
                    <input
                      type="number"
                      value={quoteAmount}
                      onChange={(e) => setQuoteAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500"
                    />
                  </div>
                  <button
                    onClick={handleQuote}
                    disabled={!quoteAmount}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Send Quote
                  </button>
                </div>
              )}

              {/* Quoted Amount Display */}
              {selectedInquiry.quoted_amount && (
                <div className="border-t pt-4">
                  <div className="text-sm text-gray-500">Quoted Amount</div>
                  <div className="text-xl font-bold text-green-600">${selectedInquiry.quoted_amount.toFixed(2)}</div>
                  {selectedInquiry.quoted_at && (
                    <div className="text-xs text-gray-400">
                      Sent {new Date(selectedInquiry.quoted_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Admin Notes */}
              <div className="border-t pt-4 space-y-2">
                <label className="block text-sm font-medium text-gray-700">Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-warm-500 text-sm"
                />
                <button
                  onClick={handleUpdateNotes}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Save Notes
                </button>
              </div>

              {/* Status Actions */}
              <div className="border-t pt-4 space-y-2">
                <div className="font-medium text-gray-900 text-sm">Update Status</div>
                <div className="flex flex-wrap gap-2">
                  {selectedInquiry.status === 'quoted' && (
                    <>
                      <button
                        onClick={() => handleStatusChange('accepted')}
                        className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                      >
                        <CheckCircle className="w-4 h-4" /> Accept
                      </button>
                      <button
                        onClick={() => handleStatusChange('declined')}
                        className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                      >
                        <XCircle className="w-4 h-4" /> Decline
                      </button>
                    </>
                  )}
                  {selectedInquiry.status === 'accepted' && (
                    <button
                      onClick={() => handleStatusChange('completed')}
                      className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200"
                    >
                      <CheckCircle className="w-4 h-4" /> Mark Completed
                    </button>
                  )}
                  {!['completed', 'cancelled'].includes(selectedInquiry.status) && (
                    <button
                      onClick={() => handleStatusChange('cancelled')}
                      className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                    >
                      <XCircle className="w-4 h-4" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
              Select an inquiry to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
