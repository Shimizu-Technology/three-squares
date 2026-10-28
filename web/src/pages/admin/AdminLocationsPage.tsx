import { StatusBadge } from '../../components/ui/StatusBadge';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { Disclosure } from '../../components/ui/Disclosure';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { CheckField } from '../../components/ui/CheckField';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Field } from '../../components/ui/Field';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { useStaffAccess } from '../../components/admin/StaffAccess.tsx';
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
        <Field label={day} key={day}>

          <Input
            type="text"
            value={hours[day] || ''}
            onChange={(event) => onChange(day, event.target.value)}
            disabled={disabled}
            placeholder="08:00 - 17:00 or Closed"
          />
        </Field>
      ))}
    </div>
  );
}

function SavedHours({ hours }: { hours: Record<string, string> }) {
  const groups = new Map<string, string[]>();
  for (const day of WEEK_DAYS) {
    const value = hours?.[day]?.trim() || 'Closed';
    groups.set(value, [...(groups.get(value) || []), day.slice(0, 3)]);
  }
  return <div className="text-sm text-gray-700 space-y-1">
    <p className="font-medium">Saved pickup hours · Guam time</p>
    {[...groups].map(([value, days]) => <p key={value} className="break-words">{days.join(', ')}: {value}</p>)}
  </div>;
}

function locationError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as { errors?: string[]; error?: string; message?: string } | undefined;
  return Array.isArray(data?.errors) ? data.errors.join('. ') : data?.error || data?.message || fallback;
}

export default function AdminLocationsPage() {
  const access = useStaffAccess();
  const canManageLocations = access.can('locations.manage');
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
      await authPut(`/admin/locations/${locationId}`, { location: canManageLocations ? locationPayload(nextForm) : { hours_json: normalizeHours(nextForm.hours_json), active: nextForm.active } }, getToken);
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
      <AdminPageHeader title="Locations" subtitle={<>
          View saved pickup details and share a location menu. Expand Edit for settings.
        <br />{access.roleLabel} · {access.scopeLabel}</>} actions={<><IconButton aria-label="Refresh locations" type="button" onClick={() => void fetchLocations()} disabled={loading}><RefreshCw /></IconButton></>} />

      {!canManageLocations && <p className="text-sm text-gray-700">You can update hours, active state and menu links here. An owner manages location details and notification settings.</p>}

      <div className="space-y-4">
        <AdminRequestState resource="Locations" loading={loading} error={loadError} hasData={hasLoaded} onRetry={() => void fetchLocations()} />
        {!hasLoaded || (locations.length === 0 && (loading || loadError)) ? null : locations.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-sm text-gray-500">No locations found.</div>
        ) : (
          locations.map((location) => {
            const editForm = editForms[location.id];
            if (!editForm) return null;

            return (
              <div key={location.id} role="region" aria-label={`${location.name} location`} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-gray-900 break-words [overflow-wrap:anywhere]">{location.name}</h2>
                    <p className="text-sm text-gray-500 break-all">{location.slug}</p>
                  </div>
                  <StatusBadge tone={location.active ? 'success' : 'inactive'}>
                    Saved: {location.active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </div>
                <LocationQrCode key={`${location.id}-${location.slug}`} id={location.id} name={location.name} slug={location.slug} />
                <SavedHours hours={location.hours_json} />
                <div className="border-t border-gray-100 pt-3"><Disclosure  title={<>Edit location settings</>} summaryLabel={`Edit location settings for ${location.name}`}>

                  <div className="space-y-5 pt-4">
                    <p className="text-sm text-gray-600">Changes below are drafts until saved. Menu links use saved details.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Location name">

                        <Input
                          type="text"
                          disabled={savingId === location.id || !canManageLocations} value={editForm.name}
                          onChange={(event) => updateEditForm(location.id, { name: event.target.value })}
                        />
                      </Field>
                      <Field label="Slug">

                        <Input
                          type="text"
                          disabled={savingId === location.id || !canManageLocations} value={editForm.slug}
                          onChange={(event) => updateEditForm(location.id, { slug: event.target.value })}
                        />
                      </Field>
                      <Field label="Address">

                        <Input
                          type="text"
                          disabled={savingId === location.id || !canManageLocations} value={editForm.address}
                          onChange={(event) => updateEditForm(location.id, { address: event.target.value })}
                        />
                      </Field>
                      <Field label="Phone">

                        <Input
                          type="text"
                          disabled={savingId === location.id || !canManageLocations} value={editForm.phone}
                          onChange={(event) => updateEditForm(location.id, { phone: event.target.value })}
                        />
                      </Field>
                      <Field label="Location admin email">

                        <Input
                          type="email"
                          disabled={savingId === location.id || !canManageLocations} value={editForm.admin_email}
                          onChange={(event) => updateEditForm(location.id, { admin_email: event.target.value })}
                          placeholder="Location admin email"
                        />
                      </Field>
                      <CheckField type="checkbox" disabled={savingId === location.id} checked={editForm.active} onChange={(event) => updateEditForm(location.id, { active: event.target.checked })}>

                        Active
                      </CheckField>
                      <div className="md:col-span-2">
                        <Field label="Admin SMS phones (one per line)">

                          <Textarea
                            disabled={savingId === location.id || !canManageLocations} value={editForm.admin_sms_phones_input}
                            onChange={(event) => updateEditForm(location.id, { admin_sms_phones_input: event.target.value })}
                            placeholder="Admin SMS phones, one per line"
                            rows={3}
                          />
                        </Field>
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
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="primary"
                        type="button"
                        loading={savingId === location.id} onClick={() => void handleSave(location.id)}
                        disabled={savingId !== null || deletingId !== null}
                      >
                        Save
                      </Button>
                      {canManageLocations && <Button variant="destructive"
                        type="button"
                        onClick={() => void handleDelete(location)}
                        disabled={savingId !== null || deletingId !== null}
                      >
                        {deletingId === location.id ? 'Deleting...' : 'Delete'}
                      </Button>}
                    </div>
                  </div>
                </Disclosure></div>
              </div>
            );
          })
        )}
      </div>
      {canManageLocations && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><Disclosure  title={<>Add Location</>}>

        <form onSubmit={handleCreate} className="space-y-5 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Location name">

              <Input
                type="text"
                placeholder="Location name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Field>
            <Field label="Slug">

              <Input
                type="text"
                placeholder="slug (e.g. tamuning-main)"
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
              />
            </Field>
            <Field label="Address">

              <Input
                type="text"
                placeholder="Address"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </Field>
            <Field label="Phone">

              <Input
                type="text"
                placeholder="Phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </Field>
            <Field label="Location admin email">

              <Input
                type="email"
                placeholder="Location admin email"
                value={form.admin_email}
                onChange={(event) => setForm((prev) => ({ ...prev, admin_email: event.target.value }))}
              />
            </Field>
            <CheckField type="checkbox" checked={form.active} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}>

              Active
            </CheckField>
            <div className="md:col-span-2">
              <Field label="Admin SMS phones (one per line)">

                <Textarea
                  value={form.admin_sms_phones_input}
                  onChange={(event) => setForm((prev) => ({ ...prev, admin_sms_phones_input: event.target.value }))}
                  placeholder="Admin SMS phones, one per line"
                  rows={3}
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Pickup hours (Guam time)</p>
            <HoursFields hours={form.hours_json} onChange={updateCreateHours} />
          </div>

          <Button variant="primary"
            type="submit"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Location'}
          </Button>
        </form>
      </Disclosure></div>}

    </div>
  );
}
