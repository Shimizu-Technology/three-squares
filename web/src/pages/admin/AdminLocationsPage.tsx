import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import AdminRequestState from '../../components/admin/AdminRequestState';
import LocationQrCode from '../../components/admin/LocationQrCode';
import { authDelete, authGet, authPost, authPut } from '../../services/authApi';

const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

interface Location {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  active: boolean;
  hours_json: Record<string, string>;
  admin_email?: string | null;
  admin_sms_phones: string[];
}

interface LocationsResponse {
  data: Location[];
}

interface LocationFormState {
  name: string;
  slug: string;
  address: string;
  phone: string;
  active: boolean;
  admin_email: string;
  admin_sms_phones_input: string;
  hours_json: Record<string, string>;
}

const emptyHours = () =>
  WEEK_DAYS.reduce<Record<string, string>>((acc, day) => {
    acc[day] = '';
    return acc;
  }, {});

const createEmptyForm = (): LocationFormState => ({
  name: '',
  slug: '',
  address: '',
  phone: '',
  active: true,
  admin_email: '',
  admin_sms_phones_input: '',
  hours_json: emptyHours(),
});

const formFromLocation = (location: Location): LocationFormState => ({
  name: location.name || '',
  slug: location.slug || '',
  address: location.address || '',
  phone: location.phone || '',
  active: location.active,
  admin_email: location.admin_email || '',
  admin_sms_phones_input: (location.admin_sms_phones || []).join('\n'),
  hours_json: {
    ...emptyHours(),
    ...(location.hours_json || {}),
  },
});

const normalizeHours = (hours: Record<string, string>) =>
  Object.fromEntries(WEEK_DAYS.map((day) => [day, hours[day]?.trim() || 'Closed']));

const normalizePhones = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((phone) => phone.trim())
    .filter((phone) => phone.length > 0);

const locationPayload = (form: LocationFormState) => ({
  name: form.name.trim(),
  slug: form.slug.trim(),
  address: form.address.trim(),
  phone: form.phone.trim(),
  active: form.active,
  admin_email: form.admin_email.trim(),
  admin_sms_phones: normalizePhones(form.admin_sms_phones_input),
  hours_json: normalizeHours(form.hours_json),
});

function HoursFields({
  hours,
  disabled = false,
  onChange,
}: {
  hours: Record<string, string>;
  disabled?: boolean;
  onChange: (day: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {WEEK_DAYS.map((day) => (
        <label key={day} className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{day}</span>
          <input
            type="text"
            value={hours[day] || ''}
            onChange={(event) => onChange(day, event.target.value)}
            disabled={disabled}
            placeholder="08:00 - 17:00 or Closed"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </label>
      ))}
    </div>
  );
}

function locationError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as { errors?: string[]; error?: string; message?: string } | undefined;
  return Array.isArray(data?.errors) ? data.errors.join('. ') : data?.error || data?.message || fallback;
}

