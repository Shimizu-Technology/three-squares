import { useRef, useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Users, Package, ShoppingCart, Settings, Plus, Trash2, Edit, ExternalLink, Upload, Copy, Check } from 'lucide-react';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { authDelete, authGet, authPatch, authPost } from '../../services/authApi';
import toast from 'react-hot-toast';
import { BulkImportModal } from '../../components/admin/fundraisers';

interface Fundraiser {
  id: number;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  goal_amount_cents: number | null;
  raised_amount_cents: number | null;
  progress_percentage: number;
  image_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  pickup_location: string | null;
  pickup_instructions: string | null;
  allow_shipping: boolean;
  public_message: string | null;
  participant_count: number;
  product_count: number;
  order_count: number;
}

interface Participant {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  participant_number: string | null;
  active: boolean;
  display_name: string;
  total_raised_cents: number;
  order_count: number;
}

interface FundraiserOrder {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  payment_status: string;
  total_cents: number;
  created_at: string;
  items: Array<{
    id: number;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    price_cents: number;
  }>;
}

interface FundraiserProduct {
  id: number;
  product_id: number;
  name: string;
  slug: string;
  price_cents: number;
  original_price_cents: number;
  position: number;
  active: boolean;
  image_url: string | null;
  variant_count: number;
  in_stock: boolean;
}

type TabType = 'overview' | 'participants' | 'products' | 'orders';

interface FundraiserResponse {
  fundraiser: Fundraiser;
}

interface ParticipantsResponse {
  participants: Participant[];
}

interface FundraiserProductsResponse {
  products: FundraiserProduct[];
}

interface FundraiserOrdersResponse {
  orders: FundraiserOrder[];
}

interface BulkImportResponse {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
}

