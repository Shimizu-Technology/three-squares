import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { authDelete, authGet, authPost, authPut } from '../../services/authApi';

interface Location {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  active: boolean;
  hours_json: Record<string, string>;
}

interface LocationsResponse {
  data: Location[];
}

const emptyForm = {
  name: '',
  slug: '',
  address: '',
  phone: '',
  active: true,
};

export default function AdminLocationsPage() {
  const { getToken } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }

    try {
      setCreating(true);
      await authPost('/admin/locations', { location: form }, getToken);
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
      await authPut(`/admin/locations/${location.id}`, {
        location: { active: !location.active },
      }, getToken);
      toast.success(`Location ${location.active ? 'deactivated' : 'activated'}`);
      await fetchLocations();
    } catch (error) {
      console.error('Failed to update location:', error);
      toast.error('Failed to update location');
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
        <p className="text-sm text-gray-500 mt-1">Manage pickup locations for product availability and checkout.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Location</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Location name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="slug (e.g. three-squares-main)"
            value={form.slug}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2"
          />
          <input
            type="text"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
              className="w-4 h-4"
            />
            Active
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Location'}
            </button>
          </div>
        </form>
      </div>

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
            {locations.map((location) => (
              <div key={location.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{location.name}</p>
                  <p className="text-sm text-gray-500">{location.slug}</p>
                  {location.address && <p className="text-sm text-gray-500">{location.address}</p>}
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
                    {savingId === location.id ? 'Saving...' : (location.active ? 'Active' : 'Inactive')}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