export default function AdminLocationsPage() {
  const { getToken } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);
  const active = useRef(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<LocationFormState>(createEmptyForm());
  const [editForms, setEditForms] = useState<Record<number, LocationFormState>>({});
  const [creating, setCreating] = useState(false);

  const updateCreateHours = (day: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      hours_json: {
        ...prev.hours_json,
        [day]: value,
      },
    }));
  };

  const updateEditHours = (locationId: number, day: string, value: string) => {
    setEditForms((prev) => ({
      ...prev,
      [locationId]: {
        ...prev[locationId],
        hours_json: {
          ...prev[locationId].hours_json,
          [day]: value,
        },
      },
    }));
  };

  const updateEditForm = (locationId: number, patch: Partial<LocationFormState>) => {
    setEditForms((prev) => ({
      ...prev,
      [locationId]: {
        ...prev[locationId],
        ...patch,
      },
    }));
  };

  const fetchLocations = useCallback(async (resetId?: number) => {
    if (!active.current) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await authGet<LocationsResponse>('/admin/locations', getToken, { timeout: 20000 });
      if (id !== requestId.current) return;
      if (!Array.isArray(response.data.data)) throw new Error('Invalid locations response');
      const nextLocations = response.data.data;
      setHasLoaded(true);
      setLoadError(false);
      setLocations(nextLocations);
      setEditForms((previous) =>
        nextLocations.reduce<Record<number, LocationFormState>>((acc, location) => {
          acc[location.id] = location.id === resetId ? formFromLocation(location)
            : previous[location.id] || formFromLocation(location);
          return acc;
        }, {})
      );
    } catch (error) {
      if (id !== requestId.current) return;
      console.error('Failed to fetch locations:', error);
      setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    active.current = true;
    void fetchLocations();
    return () => { active.current = false; requestId.current += 1; };
  }, [fetchLocations]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }

    try {
      setCreating(true);
      await authPost('/admin/locations', { location: locationPayload(form) }, getToken);
      toast.success('Location created');
      setForm(createEmptyForm());
      await fetchLocations();
    } catch (error: unknown) {
      console.error('Failed to create location:', error);
      toast.error(locationError(error, 'Failed to create location'));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (locationId: number) => {
    const nextForm = editForms[locationId];
    if (!nextForm || !nextForm.name.trim() || !nextForm.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }

    try {
      setSavingId(locationId);
      await authPut(`/admin/locations/${locationId}`, { location: locationPayload(nextForm) }, getToken);
      toast.success('Location updated');
      await fetchLocations(locationId);
    } catch (error) {
      console.error('Failed to update location:', error);
      toast.error(locationError(error, 'Failed to update location'));
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
        <p className="text-sm text-gray-500 mt-1">
          Manage pickup locations, order windows, and location-specific notification routing.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Location</h2>
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Location name</span>
              <input
                type="text"
                placeholder="Location name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Slug</span>
              <input
                type="text"
                placeholder="slug (e.g. tamuning-main)"
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="block text-sm font-medium text-gray-700 mb-1">Address</span>
              <input
                type="text"
                placeholder="Address"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Phone</span>
              <input
                type="text"
                placeholder="Phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Location admin email</span>
              <input
                type="email"
                placeholder="Location admin email"
                value={form.admin_email}
                onChange={(event) => setForm((prev) => ({ ...prev, admin_email: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                className="w-4 h-4"
              />
              Active
            </label>
            <div className="md:col-span-2">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Admin SMS phones (one per line)</span>
                <textarea
                  value={form.admin_sms_phones_input}
                  onChange={(event) => setForm((prev) => ({ ...prev, admin_sms_phones_input: event.target.value }))}
                  placeholder="Admin SMS phones, one per line"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Pickup hours (Guam time)</p>
            <HoursFields hours={form.hours_json} onChange={updateCreateHours} />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Location'}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <AdminRequestState resource="Locations" loading={loading} error={loadError} hasData={hasLoaded} onRetry={() => void fetchLocations()} />
        {!hasLoaded ? null : locations.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-sm text-gray-500">No locations found.</div>
        ) : (
          locations.map((location) => {
            const editForm = editForms[location.id];
            if (!editForm) return null;

            return (
              <div key={location.id} role="region" aria-label={`${location.name} settings`} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{location.name}</p>
                    <p className="text-sm text-gray-500">{location.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1.5 text-sm rounded-lg border ${
                        editForm.active
                          ? 'border-green-300 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-gray-50 text-gray-700'
                      }`}
                    >
                      {editForm.active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSave(location.id)}
                      disabled={savingId !== null || deletingId !== null}
                      className="px-3 py-1.5 text-sm rounded-lg bg-tsPrimary text-white disabled:opacity-50"
                    >
                      {savingId === location.id ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(location)}
                      disabled={savingId !== null || deletingId !== null}
                      className="px-3 py-1.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 disabled:opacity-50"
                    >
                      {deletingId === location.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Location name</span>
                    <input
                      type="text"
                      disabled={savingId === location.id} value={editForm.name}
                      onChange={(event) => updateEditForm(location.id, { name: event.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Slug</span>
                    <input
                      type="text"
                      disabled={savingId === location.id} value={editForm.slug}
                      onChange={(event) => updateEditForm(location.id, { slug: event.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Address</span>
                    <input
                      type="text"
                      disabled={savingId === location.id} value={editForm.address}
                      onChange={(event) => updateEditForm(location.id, { address: event.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Phone</span>
                    <input
                      type="text"
                      disabled={savingId === location.id} value={editForm.phone}
                      onChange={(event) => updateEditForm(location.id, { phone: event.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Location admin email</span>
                    <input
                      type="email"
                      disabled={savingId === location.id} value={editForm.admin_email}
                      onChange={(event) => updateEditForm(location.id, { admin_email: event.target.value })}
                      placeholder="Location admin email"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={editForm.active}
                      onChange={(event) => updateEditForm(location.id, { active: event.target.checked })}
                      className="w-4 h-4"
                    />
                    Active
                  </label>
                  <div className="md:col-span-2">
                    <label className="block">
                      <span className="block text-sm font-medium text-gray-700 mb-1">Admin SMS phones (one per line)</span>
                      <textarea
                        disabled={savingId === location.id} value={editForm.admin_sms_phones_input}
                        onChange={(event) => updateEditForm(location.id, { admin_sms_phones_input: event.target.value })}
                        placeholder="Admin SMS phones, one per line"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Pickup hours (Guam time)</p>
                  <HoursFields
                    hours={editForm.hours_json}
                    onChange={(day, value) => updateEditHours(location.id, day, value)}
                    disabled={savingId === location.id}
                  />
                </div>
                <LocationQrCode key={`${location.id}-${location.slug}`} id={location.id} name={location.name} slug={location.slug} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