export default function AdminFundraiserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getToken } = useAuth();
  
  const [fundraiser, setFundraiser] = useState<Fundraiser | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [products, setProducts] = useState<FundraiserProduct[]>([]);
  const [orders, setOrders] = useState<FundraiserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  
  // Initialize tab from URL query param or default to 'overview'
  const initialTab = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  
  // Modal states
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [_editingParticipant, _setEditingParticipant] = useState<Participant | null>(null);
  void _editingParticipant; void _setEditingParticipant; // Reserved for future edit functionality

  useEffect(() => {
    if (id) loadFundraiser();
  }, [id]);

  useEffect(() => {
    if (fundraiser && activeTab === 'participants') loadParticipants();
    if (fundraiser && activeTab === 'products') loadProducts();
    if (fundraiser && activeTab === 'orders') loadOrders();
  }, [activeTab, fundraiser]);

  const loadFundraiser = async () => {
    try {
      const response = await authGet<FundraiserResponse>(`/admin/fundraisers/${id}`, getToken);
      setFundraiser(response.data.fundraiser);
    } catch (error) {
      console.error('Failed to load fundraiser:', error);
      toast.error('Fundraiser not found');
      navigate('/admin/fundraisers');
    } finally {
      setLoading(false);
    }
  };

  const loadParticipants = async () => {
    try {
      const response = await authGet<ParticipantsResponse>(`/admin/fundraisers/${id}/participants`, getToken);
      setParticipants(response.data.participants);
    } catch (error) {
      console.error('Failed to load participants:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await authGet<FundraiserProductsResponse>(`/admin/fundraisers/${id}/products`, getToken);
      setProducts(response.data.products);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const response = await authGet<FundraiserOrdersResponse>(`/admin/fundraisers/${id}/orders`, getToken);
      setOrders(response.data.orders || []);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      await authPatch(`/admin/fundraisers/${id}/orders/${orderId}`, { order: { status: newStatus } }, getToken);
      toast.success(`Order updated to ${newStatus}`);
      loadOrders();
      loadFundraiser(); // Refresh counts
    } catch (error) {
      toast.error('Failed to update order');
    }
  };

  const handleRemoveProduct = async (fpId: number) => {
    if (!confirm('Remove this product from the fundraiser?')) return;
    try {
      await authDelete(`/admin/fundraisers/${id}/products/${fpId}`, getToken);
      toast.success('Product removed');
      loadProducts();
    } catch (error) {
      toast.error('Failed to remove product');
    }
  };

  const handleDeleteParticipant = async (participant: Participant) => {
    if (!confirm(`Delete participant "${participant.name}"?`)) return;
    try {
      await authDelete(`/admin/fundraisers/${id}/participants/${participant.id}`, getToken);
      toast.success('Participant deleted');
      loadParticipants();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete participant');
    }
  };

  // HAF-121: Handle null/undefined to prevent $NaN display
  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined || isNaN(cents)) {
      return '$0.00';
    }
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!fundraiser) return null;

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Settings },
    { id: 'participants' as TabType, label: 'Participants', icon: Users, count: fundraiser.participant_count },
    { id: 'products' as TabType, label: 'Products', icon: Package, count: fundraiser.product_count },
    { id: 'orders' as TabType, label: 'Orders', icon: ShoppingCart, count: fundraiser.order_count },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/admin/fundraisers"
          className="btn-icon hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{fundraiser.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              fundraiser.status === 'active' ? 'bg-green-100 text-green-800' :
              fundraiser.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {fundraiser.status}
            </span>
            <a
              href={`/fundraisers/${fundraiser.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm link-primary flex items-center gap-1"
            >
              View Public Page <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <Link
          to={`/admin/fundraisers/${id}/edit`}
          className="btn-secondary flex items-center gap-2"
        >
          <Edit className="w-4 h-4" />
          Edit
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? 'border-tsPrimary text-tsPrimary'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow">
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Progress */}
            {fundraiser.goal_amount_cents && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Fundraising Progress</h3>
                <div className="flex justify-between text-sm mb-2">
                  <span>{formatCurrency(fundraiser.raised_amount_cents || 0)} raised</span>
                  <span>Goal: {formatCurrency(fundraiser.goal_amount_cents)}</span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-tsGold rounded-full transition-all"
                    style={{ width: `${Math.min(fundraiser.progress_percentage, 100)}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 mt-1">{fundraiser.progress_percentage.toFixed(1)}% of goal</p>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Details</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Start Date</dt>
                    <dd>{fundraiser.start_date || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">End Date</dt>
                    <dd>{fundraiser.end_date || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Shipping Allowed</dt>
                    <dd>{fundraiser.allow_shipping ? 'Yes' : 'No (Pickup Only)'}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Contact</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Name</dt>
                    <dd>{fundraiser.contact_name || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Email</dt>
                    <dd>{fundraiser.contact_email || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Phone</dt>
                    <dd>{fundraiser.contact_phone || '-'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {fundraiser.pickup_location && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Pickup Location</h3>
                <p className="text-sm text-gray-600">{fundraiser.pickup_location}</p>
                {fundraiser.pickup_instructions && (
                  <p className="text-sm text-gray-500 mt-1">{fundraiser.pickup_instructions}</p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className="font-medium text-gray-900">Participants ({participants.length})</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkImport(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Import CSV
                </button>
                <button
                  onClick={() => setShowAddParticipant(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Participant
                </button>
              </div>
            </div>

            {participants.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No participants yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">#</th>
                      <th className="text-left py-2 px-3">Name</th>
                      <th className="text-left py-2 px-3">Contact</th>
                      <th className="text-right py-2 px-3">Orders</th>
                      <th className="text-right py-2 px-3">Raised</th>
                      <th className="text-right py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{p.participant_number || '-'}</td>
                        <td className="py-2 px-3 font-medium">{p.name}</td>
                        <td className="py-2 px-3 text-gray-600">{p.email || p.phone || '-'}</td>
                        <td className="py-2 px-3 text-right">{p.order_count}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatCurrency(p.total_raised_cents)}</td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <CopyLinkButton 
                              fundraiserSlug={fundraiser.slug} 
                              participantNumber={p.participant_number} 
                            />
                            <button
                              onClick={() => handleDeleteParticipant(p)}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="Delete participant"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'products' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-gray-900">Products ({products.length})</h3>
              <Link
                to={`/admin/fundraisers/${id}/products/new`}
                className="flex items-center gap-2 px-3 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition text-sm"
              >
                <Plus className="w-4 h-4" />
                Create Product
              </Link>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No products added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((fp) => (
                  <div key={fp.id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden shrink-0">
                      {fp.image_url ? (
                        <img src={fp.image_url} alt={fp.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{fp.name}</h4>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-medium text-tsPrimary">{formatCurrency(fp.price_cents)}</span>
                        {fp.price_cents !== fp.original_price_cents && (
                          <span className="line-through text-gray-400">{formatCurrency(fp.original_price_cents)}</span>
                        )}
                        <span className="text-gray-400">•</span>
                        <span>{fp.variant_count} variants</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveProduct(fp.id)}
                      className="btn-icon text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="p-6">
            {ordersLoading ? (
              <div className="text-center py-8 text-gray-500">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No orders yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div key={order.id} className="bg-white border rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="text-sm text-gray-600">{order.customer_name}</p>
                        <p className="text-xs text-gray-500">{order.customer_email}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${(order.total_cents / 100).toFixed(2)}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      {order.items?.map((item, idx) => (
                        <span key={item.id}>
                          {item.quantity}x {item.product_name}
                          {item.variant_name && ` (${item.variant_name})`}
                          {idx < order.items.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'processing' ? 'bg-purple-100 text-purple-800' :
                        order.status === 'shipped' ? 'bg-indigo-100 text-indigo-800' :
                        order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status.toUpperCase()}
                      </span>
                      <div className="flex gap-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'processing')}
                            className="btn btn-sm btn-primary"
                          >
                            Process
                          </button>
                        )}
                        {order.status === 'paid' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'processing')}
                            className="btn btn-sm btn-primary"
                          >
                            Process
                          </button>
                        )}
                        {order.status === 'processing' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'shipped')}
                            className="btn btn-sm btn-primary"
                          >
                            Ship
                          </button>
                        )}
                        {order.status === 'shipped' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            className="btn btn-sm btn-success"
                          >
                            Delivered
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Participant Modal */}
      {showAddParticipant && (
        <AddParticipantModal
          fundraiserId={fundraiser.id}
          onClose={() => setShowAddParticipant(false)}
          onSuccess={() => {
            loadParticipants();
            loadFundraiser();
          }}
        />
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onImport={async (csvContent: string) => {
            const response = await authPost<BulkImportResponse>(
              `/admin/fundraisers/${id}/participants/bulk_import`,
              { csv: csvContent },
              getToken
            );
            loadParticipants();
            loadFundraiser();
            return response.data;
          }}
        />
      )}
    </div>
  );
}

// Add Participant Modal Component
function AddParticipantModal({ 
  fundraiserId, 
  onClose, 
  onSuccess 
}: { 
  fundraiserId: number; 
  onClose: () => void; 
  onSuccess: () => void;
}) {
  useLockBodyScroll(true);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  const { getToken } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    participant_number: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authPost(`/admin/fundraisers/${fundraiserId}/participants`, { participant: form }, getToken);
      toast.success('Participant added');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.errors?.[0] || 'Failed to add participant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0">
        <div className="px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-semibold">Add Participant</h3>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div
            ref={modalContentRef}
            className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
            onWheel={(event) => {
              if (modalContentRef.current) {
                modalContentRef.current.scrollTop += event.deltaY;
              }
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Participant #</label>
              <input
                type="text"
                value={form.participant_number}
                onChange={(e) => setForm({ ...form, participant_number: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="e.g., 001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Participant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Copy Link Button for participant shareable links
function CopyLinkButton({ 
  fundraiserSlug, 
  participantNumber 
}: { 
  fundraiserSlug: string; 
  participantNumber: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const getShareableUrl = () => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/fundraisers/${fundraiserSlug}`;
    return participantNumber ? `${url}?p=${participantNumber}` : url;
  };

  const handleCopy = async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded transition ${
        copied 
          ? 'text-green-600 bg-green-50' 
          : 'text-gray-400 hover:text-tsPrimary hover:bg-gray-100'
      }`}
      title={copied ? 'Copied!' : 'Copy shareable link'}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}
