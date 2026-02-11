import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Plus, Search, Edit, Trash2, Users, Package, ShoppingCart } from 'lucide-react';
import { authDelete, authGet } from '../../services/authApi';

interface Fundraiser {
  id: number;
  name: string;
  slug: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  goal_amount_cents: number | null;
  raised_amount_cents: number | null;
  progress_percentage: number;
  image_url: string | null;
  participant_count: number;
  product_count: number;
  order_count: number;
  is_active: boolean;
  is_upcoming: boolean;
  is_ended: boolean;
  created_at: string;
}

interface FundraisersListResponse {
  fundraisers: Fundraiser[];
}

export default function AdminFundraisersPage() {
  const { getToken } = useAuth();
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Reserved for future modal functionality
  const [_showCreateModal, _setShowCreateModal] = useState(false);
  const [_editingFundraiser, _setEditingFundraiser] = useState<Fundraiser | null>(null);
  void _showCreateModal; void _setShowCreateModal; void _editingFundraiser; void _setEditingFundraiser;

  useEffect(() => {
    loadFundraisers();
  }, [search, statusFilter]);

  const loadFundraisers = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);

      const response = await authGet<FundraisersListResponse>(`/admin/fundraisers?${params.toString()}`, getToken);
      setFundraisers(response.data.fundraisers);
    } catch (error) {
      console.error('Failed to load fundraisers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fundraiser: Fundraiser) => {
    if (!confirm(`Are you sure you want to delete "${fundraiser.name}"? This cannot be undone.`)) return;
    
    try {
      await authDelete(`/admin/fundraisers/${fundraiser.id}`, getToken);
      loadFundraisers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete fundraiser');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  // HAF-121: Handle null/undefined/NaN to prevent $NaN display
  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined || isNaN(cents)) return '-';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusBadge = (fundraiser: Fundraiser) => {
    if (fundraiser.is_active) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Active</span>;
    }
    if (fundraiser.is_upcoming) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Upcoming</span>;
    }
    if (fundraiser.is_ended) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">Ended</span>;
    }
    if (fundraiser.status === 'draft') {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Draft</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">{fundraiser.status}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fundraisers</h1>
          <p className="text-gray-600 mt-1">Manage wholesale fundraiser campaigns</p>
        </div>
        <Link
          to="/admin/fundraisers/new"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Fundraiser
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search fundraisers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Fundraisers List */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading fundraisers...</p>
        </div>
      ) : fundraisers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No fundraisers found</h3>
          <p className="text-gray-600 mb-4">Get started by creating your first fundraiser campaign.</p>
          <Link
            to="/admin/fundraisers/new"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Fundraiser
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {fundraisers.map((fundraiser) => (
            <div key={fundraiser.id} className="bg-white rounded-lg shadow p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Image */}
                <div className="w-full sm:w-24 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                  {fundraiser.image_url ? (
                    <img
                      src={fundraiser.image_url}
                      alt={fundraiser.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{fundraiser.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {getStatusBadge(fundraiser)}
                        <span className="text-sm text-gray-500">
                          {formatDate(fundraiser.start_date)} - {formatDate(fundraiser.end_date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-4 mt-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>{fundraiser.participant_count} participants</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Package className="w-4 h-4" />
                      <span>{fundraiser.product_count} products</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <ShoppingCart className="w-4 h-4" />
                      <span>{fundraiser.order_count} orders</span>
                    </div>
                  </div>

                  {/* Progress */}
                  {fundraiser.goal_amount_cents && (
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">
                          {formatCurrency(fundraiser.raised_amount_cents)} raised
                        </span>
                        <span className="text-gray-600">
                          Goal: {formatCurrency(fundraiser.goal_amount_cents)}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-tsGold rounded-full transition-all"
                          style={{ width: `${Math.min(fundraiser.progress_percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex sm:flex-col gap-2">
                  <Link
                    to={`/admin/fundraisers/${fundraiser.id}`}
                    className="btn-primary flex-1 sm:flex-none text-center text-sm font-medium"
                  >
                    Manage
                  </Link>
                  <Link
                    to={`/admin/fundraisers/${fundraiser.id}/edit`}
                    className="btn-icon text-gray-600 hover:text-tsPrimary hover:bg-gray-100"
                    title="Edit"
                  >
                    <Edit className="w-5 h-5" />
                  </Link>
                  <button
                    onClick={() => handleDelete(fundraiser)}
                    className="btn-icon text-gray-600 hover:text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
