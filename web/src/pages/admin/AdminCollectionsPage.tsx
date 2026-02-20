import axios from 'axios';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Eye, Package, Star, StarOff, Calendar, Clock, Filter } from 'lucide-react';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { authDelete, authGet, authPatch, authPost } from '../../services/authApi';
import { useBusinessLineStore } from '../../store/businessLineStore';

type CollectionType = 'standard' | 'seasonal' | 'event' | 'limited_time';

interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  published: boolean;
  featured: boolean;
  sort_order: number;
  product_count: number;
  business_line: 'three_squares' | 'latte_stone_cookies' | 'bgpacific';
  collection_type: CollectionType;
  starts_at: string | null;
  ends_at: string | null;
  is_featured: boolean;
  auto_hide: boolean;
  banner_text: string | null;
  active_now: boolean;
  expired: boolean;
  upcoming: boolean;
  created_at: string;
  updated_at: string;
}

interface CollectionsResponse {
  data: Collection[];
}

const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  standard: 'Standard',
  seasonal: 'Seasonal',
  event: 'Event',
  limited_time: 'Limited Time',
};

const COLLECTION_TYPE_COLORS: Record<CollectionType, string> = {
  standard: 'bg-gray-100 text-gray-700',
  seasonal: 'bg-orange-100 text-orange-700',
  event: 'bg-purple-100 text-purple-700',
  limited_time: 'bg-red-100 text-red-700',
};

function getStatusBadge(collection: Collection) {
  if (!collection.published) {
    return { label: 'Hidden', className: 'bg-gray-100 text-gray-600' };
  }
  if (collection.expired) {
    return { label: 'Expired', className: 'bg-red-100 text-red-700' };
  }
  if (collection.upcoming) {
    return { label: 'Upcoming', className: 'bg-blue-100 text-blue-700' };
  }
  if (collection.active_now) {
    return { label: 'Active', className: 'bg-green-100 text-green-700' };
  }
  return { label: 'Draft', className: 'bg-gray-100 text-gray-600' };
}

function formatDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminCollectionsPage() {
  const { getToken } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<CollectionType | 'all'>('all');
  const editModalContentRef = useRef<HTMLDivElement | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    published: true,
    featured: false,
    sort_order: 0,
    business_line: 'three_squares' as 'three_squares' | 'latte_stone_cookies' | 'bgpacific',
    collection_type: 'standard' as CollectionType,
    starts_at: '',
    ends_at: '',
    is_featured: false,
    auto_hide: false,
    banner_text: '',
  });

  const selectedBusinessLine = useBusinessLineStore((s) => s.selected);
  const filteredCollections = collections.filter((c) => {
    if (selectedBusinessLine !== 'all' && c.business_line !== selectedBusinessLine) return false;
    if (typeFilter !== 'all' && c.collection_type !== typeFilter) return false;
    return true;
  });

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      const response = await authGet<CollectionsResponse>('/admin/collections', getToken);
      const allCollections = response.data.data || [];
      setCollections(allCollections);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
      toast.error('Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (collection: Collection) => {
    setSelectedCollection(collection);
    setFormData({
      name: collection.name,
      description: collection.description || '',
      published: collection.published,
      featured: collection.featured,
      sort_order: collection.sort_order ?? 0,
      business_line: collection.business_line || 'three_squares',
      collection_type: collection.collection_type || 'standard',
      starts_at: formatDatetimeLocal(collection.starts_at),
      ends_at: formatDatetimeLocal(collection.ends_at),
      is_featured: collection.is_featured ?? false,
      auto_hide: collection.auto_hide ?? false,
      banner_text: collection.banner_text || '',
    });
    setShowEditModal(true);
  };

  const handleCreate = () => {
    setSelectedCollection(null);
    setFormData({
      name: '',
      description: '',
      published: true,
      featured: false,
      sort_order: 0,
      business_line: selectedBusinessLine !== 'all' ? selectedBusinessLine : 'three_squares',
      collection_type: 'standard',
      starts_at: '',
      ends_at: '',
      is_featured: false,
      auto_hide: false,
      banner_text: '',
    });
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Collection name is required');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        collection: {
          name: formData.name,
          description: formData.description,
          published: formData.published,
          featured: formData.featured,
          sort_order: formData.sort_order,
          business_line: formData.business_line,
          collection_type: formData.collection_type,
          starts_at: formData.starts_at || null,
          ends_at: formData.ends_at || null,
          is_featured: formData.is_featured,
          auto_hide: formData.auto_hide,
          banner_text: formData.banner_text || null,
          slug: formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        },
      };

      if (selectedCollection) {
        await authPatch(`/admin/collections/${selectedCollection.id}`, payload, getToken);
        toast.success('Collection updated successfully');
      } else {
        await authPost('/admin/collections', payload, getToken);
        toast.success('Collection created successfully');
      }

      setShowEditModal(false);
      fetchCollections();
    } catch (err) {
      console.error('Failed to save collection:', err);
      toast.error(
        axios.isAxiosError(err)
          ? err.response?.data?.error || 'Failed to save collection'
          : 'Failed to save collection'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCollection) return;

    try {
      setDeleting(true);
      await authDelete(`/admin/collections/${selectedCollection.id}`, getToken);
      toast.success('Collection deleted successfully');
      setShowDeleteModal(false);
      setSelectedCollection(null);
      fetchCollections();
    } catch (err) {
      console.error('Failed to delete collection:', err);
      toast.error(
        axios.isAxiosError(err)
          ? err.response?.data?.error || 'Failed to delete collection'
          : 'Failed to delete collection'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFeatured = async (collection: Collection) => {
    try {
      await authPatch(
        `/admin/collections/${collection.id}`,
        { collection: { is_featured: !collection.is_featured } },
        getToken
      );
      toast.success(collection.is_featured ? 'Removed from featured' : 'Added to featured');
      fetchCollections();
    } catch {
      toast.error('Failed to update collection');
    }
  };

  const handleTogglePublished = async (collection: Collection) => {
    try {
      await authPatch(
        `/admin/collections/${collection.id}`,
        { collection: { published: !collection.published } },
        getToken
      );
      toast.success(collection.published ? 'Collection hidden' : 'Collection published');
      fetchCollections();
    } catch {
      toast.error('Failed to update collection');
    }
  };

  const handleAutoHideExpired = async () => {
    try {
      await authPost('/admin/collections/auto_hide_expired', {}, getToken);
      toast.success('Expired collections hidden');
      fetchCollections();
    } catch {
      toast.error('Failed to auto-hide expired collections');
    }
  };

  useLockBodyScroll(showEditModal || showDeleteModal);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary"></div>
      </div>
    );
  }

  const showDateFields = formData.collection_type !== 'standard';

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
          <p className="text-gray-600 mt-1">Manage your product collections and seasonal menus</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAutoHideExpired}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"
            title="Auto-hide expired collections"
          >
            <Clock className="w-4 h-4" />
            Hide Expired
          </button>
          <button onClick={handleCreate} className="btn-primary flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            Add Collection
          </button>
        </div>
      </div>

      {/* Type Filter */}
      <div className="mb-4 flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500" />
        <div className="flex gap-1">
          {(['all', 'standard', 'seasonal', 'event', 'limited_time'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1 text-sm rounded-full transition ${
                typeFilter === type
                  ? 'bg-tsPrimary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? 'All' : COLLECTION_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Collections Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Collection
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Products
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Schedule
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCollections.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No collections found. Create your first collection!
                </td>
              </tr>
            ) : (
              filteredCollections.map((collection) => {
                const status = getStatusBadge(collection);
                return (
                  <tr key={collection.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{collection.name}</div>
                        {collection.description && (
                          <div className="text-sm text-gray-500 line-clamp-1">{collection.description}</div>
                        )}
                        <div className="flex gap-1 mt-1">
                          {collection.featured && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-tsGold text-gray-900">
                              Featured
                            </span>
                          )}
                          {collection.is_featured && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              ⭐ Spotlight
                            </span>
                          )}
                          {collection.banner_text && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 max-w-[200px] truncate">
                              {collection.banner_text}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          COLLECTION_TYPE_COLORS[collection.collection_type] || COLLECTION_TYPE_COLORS.standard
                        }`}
                      >
                        {COLLECTION_TYPE_LABELS[collection.collection_type] || 'Standard'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Package className="w-4 h-4 mr-1 text-gray-400" />
                        {collection.product_count}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {collection.starts_at || collection.ends_at ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {collection.starts_at
                              ? new Date(collection.starts_at).toLocaleDateString()
                              : '—'}{' '}
                            →{' '}
                            {collection.ends_at
                              ? new Date(collection.ends_at).toLocaleDateString()
                              : '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">Always</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleToggleFeatured(collection)}
                          className={`btn-icon ${collection.is_featured ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600`}
                          title={collection.is_featured ? 'Remove from featured' : 'Add to featured'}
                        >
                          {collection.is_featured ? (
                            <Star className="w-5 h-5 fill-current" />
                          ) : (
                            <StarOff className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleTogglePublished(collection)}
                          className={`btn-icon ${collection.published ? 'text-green-600' : 'text-gray-400'} hover:text-green-700`}
                          title={collection.published ? 'Hide' : 'Publish'}
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <Link
                          to={`/collections/${collection.slug}`}
                          target="_blank"
                          className="btn-icon text-blue-600 hover:text-blue-900"
                          title="View"
                        >
                          <Eye className="w-5 h-5" />
                        </Link>
                        <button
                          onClick={() => handleEdit(collection)}
                          className="btn-icon text-indigo-600 hover:text-indigo-900"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCollection(collection);
                            setShowDeleteModal(true);
                          }}
                          className="btn-icon text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Modal */}
      {showEditModal && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col min-h-0">
            <div className="p-6 border-b border-gray-200 shrink-0">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedCollection ? 'Edit Collection' : 'Create Collection'}
              </h2>
            </div>

            <div
              ref={editModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
              onWheel={(event) => {
                if (editModalContentRef.current) {
                  editModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Collection Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="e.g., Thanksgiving Special"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="Brief description of this collection"
                />
              </div>

              {/* Collection Type & Business Line — side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Collection Type
                  </label>
                  <select
                    value={formData.collection_type}
                    onChange={(e) =>
                      setFormData({ ...formData, collection_type: e.target.value as CollectionType })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  >
                    <option value="standard">Standard</option>
                    <option value="seasonal">Seasonal</option>
                    <option value="event">Event</option>
                    <option value="limited_time">Limited Time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Line
                  </label>
                  <select
                    value={formData.business_line}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        business_line: e.target.value as
                          | 'three_squares'
                          | 'latte_stone_cookies'
                          | 'bgpacific',
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  >
                    <option value="three_squares">Three Squares</option>
                    <option value="latte_stone_cookies">Latte Stone Cookies</option>
                    <option value="bgpacific">B&amp;G Pacific</option>
                  </select>
                </div>
              </div>

              {/* Date Range — shown for non-standard types */}
              {showDateFields && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Starts At
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.starts_at}
                      onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ends At</label>
                    <input
                      type="datetime-local"
                      value={formData.ends_at}
                      onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Banner Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Banner Text
                </label>
                <input
                  type="text"
                  value={formData.banner_text}
                  onChange={(e) => setFormData({ ...formData, banner_text: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="e.g., 🦃 Available Nov 20-28 only!"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Promotional text shown on the collection card
                </p>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order ?? 0}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.published}
                    onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                    className="rounded border-gray-300 text-tsPrimary focus:ring-tsPrimary"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Published (visible to customers)
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="rounded border-gray-300 text-tsPrimary focus:ring-tsPrimary"
                  />
                  <span className="ml-2 text-sm text-gray-700">Featured</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                    className="rounded border-gray-300 text-tsPrimary focus:ring-tsPrimary"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    ⭐ Spotlight Featured (shown prominently on homepage)
                  </span>
                </label>
                {showDateFields && (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.auto_hide}
                      onChange={(e) => setFormData({ ...formData, auto_hide: e.target.checked })}
                      className="rounded border-gray-300 text-tsPrimary focus:ring-tsPrimary"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Auto-hide after end date passes
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : selectedCollection ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedCollection && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Collection?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{selectedCollection.name}</strong>? This action
              cannot be undone.
            </p>
            {selectedCollection.product_count > 0 && (
              <p className="text-sm text-amber-600 mb-4">
                This collection has {selectedCollection.product_count} product
                {selectedCollection.product_count !== 1 ? 's' : ''}. They will not be deleted, but
                will be removed from this collection.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedCollection(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
