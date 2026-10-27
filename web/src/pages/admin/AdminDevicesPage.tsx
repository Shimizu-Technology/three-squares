import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Bell, BellOff, MonitorSmartphone, RefreshCcw, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { authGet, authPatch, authPut } from '../../services/authApi';
import type { Location } from '../../services/api';
import { enableAdminPushNotifications, disableAdminPushNotifications, type AdminDeviceRecord, type AdminPushConfig, type CurrentAdminDeviceResponse } from '../../services/adminDevice';
import { detectBrowserMetadata } from '../../services/adminDeviceIdentity';

interface DevicesResponse {
  devices: AdminDeviceRecord[];
  push: AdminPushConfig;
}

interface LocationsResponse {
  data: Location[];
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
  const [loading, setLoading] = useState(true);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [devices, setDevices] = useState<EditableDevice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentDevice, setCurrentDevice] = useState<EditableDevice | null>(null);
  const [pushConfig, setPushConfig] = useState<AdminPushConfig>({ configured: false });
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    location_id: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [devicesRes, currentRes, locationsRes] = await Promise.all([
        authGet<DevicesResponse>('/admin/devices', getToken),
        authGet<CurrentAdminDeviceResponse>('/admin/devices/current', getToken),
        authGet<LocationsResponse>('/admin/locations', getToken),
      ]);

      const allDevices = devicesRes.data.devices || [];
      const current = currentRes.data.device;

      setDevices(allDevices);
      setCurrentDevice(current);
      setPushConfig(currentRes.data.push);
      setLocations(locationsRes.data.data || []);
      setDeviceForm({
        name: current.name || '',
        location_id: current.location_id ? String(current.location_id) : '',
      });
    } catch (error) {
      console.error('Failed to load admin devices:', error);
      toast.error('Failed to load device settings');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const currentPermission =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => a.name.localeCompare(b.name)), [locations]);

  const saveCurrentDevice = async () => {
    try {
      setSavingCurrent(true);
      const metadata = detectBrowserMetadata();
      const response = await authPut<CurrentAdminDeviceResponse>(
        '/admin/devices/current',
        {
          device: {
            name: deviceForm.name.trim(),
            location_id: deviceForm.location_id ? Number(deviceForm.location_id) : null,
            platform: metadata.platform,
            browser: metadata.browser,
            user_agent: metadata.userAgent,
          },
        },
        getToken
      );

      setCurrentDevice(response.data.device);
      setPushConfig(response.data.push);
      setDevices((previous) => {
        const next = previous.filter((device) => device.device_uuid !== response.data.device.device_uuid);
        return [response.data.device, ...next];
      });
      toast.success('Current device saved');
    } catch (error) {
      console.error('Failed to save current device:', error);
      toast.error('Failed to save this device');
    } finally {
      setSavingCurrent(false);
    }
  };

  const togglePush = async () => {
    try {
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
      console.error('Failed to update push notifications:', error);
      const message = error instanceof Error ? error.message : 'Failed to update push notifications';
      toast.error(message);
    } finally {
      setPushBusy(false);
    }
  };

  const updateManagedDevice = async (device: EditableDevice) => {
    try {
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

      setDevices((previous) =>
        previous.map((entry) => (entry.id === response.data.device.id ? response.data.device : entry))
      );

      if (currentDevice?.id === response.data.device.id) {
        setCurrentDevice(response.data.device);
      }

      toast.success('Device updated');
    } catch (error) {
      console.error('Failed to update device:', error);
      toast.error('Failed to update device');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Devices & Push</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Register each admin browser or iPad as its own device, assign it to a location, and limit push alerts
              to that location by default.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <MonitorSmartphone className="h-5 w-5 text-tsPrimary" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Current Device</h2>
              <p className="text-sm text-gray-500">This browser identity is stored locally on the device.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Device Name</span>
              <input
                type="text"
                value={deviceForm.name}
                onChange={(event) => setDeviceForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tsPrimary focus:outline-none focus:ring-2 focus:ring-tsPrimary/20"
                placeholder="Kitchen iPad"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Default Location</span>
              <select
                value={deviceForm.location_id}
                onChange={(event) => setDeviceForm((prev) => ({ ...prev, location_id: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tsPrimary focus:outline-none focus:ring-2 focus:ring-tsPrimary/20"
              >
                <option value="">All locations</option>
                {sortedLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>UUID: {currentDevice?.device_uuid || 'Unregistered'}</span>
            <span>Last seen: {formatLastSeen(currentDevice?.last_seen_at)}</span>
            <span>{currentDevice?.browser || 'Browser'} / {currentDevice?.platform || 'Unknown platform'}</span>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => void saveCurrentDevice()}
              disabled={savingCurrent || deviceForm.name.trim() === ''}
              className="inline-flex items-center gap-2 rounded-lg bg-tsPrimary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingCurrent ? 'Saving...' : 'Save Device'}
            </button>
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
                When enabled, this device will receive new-order alerts for its assigned location. Unassigned devices
                continue acting as global listeners.
              </p>
            ) : (
              <p>
                Web push keys are not configured on the server yet. Set `WEB_PUSH_VAPID_PUBLIC_KEY`,
                `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` to activate live push delivery.
              </p>
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => void togglePush()}
              disabled={pushBusy || !pushConfig.configured || !currentDevice}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                currentDevice?.push_enabled ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {currentDevice?.push_enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {pushBusy ? 'Updating...' : currentDevice?.push_enabled ? 'Disable Push' : 'Enable Push'}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Registered Devices</h2>
          <p className="text-sm text-gray-500">Global admins can update assignments here without touching the device.</p>
        </div>

        {devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            No admin devices have been registered yet.
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <div key={device.device_uuid} className="rounded-xl border border-gray-200 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_180px_auto] lg:items-center">
                  <input
                    type="text"
                    value={device.name}
                    onChange={(event) =>
                      setDevices((previous) =>
                        previous.map((entry) => (entry.device_uuid === device.device_uuid ? { ...entry, name: event.target.value } : entry))
                      )
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tsPrimary focus:outline-none focus:ring-2 focus:ring-tsPrimary/20"
                  />

                  <select
                    value={device.location_id ?? ''}
                    onChange={(event) =>
                      setDevices((previous) =>
                        previous.map((entry) =>
                          entry.device_uuid === device.device_uuid
                            ? { ...entry, location_id: event.target.value ? Number(event.target.value) : null }
                            : entry
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-tsPrimary focus:outline-none focus:ring-2 focus:ring-tsPrimary/20"
                  >
                    <option value="">All locations</option>
                    {sortedLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>

                  <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={device.active}
                      onChange={(event) =>
                        setDevices((previous) =>
                          previous.map((entry) =>
                            entry.device_uuid === device.device_uuid ? { ...entry, active: event.target.checked } : entry
                          )
                        )
                      }
                    />
                    Active
                  </label>

                  <button
                    type="button"
                    onClick={() => void updateManagedDevice(device)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>Owner: {device.user_email || 'Unassigned'}</span>
                  <span>Last seen: {formatLastSeen(device.last_seen_at)}</span>
                  <span>Push: {device.push_enabled ? `${device.active_subscription_count} active subscription(s)` : 'Disabled'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
