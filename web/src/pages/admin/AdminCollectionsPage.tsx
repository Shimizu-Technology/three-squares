import axios from 'axios';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Eye, Package } from 'lucide-react';
import { formatGuamDate, fromGuamDateInput, toGuamDateInput } from '../../utils/collectionSchedule';
import type { CollectionSchedule, CollectionType } from '../../utils/collectionSchedule';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { authDelete, authGet, authPatch, authPost } from '../../services/authApi';

interface Collection extends CollectionSchedule {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  published: boolean;
  featured: boolean;
  sort_order: number;
  product_count: number;
  created_at: string;
  updated_at: string;
}

interface CollectionsResponse {
  data: Collection[];
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
  const [formError, setFormError] = useState<string | null>(null);
  const editModalRef = useRef<HTMLDivElement | null>(null);
  const editModalContentRef = useRef<HTMLDivElement | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    published: true,
    featured: false,
    sort_order: 0,
    collection_type: 'standard' as CollectionType,
    starts_at: '',
    ends_at: '',
    auto_hide: true,
    banner_text: '',
  });

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      const response = await authGet<CollectionsResponse>('/admin/collections', getToken);
      setCollections(response.data.data || []);
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
      collection_type: collection.collection_type ?? 'standard',
      starts_at: toGuamDateInput(collection.starts_at),
      ends_at: toGuamDateInput(collection.ends_at),
      auto_hide: collection.auto_hide ?? true,
      banner_text: collection.banner_text ?? '',
    });
    setFormError(null);
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
      collection_type: 'standard',
      starts_at: '', ends_at: '', auto_hide: true, banner_text: '',
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('Collection name is required');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      
      const payload = {
        collection: {
          ...formData,
          starts_at: fromGuamDateInput(formData.starts_at, selectedCollection?.starts_at),
          ends_at: fromGuamDateInput(formData.ends_at, selectedCollection?.ends_at),
          slug: selectedCollection?.slug ?? formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        },
      };

      if (selectedCollection) {
        // Update existing
        await authPatch(`/admin/collections/${selectedCollection.id}`, payload, getToken);
        toast.success('Collection updated successfully');
      } else {
        // Create new
        await authPost('/admin/collections', payload, getToken);
        toast.success('Collection created successfully');
      }

      setShowEditModal(false);
      fetchCollections();
    } catch (err) {
      console.error('Failed to save collection:', err);
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      const message = Array.isArray(data?.errors) ? data.errors.join('. ') : data?.error || (err instanceof Error && !axios.isAxiosError(err) ? err.message : 'Failed to save collection');
      setFormError(message);
      editModalContentRef.current?.scrollTo({ top: 0 });
      toast.error(message);
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
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to delete collection' : 'Failed to delete collection');
    } finally {
      setDeleting(false);
    }
  };

  useLockBodyScroll(showEditModal || showDeleteModal);

  useEffect(() => {
    if (!showEditModal) return;
    const previous = document.activeElement as HTMLElement | null;
    editModalRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [showEditModal]);

  useEffect(() => {
    if (showEditModal && formError && !saving) {
      editModalContentRef.current?.scrollTo({ top: 0 });
      editModalRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, [formError, saving, showEditModal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
          <p className="text-gray-600 mt-1">Manage menus, specials and their Guam schedules</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Collection
        </button>
      </div>

      {/* Collections Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Collection
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Products
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sort Order
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {collections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No collections found. Create your first collection!
                </td>
              </tr>
            ) : (
              collections.map((collection) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{collection.name}</div>
                      {collection.description && (
                        <div className="text-sm text-gray-500 line-clamp-1">{collection.description}</div>
                      )}
                      {(collection.starts_at || collection.ends_at) && (
                        <p className="text-xs text-gray-600 mt-1 max-w-xs">
                          {collection.starts_at && <>Starts {formatGuamDate(collection.starts_at)}<br /></>}
                          {collection.ends_at && <>Ends {formatGuamDate(collection.ends_at)}</>}
                        </p>
                      )}
                      {collection.featured && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-tsGold text-gray-900 mt-1">
                          Featured
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Package className="w-4 h-4 mr-1 text-gray-400" />
                      {collection.product_count}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        collection.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {!collection.published ? 'Draft' : collection.availability_status === 'upcoming' ? 'Scheduled' : collection.availability_status === 'ended' ? 'Ended' : 'Published'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.sort_order}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Modal */}
      {showEditModal && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div ref={editModalRef} role="dialog" aria-modal="true" aria-labelledby="collection-editor-title" tabIndex={-1}
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90dvh] flex flex-col min-h-0"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !saving) { event.stopPropagation(); setShowEditModal(false); }
              if (event.key !== 'Tab') return;
              const controls = Array.from(editModalRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)') ?? []);
              const first = controls[0], last = controls[controls.length - 1];
              if (!first) { event.preventDefault(); editModalRef.current?.focus(); }
              else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }}>
            <div className="p-6 border-b border-gray-200 shrink-0">
              <h2 id="collection-editor-title" className="text-2xl font-bold text-gray-900">
                {selectedCollection ? 'Edit Collection' : 'Create Collection'}
              </h2>
            </div>

            <div
              ref={editModalContentRef}
              data-lenis-prevent
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
            >
              <fieldset disabled={saving} className="space-y-4 min-w-0">
              {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
              {/* Name */}
              <div>
                <label htmlFor="collection-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Collection Name *
                </label>
                <input
                  id="collection-name" type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="e.g., Summer Collection"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="collection-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea id="collection-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="Brief description of this collection"
                />
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-4">
                <div>
                  <label htmlFor="collection-type" className="block text-sm font-medium text-gray-700 mb-1">Menu type</label>
                  <select id="collection-type" value={formData.collection_type} onChange={(event) => setFormData({ ...formData, collection_type: event.target.value as CollectionType })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="standard">Standard</option><option value="seasonal">Seasonal</option><option value="event">Special occasion</option><option value="limited_time">Limited time</option>
                  </select>
                </div>
                <p className="text-sm text-gray-600">All dates and times below use Guam time (UTC+10), wherever you are. Leave a date blank for no limit.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="min-w-0"><label htmlFor="collection-start" className="block text-sm font-medium text-gray-700 mb-1">Starts at (Guam)</label>
                    <input id="collection-start" type="datetime-local" value={formData.starts_at} onChange={(event) => setFormData({ ...formData, starts_at: event.target.value })} className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg" /></div>
                  <div className="min-w-0"><label htmlFor="collection-end" className="block text-sm font-medium text-gray-700 mb-1">Ends at (Guam)</label>
                    <input id="collection-end" type="datetime-local" value={formData.ends_at} onChange={(event) => setFormData({ ...formData, ends_at: event.target.value })} className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg" /></div>
                </div>
                <label className="flex items-start gap-2"><input type="checkbox" checked={formData.auto_hide} onChange={(event) => setFormData({ ...formData, auto_hide: event.target.checked })} className="mt-1 rounded border-gray-300 text-tsPrimary" /><span className="text-sm text-gray-700">Hide menu after it ends</span></label>
                <p className="text-xs text-gray-600">Upcoming menus stay hidden. Turning off auto-hide keeps the ended page visible; ordering still closes at the end time. Shared items can remain on another available menu.</p>
                <div><label htmlFor="collection-banner" className="block text-sm font-medium text-gray-700 mb-1">Customer notice (optional)</label>
                  <textarea id="collection-banner" maxLength={200} rows={2} value={formData.banner_text} onChange={(event) => setFormData({ ...formData, banner_text: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g., Thanksgiving specials available through November 26" />
                  <p className="text-xs text-gray-500">{formData.banner_text.length}/200 characters</p>
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label htmlFor="collection-sort" className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <input
                  id="collection-sort" type="number"
                  value={formData.sort_order ?? 0}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
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
                  <span className="ml-2 text-sm text-gray-700">Published (visible during its schedule)</span>
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
              </div>
              </fieldset>
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
              Are you sure you want to delete <strong>{selectedCollection.name}</strong>? This action cannot be undone.
            </p>
            {selectedCollection.product_count > 0 && (
              <p className="text-sm text-amber-600 mb-4">
                This collection has {selectedCollection.product_count} product{selectedCollection.product_count !== 1 ? 's' : ''}. They will not be deleted, but will be removed from this collection.
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

