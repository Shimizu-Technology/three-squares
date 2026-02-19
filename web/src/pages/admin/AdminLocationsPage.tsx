import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { authDelete, authGet, authPost, authPut } from '../../services/authApi';
import api from '../../services/api';

interface Collection {
  id: number;
  name: string;
  slug: string;
}

interface Location {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  active: boolean;
  hours_json: Record<string, string>;
  location_type: 'permanent' | 'popup' | 'event';
  starts_at: string | null;
  ends_at: string | null;
  auto_deactivate: boolean;
  description: string | null;
  menu_collection_id: number | null;
  qr_code_url: string | null;
  menu_collection: { id: number; name: string; slug: string } | null;
}

interface LocationsResponse {
  data: Location[];
}

interface CollectionsResponse {
  data: Collection[];
}

const LOCATION_TYPES = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'popup', label: 'Pop-up' },
  { value: 'event', label: 'Event' },
];

const emptyForm = {
  name: '',
  slug: '',
  address: '',
  phone: '',
  active: true,
  location_type: 'permanent' as 'permanent' | 'popup' | 'event',
  starts_at: '',
  ends_at: '',
  auto_deactivate: false,
  description: '',
  menu_collection_id: '' as string | number,
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusInfo(location: Location): { color: string; label: string; dotClass: string } {
  if (!location.active) {
    return { color: 'red', label: 'Inactive', dotClass: 'bg-red-500' };
  }
  if (location.starts_at && new Date(location.starts_at) > new Date()) {
    return { color: 'amber', label: 'Scheduled', dotClass: 'bg-amber-500' };
  }
  return { color: 'green', label: 'Active', dotClass: 'bg-green-500' };
}

function LocationTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    permanent: 'bg-blue-100 text-blue-700',
    popup: 'bg-purple-100 text-purple-700',
    event: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[type] || 'bg-gray-100 text-gray-700'}`}>
      {type === 'popup' ? 'Pop-up' : type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

interface QrModalData {
  location: Location;
  qrCode: string;
  menuUrl: string;
}

function QrCodeModal({
  data,
  onClose,
  getToken,
}: {
  data: QrModalData;
  onClose: () => void;
  getToken: () => Promise<string | null>;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownload = async (fmt: 'png' | 'svg') => {
    try {
      const token = await getToken();
      const response = await api.post(
        `/admin/locations/${data.location.id}/generate_qr`,
        { format: fmt },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `location-${data.location.slug}-qr.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Failed to download ${fmt.toUpperCase()}`);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(data.menuUrl);
      toast.success('URL copied to clipboard');
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const safeName = escapeHtml(data.location.name);
    const safeUrl = escapeHtml(data.menuUrl);
    win.document.write(`
      <html>
        <head>
          <title>QR Code - ${safeName}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
            img { max-width: 400px; }
            h2 { margin-bottom: 8px; }
            p { color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <h2>${safeName}</h2>
          <img src="${escapeHtml(data.qrCode)}" alt="QR Code" />
          <p>${safeUrl}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.onload = () => { win.print(); win.close(); };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">QR Code</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div ref={printRef} className="flex flex-col items-center">
          <p className="text-sm font-medium text-gray-700 mb-3">{data.location.name}</p>
          <img src={data.qrCode} alt={`QR code for ${data.location.name}`} className="w-64 h-64" />
        </div>

        <div className="mt-4 bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Menu URL</p>
          <p className="text-sm text-gray-800 font-mono break-all">{data.menuUrl}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => handleDownload('png')}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Download PNG
          </button>
          <button
            onClick={() => handleDownload('svg')}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Download SVG
          </button>
          <button
            onClick={handleCopyUrl}
            className="px-3 py-2 text-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            Copy URL
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLocationsPage() {
  const { getToken } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [qrModal, setQrModal] = useState<QrModalData | null>(null);
  const [generatingQrId, setGeneratingQrId] = useState<number | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authGet<LocationsResponse>('/admin/locations', getToken);
      setLocations(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const fetchCollections = useCallback(async () => {
    try {
      const response = await authGet<CollectionsResponse>('/admin/collections', getToken);
      setCollections(response.data.data || []);
    } catch {
      // Collections are optional for the form
    }
  }, [getToken]);

  useEffect(() => {
    fetchLocations();
    fetchCollections();
  }, [fetchLocations, fetchCollections]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }

    try {
      setCreating(true);
      const payload: Record<string, unknown> = { ...form };
      if (!payload.starts_at) delete payload.starts_at;
      if (!payload.ends_at) delete payload.ends_at;
      if (!payload.description) delete payload.description;
      if (!payload.menu_collection_id) {
        delete payload.menu_collection_id;
      } else {
        payload.menu_collection_id = Number(payload.menu_collection_id);
      }
      await authPost('/admin/locations', { location: payload }, getToken);
      toast.success('Location created');
      setForm(emptyForm);
      await fetchLocations();
    } catch (error: unknown) {
      console.error('Failed to create location:', error);
      toast.error('Failed to create location');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (location: Location) => {
    try {
      setSavingId(location.id);
      await authPost(`/admin/locations/${location.id}/toggle_active`, {}, getToken);
      toast.success(`Location ${location.active ? 'deactivated' : 'activated'}`);
      await fetchLocations();
    } catch (error) {
      console.error('Failed to toggle location:', error);
      toast.error('Failed to toggle location');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (location: Location) => {
    if (!window.confirm(`Delete location "${location.name}"?`)) return;

    try {
      setDeletingId(location.id);
      await authDelete(`/admin/locations/${location.id}`, getToken);
      toast.success('Location deleted');
      await fetchLocations();
    } catch (error) {
      console.error('Failed to delete location:', error);
      toast.error('Failed to delete location');
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = (location: Location) => {
    setEditingId(location.id);
    setEditForm({
      name: location.name,
      slug: location.slug,
      address: location.address || '',
      phone: location.phone || '',
      active: location.active,
      location_type: location.location_type,
      starts_at: location.starts_at ? location.starts_at.slice(0, 16) : '',
      ends_at: location.ends_at ? location.ends_at.slice(0, 16) : '',
      auto_deactivate: location.auto_deactivate,
      description: location.description || '',
      menu_collection_id: location.menu_collection_id || '',
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    try {
      setSaving(true);
      const payload: Record<string, unknown> = { ...editForm };
      if (!payload.starts_at) payload.starts_at = null;
      if (!payload.ends_at) payload.ends_at = null;
      if (!payload.description) payload.description = null;
      if (!payload.menu_collection_id) {
        payload.menu_collection_id = null;
      } else {
        payload.menu_collection_id = Number(payload.menu_collection_id);
      }
      await authPut(`/admin/locations/${editingId}`, { location: payload }, getToken);
      toast.success('Location updated');
      setEditingId(null);
      await fetchLocations();
    } catch (error) {
      console.error('Failed to update location:', error);
      toast.error('Failed to update location');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoDeactivate = async () => {
    try {
      const response = await authPost<{ data: { deactivated_count: number }; message: string }>(
        '/admin/locations/auto_deactivate_expired',
        {},
        getToken
      );
      const count = response.data.data?.deactivated_count ?? 0;
      toast.success(`${count} location(s) auto-deactivated`);
      await fetchLocations();
    } catch (error) {
      console.error('Failed to auto-deactivate:', error);
      toast.error('Failed to auto-deactivate expired locations');
    }
  };

  const handleGenerateQr = async (location: Location) => {
    try {
      setGeneratingQrId(location.id);
      const response = await authPost<{ data: { qr_code: string; menu_url: string } }>(
        `/admin/locations/${location.id}/generate_qr`,
        { format: 'data_uri' },
        getToken
      );
      const { qr_code, menu_url } = response.data.data;
      setQrModal({ location, qrCode: qr_code, menuUrl: menu_url });
      // Refresh to update qr_code_url on the location
      await fetchLocations();
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      toast.error('Failed to generate QR code');
    } finally {
      setGeneratingQrId(null);
    }
  };

  const isTemporary = (type: string) => type === 'popup' || type === 'event';

  const renderForm = (
    formData: typeof emptyForm,
    setFormData: React.Dispatch<React.SetStateAction<typeof emptyForm>>,
    onSubmit: (e: React.FormEvent) => Promise<void>,
    submitting: boolean,
    submitLabel: string,
    cancelFn?: () => void
  ) => (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <input
        type="text"
        placeholder="Location name"
        value={formData.name}
        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        className="px-3 py-2 border border-gray-300 rounded-lg"
      />
      <input
        type="text"
        placeholder="slug (e.g. three-squares-main)"
        value={formData.slug}
        onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
        className="px-3 py-2 border border-gray-300 rounded-lg"
      />
      <input
        type="text"
        placeholder="Address"
        value={formData.address}
        onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
        className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2"
      />
      <input
        type="text"
        placeholder="Phone"
        value={formData.phone}
        onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
        className="px-3 py-2 border border-gray-300 rounded-lg"
      />

      {/* Location Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select
          value={formData.location_type}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              location_type: e.target.value as 'permanent' | 'popup' | 'event',
            }))
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          {LOCATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date range fields - only for popup/event */}
      {isTemporary(formData.location_type) && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
            <input
              type="datetime-local"
              value={formData.starts_at}
              onChange={(e) => setFormData((prev) => ({ ...prev, starts_at: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ends At</label>
            <input
              type="datetime-local"
              value={formData.ends_at}
              onChange={(e) => setFormData((prev) => ({ ...prev, ends_at: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={formData.auto_deactivate}
              onChange={(e) => setFormData((prev) => ({ ...prev, auto_deactivate: e.target.checked }))}
              className="w-4 h-4"
            />
            Auto-deactivate after end date
          </label>
        </>
      )}

      {/* Description */}
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          placeholder="Optional description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Menu Collection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Menu Collection</label>
        <select
          value={formData.menu_collection_id}
          onChange={(e) => setFormData((prev) => ({ ...prev, menu_collection_id: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">None</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={formData.active}
          onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.checked }))}
          className="w-4 h-4"
        />
        Active
      </label>

      <div className="md:col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
        {cancelFn && (
          <button
            type="button"
            onClick={cancelFn}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage pickup locations, pop-ups, and events.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAutoDeactivate}
          className="px-3 py-1.5 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
        >
          Auto-Deactivate Expired
        </button>
      </div>

      {/* Create Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Location</h2>
        {renderForm(form, setForm, handleCreate, creating, 'Create Location')}
      </div>

      {/* Locations List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Existing Locations</h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No locations found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {locations.map((location) => {
              const status = getStatusInfo(location);
              const isEditing = editingId === location.id;

              return (
                <div key={location.id} className="px-6 py-4">
                  {isEditing ? (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        Editing: {location.name}
                      </h3>
                      {renderForm(editForm, setEditForm, handleUpdate, saving, 'Save Changes', () =>
                        setEditingId(null)
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${status.dotClass}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">{location.name}</p>
                            <LocationTypeBadge type={location.location_type} />
                          </div>
                          <p className="text-sm text-gray-500">{location.slug}</p>
                          {location.address && (
                            <p className="text-sm text-gray-500">{location.address}</p>
                          )}
                          {location.description && (
                            <p className="text-sm text-gray-400 mt-1">{location.description}</p>
                          )}
                          {isTemporary(location.location_type) &&
                            (location.starts_at || location.ends_at) && (
                              <p className="text-xs text-gray-400 mt-1">
                                {location.starts_at && `From ${formatDate(location.starts_at)}`}
                                {location.starts_at && location.ends_at && ' — '}
                                {location.ends_at && `Until ${formatDate(location.ends_at)}`}
                                {location.auto_deactivate && (
                                  <span className="ml-2 text-amber-600">(auto-deactivate)</span>
                                )}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(location)}
                          disabled={savingId === location.id}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${
                            location.active
                              ? 'border-green-300 bg-green-50 text-green-700'
                              : 'border-gray-300 bg-gray-50 text-gray-700'
                          } disabled:opacity-50`}
                        >
                          {savingId === location.id
                            ? 'Saving...'
                            : location.active
                              ? 'Active'
                              : 'Inactive'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateQr(location)}
                          disabled={generatingQrId === location.id}
                          className="px-3 py-1.5 text-sm rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                        >
                          {location.qr_code_url && (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v2h2v-2zm0 4h-2v2h2v-2zm-4-4h-2v2h2v-2zm4 4h2v2h-2v-2zm0-4h2v2h-2v-2zm-4 4h-2v2h2v-2z"/>
                            </svg>
                          )}
                          {generatingQrId === location.id ? 'Generating...' : 'QR Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(location)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(location)}
                          disabled={deletingId === location.id}
                          className="px-3 py-1.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 disabled:opacity-50"
                        >
                          {deletingId === location.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {qrModal && (
        <QrCodeModal
          data={qrModal}
          onClose={() => setQrModal(null)}
          getToken={getToken}
        />
      )}
    </div>
  );
}
