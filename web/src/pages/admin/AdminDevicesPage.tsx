import { IconButton } from '../../components/ui/IconButton';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { CheckField } from '../../components/ui/CheckField';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Bell, BellOff, MonitorSmartphone, RefreshCcw, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { authGet, authPatch, authPut } from '../../services/authApi';
import { StaffAccessDenied, useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import { canAssignDeviceLocation, deviceLocations, deviceReadPaths } from '../../components/admin/staffAccess.ts';
import { enableAdminPushNotifications, disableAdminPushNotifications, type AdminDeviceRecord, type AdminPushConfig, type CurrentAdminDeviceResponse } from '../../services/adminDevice';
import { detectBrowserMetadata } from '../../services/adminDeviceIdentity';

interface DevicesResponse {
  devices: AdminDeviceRecord[];
  push: AdminPushConfig;
}

const formatLastSeen = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never';

type EditableDevice = AdminDeviceRecord & {
  location_id?: number | null;
  active: boolean;
  name: string;
};

export default function AdminDevicesPage() {
  const { getToken } = useAuth();
  const access = useStaffAccess();
  const canManage = access.can('devices.manage');
  const canUseCurrent = access.can('devices.self') || canManage;
  const locations = useMemo(() => deviceLocations(access.user), [access.user]);
  const currentDraftDirty = useRef(false);
  const dirtyDeviceIds = useRef(new Set<number | null>());
  const fetchRequest = useRef(0);
  const [currentError, setCurrentError] = useState('');
  const [pushError, setPushError] = useState('');
  const [managedError, setManagedError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingDeviceId, setSavingDeviceId] = useState<number | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [devices, setDevices] = useState<EditableDevice[]>([]);
  const [currentDevice, setCurrentDevice] = useState<EditableDevice | null>(null);
  const [pushConfig, setPushConfig] = useState<AdminPushConfig>({ configured: false });
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    location_id: '',
  });

  const fetchData = useCallback(async () => {
    const attempt = ++fetchRequest.current;
    // No device index or privileged location reads for a self-only account.
    const paths = deviceReadPaths(access.user);
    if (!paths.length) { setLoading(false); return; }
    try {
      setLoading(true);
      setLoadFailed(false);
      const [devicesRes, currentRes] = await Promise.all([
        paths.includes('/admin/devices') ? authGet<DevicesResponse>('/admin/devices', getToken, { timeout: 20000 }) : Promise.resolve(null),
        authGet<CurrentAdminDeviceResponse>('/admin/devices/current', getToken, { timeout: 20000 }),
      ]);
      if (attempt !== fetchRequest.current) return;
      const allDevices = (devicesRes?.data.devices || []).filter(device => canAssignDeviceLocation(access.user, device.location_id ?? null));
      const current = currentRes.data.device;
      setDevices(previous => allDevices.map(device => dirtyDeviceIds.current.has(device.id) ? previous.find(entry => entry.id === device.id) || device : device));
      setCurrentDevice(current);
      setPushConfig(currentRes.data.push);
      if (!currentDraftDirty.current) setDeviceForm({
        name: current.name || '',
        location_id: String(access.user?.operational_scope === 'specific' ? access.user.assigned_location_id ?? '' : current.location_id ?? ''),
      });
    } catch {
      if (attempt !== fetchRequest.current) return;
      setLoadFailed(true);
    } finally {
      if (attempt === fetchRequest.current) setLoading(false);
    }
  }, [getToken, access.user]);

  useEffect(() => {
    void fetchData();
    return () => { fetchRequest.current += 1; };
  }, [fetchData]);

  const currentPermission =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => a.name.localeCompare(b.name)), [locations]);

  const selectedLocation = deviceForm.location_id ? Number(deviceForm.location_id) : null;
  const validCurrentLocation = canAssignDeviceLocation(access.user, selectedLocation);
  const locationLocked = access.user?.role === 'staff' || currentDevice?.location_locked === true;

  const saveCurrentDevice = async () => {
    if (!canUseCurrent || !validCurrentLocation || !deviceForm.name.trim() || loading || savingCurrent || savingDeviceId !== null || pushBusy) return;
    try {
      setCurrentError('');
      setSavingCurrent(true);
      const metadata = detectBrowserMetadata();
      const response = await authPut<CurrentAdminDeviceResponse>(
        '/admin/devices/current',
        {
          device: {
            name: deviceForm.name.trim(),
            location_id: selectedLocation,
            platform: metadata.platform,
            browser: metadata.browser,
            user_agent: metadata.userAgent,
          },
        },
        getToken
      );

      currentDraftDirty.current = false;
      setCurrentDevice(response.data.device);
      setDeviceForm({ name: response.data.device.name, location_id: String(response.data.device.location_id ?? '') });
      setPushConfig(response.data.push);
      if (canManage) setDevices((previous) => {
        if (dirtyDeviceIds.current.has(response.data.device.id)) return previous;
        const next = previous.filter((device) => device.device_uuid !== response.data.device.device_uuid);
        return [response.data.device, ...next];
      });
      toast.success('Current device saved');
    } catch {
      setCurrentError('Couldn’t save this device. Your changes are still here. Try saving again.');
      toast.error('Failed to save this device');
    } finally {
      setSavingCurrent(false);
    }
  };

  const togglePush = async () => {
    if (!canUseCurrent || loading || savingCurrent || savingDeviceId !== null || pushBusy) return;
    if (!currentDevice?.push_enabled && (!currentDevice?.id || !canAssignDeviceLocation(access.user, currentDevice.location_id ?? null))) return;
    try {
      setPushError('');
      setPushBusy(true);

      if (currentDevice?.push_enabled) {
        await disableAdminPushNotifications(getToken);
        toast.success('Push notifications disabled');
      } else {
        await enableAdminPushNotifications(getToken);
        toast.success('Push notifications enabled');
      }

      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update push notifications';
      setPushError(message);
      toast.error(message);
    } finally {
      setPushBusy(false);
    }
  };

  const updateManagedDevice = async (device: EditableDevice) => {
    if (!canManage || !device.id || !canAssignDeviceLocation(access.user, device.location_id ?? null) || !device.name.trim() || loading || savingCurrent || pushBusy || savingDeviceId !== null) return;
    try {
      setManagedError('');
      setSavingDeviceId(device.id);
      const response = await authPatch<{ device: AdminDeviceRecord }>(
        `/admin/devices/${device.id}`,
        {
          device: {
            name: device.name.trim(),
            location_id: device.location_id ?? null,
            active: device.active,
          },
        },
        getToken
      );

      dirtyDeviceIds.current.delete(device.id);
      setDevices((previous) =>
        previous.map((entry) => (entry.id === response.data.device.id ? response.data.device : entry))
      );

      if (currentDevice?.id === response.data.device.id) {
        setCurrentDevice(response.data.device);
        if (!currentDraftDirty.current) setDeviceForm({ name: response.data.device.name, location_id: String(response.data.device.location_id ?? '') });
      }

      toast.success('Device updated');
    } catch {
      setManagedError('Couldn’t update the device. Your changes are still here. Try saving again.');
      toast.error('Failed to update device');
    } finally {
      setSavingDeviceId(null);
    }
  };

  if (!canUseCurrent) return <StaffAccessDenied />;

  if (loading && !currentDevice) {
    return (
      <div className="space-y-4">
        <div className="h-28 rounded-2xl bg-gray-100 motion-safe:animate-pulse" />
        <div className="h-64 rounded-2xl bg-gray-100 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (loadFailed && !currentDevice) {
    return <div role="alert" className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-xl font-semibold">Device settings unavailable</h1>
      <p>We couldn’t load your devices. Please try again.</p>
      <Button variant="secondary" type="button" onClick={() => void fetchData()}>Try again</Button>
    </div>;
  }

  return (
    <div className="space-y-6">
      {loadFailed && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Couldn’t refresh device settings. Your changes are still here. <Button variant="secondary" type="button" onClick={() => void fetchData()}>Try again</Button></div>}
      {loading && <p role="status" className="text-sm text-gray-600">Refreshing device settings…</p>}
      <AdminPageHeader title="Devices & Push" subtitle={<>
              Register each admin browser or iPad as its own device, assign it to a location, and receive order alerts
              for that location.
            </>} actions={<><IconButton aria-label="Refresh devices" type="button" onClick={() => void fetchData()} disabled={loading || savingCurrent || savingDeviceId !== null || pushBusy}><RefreshCcw /></IconButton></>} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <MonitorSmartphone className="h-5 w-5 text-tsPrimary" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Current Device</h2>
              <p className="text-sm text-gray-500">This browser identity is stored locally on the device.</p>
            </div>
          </div>

          {currentError && <p role="alert" className="mt-4 text-sm text-red-700">{currentError}</p>}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Device Name">
              <Input
                type="text"
                value={deviceForm.name}
                maxLength={120}
                disabled={loading || savingCurrent}
                onChange={(event) => { currentDraftDirty.current = true; setDeviceForm((prev) => ({ ...prev, name: event.target.value })); }}
                placeholder="Kitchen iPad"
              />
            </Field>

            <Field label="Order alert location" help={locationLocked ? 'Location is assigned by your account. Ask a manager to change it.' : undefined}>
              <Select
                disabled={locationLocked || loading || savingCurrent}
                value={deviceForm.location_id}
                onChange={(event) => { currentDraftDirty.current = true; setDeviceForm((prev) => ({ ...prev, location_id: event.target.value })); }}
              >
                {access.user?.operational_scope === 'all' && <option value="">Unassigned — no order alerts</option>}
                {sortedLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 break-all text-sm text-gray-500">
            <span>UUID: {currentDevice?.device_uuid || 'Unregistered'}</span>
            <span>Last seen: {formatLastSeen(currentDevice?.last_seen_at)}</span>
            <span>{currentDevice?.browser || 'Browser'} / {currentDevice?.platform || 'Unknown platform'}</span>
          </div>

          <div className="mt-6">
            <Button
              type="button"
              onClick={() => void saveCurrentDevice()}
              disabled={loading || savingCurrent || savingDeviceId !== null || pushBusy || !validCurrentLocation || deviceForm.name.trim() === ''}
              loading={savingCurrent} icon={<Save />}
            >
              Save Device
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            {currentDevice?.push_enabled ? (
              <Bell className="h-5 w-5 text-emerald-600" />
            ) : (
              <BellOff className="h-5 w-5 text-gray-500" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Push Notifications</h2>
              <p className="text-sm text-gray-500">
                Browser permission: <span className="font-medium capitalize">{currentPermission}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            {pushConfig.configured ? (
              <p>
                When enabled, this device will receive new-order alerts for its assigned location. Unassigned devices receive no order alerts.
              </p>
            ) : (
              <p>
                Push notifications are unavailable. Ask your system administrator to enable this feature.
              </p>
            )}
          </div>

          {pushError && <p role="alert" className="mt-4 text-sm text-red-700">{pushError}</p>}
          {currentPermission === 'denied' && <p className="mt-4 text-sm text-gray-600">Notifications are blocked. Allow notifications for this site in your browser settings, then try again.</p>}
          <p className="mt-4 text-sm text-gray-600">On iPhone or iPad, add this site to the Home Screen and open it there to enable push.</p>
          {!currentDevice?.id ? <p className="mt-4 text-sm text-gray-600">Save this device with a location before enabling push.</p>
            : !currentDevice.location_id ? <p className="mt-4 text-sm text-gray-600">Assign a location and save this device to receive order alerts.</p>
            : null}
          <div className="mt-6">
            <Button variant="destructive"
              type="button"
              onClick={() => void togglePush()}
              disabled={loading || pushBusy || savingCurrent || savingDeviceId !== null || (!currentDevice?.push_enabled && (!pushConfig.configured || !currentDevice?.id || !currentDevice.location_id || !canAssignDeviceLocation(access.user, currentDevice.location_id) || !currentDevice.active || currentPermission === 'unsupported'))}
            >
              {currentDevice?.push_enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {pushBusy ? 'Updating...' : currentDevice?.push_enabled ? 'Disable Push' : 'Enable Push'}
            </Button>
          </div>
        </section>
      </div>

      {canManage && <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Registered Devices</h2>
          <p className="text-sm text-gray-500">Update device names, locations, and availability. Location assignments limit which order alerts a device receives.</p>
        </div>

        {managedError && <p role="alert" className="mb-4 text-sm text-red-700">{managedError}</p>}
        {devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            No admin devices have been registered yet.
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <div key={device.device_uuid} className="rounded-xl border border-gray-200 p-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] xl:items-center">
                  <Field label={`Device name for ${device.device_uuid}`}><Input
                    aria-label={`Device name for ${device.device_uuid}`}
                    maxLength={120}
                    type="text"
                    value={device.name}
                    disabled={loading || savingCurrent || savingDeviceId === device.id}
                    onChange={(event) => {
                      dirtyDeviceIds.current.add(device.id);
                      setDevices((previous) =>
                        previous.map((entry) => (entry.device_uuid === device.device_uuid ? { ...entry, name: event.target.value } : entry))
                      );
                    }}
                  /></Field>

                  <Field label={`Order alert location for ${device.name}`}><Select
                    aria-label={`Order alert location for ${device.name}`}
                    disabled={device.location_locked || loading || savingCurrent || savingDeviceId === device.id}
                    value={device.location_id ?? ''}
                    onChange={(event) => {
                      dirtyDeviceIds.current.add(device.id);
                      setDevices((previous) =>
                        previous.map((entry) =>
                          entry.device_uuid === device.device_uuid
                            ? { ...entry, location_id: event.target.value ? Number(event.target.value) : null }
                            : entry
                        )
                      );
                    }}
                  >
                    {access.user?.operational_scope === 'all' && <option value="">Unassigned — no order alerts</option>}
                    {sortedLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </Select></Field>

                  <CheckField type="checkbox" checked={device.active} disabled={loading || savingCurrent || savingDeviceId === device.id} onChange={(event) => {
                        dirtyDeviceIds.current.add(device.id);
                        setDevices((previous) =>
                          previous.map((entry) =>
                            entry.device_uuid === device.device_uuid ? { ...entry, active: event.target.checked } : entry
                          )
                        );
                      }}>

                    Active
                  </CheckField>

                  <Button icon={<Save />} variant="secondary"
                    type="button"
                    disabled={loading || pushBusy || savingDeviceId !== null || savingCurrent || !device.name.trim() || !canAssignDeviceLocation(access.user, device.location_id ?? null)}
                    loading={savingDeviceId === device.id} onClick={() => void updateManagedDevice(device)}
                  >

                    Save
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 break-all text-xs text-gray-500">
                  <span>Owner: {device.user_email || 'Unassigned'}</span>
                  <span>Last seen: {formatLastSeen(device.last_seen_at)}</span>
                  <span>Push: {device.push_enabled ? `${device.active_subscription_count} active subscription(s)` : 'Disabled'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>}
    </div>
  );
}
