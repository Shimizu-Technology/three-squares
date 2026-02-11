import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { Save, Plus, Trash2, Edit2, X } from 'lucide-react';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { authDelete, authGet, authPost, authPut } from '../../services/authApi';

interface AcaiSettings {
  id: number;
  name: string;
  description: string;
  base_price_cents: number;
  formatted_price: string;
  image_url: string | null;
  pickup_location: string;
  pickup_instructions: string | null;
  pickup_phone: string;
  advance_hours: number;
  max_per_slot: number;
  active: boolean;
  placard_enabled: boolean;
  placard_price_cents: number;
  toppings_info: string | null;
}

interface CrustOption {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  available: boolean;
  position: number;
}

interface PlacardOption {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  available: boolean;
  position: number;
}

interface PickupWindow {
  id: number;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  active: boolean;
  display_name: string;
}

interface BlockedSlot {
  id: number;
  blocked_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  display_name: string;
}

interface AcaiSettingsResponse {
  data: AcaiSettings;
}

interface CrustOptionsResponse {
  data: CrustOption[];
}

interface PlacardOptionsResponse {
  data: PlacardOption[];
}

interface PickupWindowsResponse {
  data: PickupWindow[];
}

interface BlockedSlotsResponse {
  data: BlockedSlot[];
}

type TabType = 'settings' | 'crust' | 'placards' | 'windows' | 'blocked';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Generate 30-minute time slots from 6:00 AM to 11:30 PM
const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6; // Start at 6 AM
  const minute = (i % 2) * 30;
  const value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const label = `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
  return { value, label };
});

export default function AdminAcaiPage() {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('settings');
  const [loading, setLoading] = useState(true);

  // Settings state
  const [settings, setSettings] = useState<AcaiSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Crust options state
  const [crustOptions, setCrustOptions] = useState<CrustOption[]>([]);
  const [editingCrust, setEditingCrust] = useState<CrustOption | null>(null);
  const [showCrustModal, setShowCrustModal] = useState(false);

  // Placard options state
  const [placardOptions, setPlacardOptions] = useState<PlacardOption[]>([]);
  const [editingPlacard, setEditingPlacard] = useState<PlacardOption | null>(null);
  const [showPlacardModal, setShowPlacardModal] = useState(false);

  // Pickup windows state
  const [pickupWindows, setPickupWindows] = useState<PickupWindow[]>([]);
  const [editingWindow, setEditingWindow] = useState<PickupWindow | null>(null);
  const [showWindowModal, setShowWindowModal] = useState(false);

  // Blocked slots state
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [editingBlocked, setEditingBlocked] = useState<BlockedSlot | null>(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const crustModalContentRef = useRef<HTMLDivElement | null>(null);
  const placardModalContentRef = useRef<HTMLDivElement | null>(null);
  const windowModalContentRef = useRef<HTMLDivElement | null>(null);
  const blockedModalContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [settingsRes, crustRes, placardRes, windowsRes, blockedRes] = await Promise.all([
        authGet<AcaiSettingsResponse>('/admin/acai/settings', getToken),
        authGet<CrustOptionsResponse>('/admin/acai/crust_options', getToken),
        authGet<PlacardOptionsResponse>('/admin/acai/placard_options', getToken),
        authGet<PickupWindowsResponse>('/admin/acai/pickup_windows', getToken),
        authGet<BlockedSlotsResponse>('/admin/acai/blocked_slots', getToken),
      ]);

      setSettings(settingsRes.data.data);
      setCrustOptions(crustRes.data.data || []);
      setPlacardOptions(placardRes.data.data || []);
      setPickupWindows(windowsRes.data.data || []);
      setBlockedSlots(blockedRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch Acai data:', err);
      toast.error('Failed to load Acai settings');
    } finally {
      setLoading(false);
    }
  };

  // Settings handlers
  const handleSettingsChange = (field: keyof AcaiSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setSavingSettings(true);
    try {
      await authPut('/admin/acai/settings', { settings }, getToken);
      toast.success('Settings saved!');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Crust option handlers
  const saveCrustOption = async () => {
    if (!editingCrust) return;
    
    try {
      if (editingCrust.id) {
        await authPut(`/admin/acai/crust_options/${editingCrust.id}`, { crust_option: editingCrust }, getToken);
      } else {
        await authPost('/admin/acai/crust_options', { crust_option: editingCrust }, getToken);
      }
      
      toast.success('Crust option saved!');
      setShowCrustModal(false);
      setEditingCrust(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save crust option:', err);
      toast.error('Failed to save crust option');
    }
  };

  const deleteCrustOption = async (id: number) => {
    if (!confirm('Delete this crust option?')) return;
    
    try {
      await authDelete(`/admin/acai/crust_options/${id}`, getToken);
      toast.success('Crust option deleted');
      fetchData();
    } catch (err) {
      console.error('Failed to delete crust option:', err);
      toast.error('Failed to delete crust option');
    }
  };

  // Placard option handlers
  const savePlacardOption = async () => {
    if (!editingPlacard) return;
    
    try {
      if (editingPlacard.id) {
        await authPut(`/admin/acai/placard_options/${editingPlacard.id}`, { placard_option: editingPlacard }, getToken);
      } else {
        await authPost('/admin/acai/placard_options', { placard_option: editingPlacard }, getToken);
      }
      
      toast.success('Placard option saved!');
      setShowPlacardModal(false);
      setEditingPlacard(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save placard option:', err);
      toast.error('Failed to save placard option');
    }
  };

  const deletePlacardOption = async (id: number) => {
    if (!confirm('Delete this placard option?')) return;
    
    try {
      await authDelete(`/admin/acai/placard_options/${id}`, getToken);
      toast.success('Placard option deleted');
      fetchData();
    } catch (err) {
      console.error('Failed to delete placard option:', err);
      toast.error('Failed to delete placard option');
    }
  };

  // Pickup window handlers
  const savePickupWindow = async () => {
    if (!editingWindow) return;
    
    try {
      if (editingWindow.id) {
        await authPut(`/admin/acai/pickup_windows/${editingWindow.id}`, { pickup_window: editingWindow }, getToken);
      } else {
        await authPost('/admin/acai/pickup_windows', { pickup_window: editingWindow }, getToken);
      }
      
      toast.success('Pickup window saved!');
      setShowWindowModal(false);
      setEditingWindow(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save pickup window:', err);
      toast.error('Failed to save pickup window');
    }
  };

  const deletePickupWindow = async (id: number) => {
    if (!confirm('Delete this pickup window?')) return;
    
    try {
      await authDelete(`/admin/acai/pickup_windows/${id}`, getToken);
      toast.success('Pickup window deleted');
      fetchData();
    } catch (err) {
      console.error('Failed to delete pickup window:', err);
      toast.error('Failed to delete pickup window');
    }
  };

  // Blocked slot handlers
  const saveBlockedSlot = async () => {
    if (!editingBlocked) return;
    
    try {
      if (editingBlocked.id) {
        await authPut(`/admin/acai/blocked_slots/${editingBlocked.id}`, { blocked_slot: editingBlocked }, getToken);
      } else {
        await authPost('/admin/acai/blocked_slots', { blocked_slot: editingBlocked }, getToken);
      }
      
      toast.success('Blocked date saved!');
      setShowBlockedModal(false);
      setEditingBlocked(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save blocked date:', err);
      toast.error('Failed to save blocked date');
    }
  };

  const deleteBlockedSlot = async (id: number) => {
    if (!confirm('Delete this blocked date?')) return;
    
    try {
      await authDelete(`/admin/acai/blocked_slots/${id}`, getToken);
      toast.success('Blocked date deleted');
      fetchData();
    } catch (err) {
      console.error('Failed to delete blocked date:', err);
      toast.error('Failed to delete blocked date');
    }
  };

  useLockBodyScroll(showCrustModal || showPlacardModal || showWindowModal || showBlockedModal);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Acai Cakes Management</h1>

      {/* Tabs */}
      <div className="mb-6">
        <nav className="flex flex-wrap gap-2">
          {[
            { id: 'settings', label: 'Settings' },
            { id: 'crust', label: 'Crust Options' },
            { id: 'placards', label: 'Placard Options' },
            { id: 'windows', label: 'Pickup Windows' },
            { id: 'blocked', label: 'Blocked Dates' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`py-2 px-4 rounded-lg font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-tsPrimary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings Tab */}
      {activeTab === 'settings' && settings && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">General Settings</h2>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.active}
                onChange={(e) => handleSettingsChange('active', e.target.checked)}
                className="w-5 h-5 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
              />
              <span className="ml-2 font-medium text-gray-700">
                {settings.active ? 'Ordering Enabled' : 'Ordering Disabled'}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => handleSettingsChange('name', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={(settings.base_price_cents / 100).toFixed(2)}
                onChange={(e) => handleSettingsChange('base_price_cents', Math.round(parseFloat(e.target.value || '0') * 100))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={settings.description || ''}
                onChange={(e) => handleSettingsChange('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Location</label>
              <input
                type="text"
                value={settings.pickup_location || ''}
                onChange={(e) => handleSettingsChange('pickup_location', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Phone</label>
              <input
                type="tel"
                value={settings.pickup_phone || ''}
                onChange={(e) => handleSettingsChange('pickup_phone', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Advance Notice (hours)</label>
              <input
                type="number"
                value={settings.advance_hours}
                onChange={(e) => handleSettingsChange('advance_hours', parseInt(e.target.value) || 24)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Customers must order this many hours in advance</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Orders Per Slot</label>
              <input
                type="number"
                value={settings.max_per_slot}
                onChange={(e) => handleSettingsChange('max_per_slot', parseInt(e.target.value) || 5)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="placard_enabled"
                checked={settings.placard_enabled}
                onChange={(e) => handleSettingsChange('placard_enabled', e.target.checked)}
                className="w-5 h-5 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
              />
              <label htmlFor="placard_enabled" className="ml-2 text-sm font-medium text-gray-700">
                Enable Message Placards
              </label>
            </div>
          </div>

          <div className="pt-4 border-t">
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="bg-tsPrimary text-white px-6 py-2 rounded-lg hover:bg-primary-dark transition flex items-center disabled:opacity-50"
            >
              <Save className="w-5 h-5 mr-2" />
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Crust Options Tab */}
      {activeTab === 'crust' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Crust/Base Options</h2>
              <p className="text-sm text-gray-500 mt-1">Customize the crust or base options available for açaí cakes</p>
            </div>
            <button
              onClick={() => {
                setEditingCrust({ id: 0, name: '', description: '', price_cents: 0, available: true, position: crustOptions.length });
                setShowCrustModal(true);
              }}
              className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition flex items-center shadow-sm"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Option
            </button>
          </div>

          {crustOptions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No crust options yet</h3>
              <p className="text-gray-500 mb-4">Add crust options for customers to choose from when ordering açaí cakes.</p>
              <button
                onClick={() => {
                  setEditingCrust({ id: 0, name: '', description: '', price_cents: 0, available: true, position: crustOptions.length });
                  setShowCrustModal(true);
                }}
                className="text-tsPrimary hover:text-red-700 font-medium"
              >
                Add your first option →
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {crustOptions.map((crust) => (
                <div 
                  key={crust.id} 
                  className={`bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between transition hover:shadow-md ${
                    crust.available ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      crust.available ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      <span className="font-bold text-lg">{crust.name.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{crust.name}</span>
                        {crust.price_cents > 0 && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            +${(crust.price_cents / 100).toFixed(2)}
                          </span>
                        )}
                        {!crust.available && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            Unavailable
                          </span>
                        )}
                      </div>
                      {crust.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{crust.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingCrust(crust);
                        setShowCrustModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteCrustOption(crust.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Placard Options Tab */}
      {activeTab === 'placards' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Placard Options</h2>
              <p className="text-sm text-gray-500 mt-1">Message placard options for customers to choose from</p>
            </div>
            <button
              onClick={() => {
                setEditingPlacard({ id: 0, name: '', description: '', price_cents: 0, available: true, position: placardOptions.length });
                setShowPlacardModal(true);
              }}
              className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition flex items-center shadow-sm"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Placard
            </button>
          </div>

          {placardOptions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No placard options yet</h3>
              <p className="text-gray-500 mb-4">Add message placard options like "Happy Birthday" or "Congratulations".</p>
              <button
                onClick={() => {
                  setEditingPlacard({ id: 0, name: '', description: '', price_cents: 0, available: true, position: placardOptions.length });
                  setShowPlacardModal(true);
                }}
                className="text-tsPrimary hover:text-red-700 font-medium"
              >
                Add your first placard →
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {placardOptions.map((placard) => (
                <div 
                  key={placard.id} 
                  className={`bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between transition hover:shadow-md ${
                    placard.available ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      placard.available ? 'bg-purple-100 text-purple-600' : 'bg-red-100 text-red-600'
                    }`}>
                      <span className="font-bold text-lg">✉</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{placard.name}</span>
                        {placard.price_cents > 0 && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            +${(placard.price_cents / 100).toFixed(2)}
                          </span>
                        )}
                        {placard.price_cents === 0 && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            Included
                          </span>
                        )}
                        {!placard.available && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            Unavailable
                          </span>
                        )}
                      </div>
                      {placard.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{placard.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingPlacard(placard);
                        setShowPlacardModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deletePlacardOption(placard.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pickup Windows Tab */}
      {activeTab === 'windows' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pickup Windows</h2>
              <p className="text-sm text-gray-500 mt-1">Set available days and times for açaí cake pickups</p>
            </div>
            <button
              onClick={() => {
                setEditingWindow({ id: 0, day_of_week: 6, day_name: 'Saturday', start_time: '13:30', end_time: '15:30', capacity: 5, active: true, display_name: '' });
                setShowWindowModal(true);
              }}
              className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition flex items-center shadow-sm"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Window
            </button>
          </div>

          {pickupWindows.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No pickup windows configured</h3>
              <p className="text-gray-500 mb-4">Add pickup windows to let customers know when they can pick up their orders.</p>
              <button
                onClick={() => {
                  setEditingWindow({ id: 0, day_of_week: 6, day_name: 'Saturday', start_time: '13:30', end_time: '15:30', capacity: 5, active: true, display_name: '' });
                  setShowWindowModal(true);
                }}
                className="text-tsPrimary hover:text-red-700 font-medium"
              >
                Add your first window →
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {pickupWindows.map((window) => (
                <div 
                  key={window.id} 
                  className={`bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between transition hover:shadow-md ${
                    window.active ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${
                      window.active ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                    }`}>
                      <span className="text-xs font-medium uppercase">{DAYS[window.day_of_week]?.slice(0, 3)}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{window.display_name || `${DAYS[window.day_of_week]} ${window.start_time} - ${window.end_time}`}</span>
                        {!window.active && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                          Max {window.capacity} orders
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingWindow(window);
                        setShowWindowModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deletePickupWindow(window.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Blocked Dates Tab */}
      {activeTab === 'blocked' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Blocked Dates</h2>
              <p className="text-sm text-gray-500 mt-1">Block specific dates or times when orders cannot be placed</p>
            </div>
            <button
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setEditingBlocked({ 
                  id: 0, 
                  blocked_date: tomorrow.toISOString().split('T')[0], 
                  start_time: '00:00', 
                  end_time: '23:59', 
                  reason: '', 
                  display_name: '' 
                });
                setShowBlockedModal(true);
              }}
              className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition flex items-center shadow-sm"
            >
              <Plus className="w-5 h-5 mr-2" />
              Block Date
            </button>
          </div>

          {blockedSlots.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No blocked dates</h3>
              <p className="text-gray-500">All configured pickup windows are currently available for orders.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {blockedSlots.map((slot) => {
                const dateObj = new Date(slot.blocked_date + 'T00:00:00');
                const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
                const isFullDay = slot.start_time === '00:00' && slot.end_time === '23:59';
                
                return (
                  <div 
                    key={slot.id} 
                    className={`bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between transition hover:shadow-md ${
                      isPast ? 'border-gray-200 opacity-60' : 'border-orange-200 bg-orange-50/30'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-lg flex flex-col items-center justify-center ${
                        isPast ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-600'
                      }`}>
                        <span className="text-xs font-medium uppercase">
                          {dateObj.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span className="text-xl font-bold leading-none">
                          {dateObj.getDate()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' })}
                          </span>
                          {isFullDay ? (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                              Full Day
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                              {slot.start_time} - {slot.end_time}
                            </span>
                          )}
                          {isPast && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                              Past
                            </span>
                          )}
                        </div>
                        {slot.reason && (
                          <p className="text-sm text-gray-500 mt-0.5">{slot.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingBlocked(slot);
                          setShowBlockedModal(true);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteBlockedSlot(slot.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Crust Option Modal */}
      {showCrustModal && editingCrust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowCrustModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold">{editingCrust.id ? 'Edit' : 'Add'} Crust Option</h3>
              <button onClick={() => setShowCrustModal(false)} className="btn-icon text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div
              ref={crustModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
              onWheel={(event) => {
                if (crustModalContentRef.current) {
                  crustModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={editingCrust.name}
                  onChange={(e) => setEditingCrust({ ...editingCrust, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="e.g., Peanut Butter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editingCrust.description || ''}
                  onChange={(e) => setEditingCrust({ ...editingCrust, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={(editingCrust.price_cents / 100).toFixed(2)}
                  onChange={(e) => setEditingCrust({ ...editingCrust, price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Use 0 for "included" options</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="crust_available"
                  checked={editingCrust.available}
                  onChange={(e) => setEditingCrust({ ...editingCrust, available: e.target.checked })}
                  className="w-5 h-5 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                />
                <label htmlFor="crust_available" className="ml-2 text-sm font-medium text-gray-700">
                  Available for ordering
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={() => setShowCrustModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCrustOption}
                className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Placard Option Modal */}
      {showPlacardModal && editingPlacard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPlacardModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold">{editingPlacard.id ? 'Edit' : 'Add'} Placard Option</h3>
              <button onClick={() => setShowPlacardModal(false)} className="btn-icon text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div
              ref={placardModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
              onWheel={(event) => {
                if (placardModalContentRef.current) {
                  placardModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={editingPlacard.name}
                  onChange={(e) => setEditingPlacard({ ...editingPlacard, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="e.g., Happy Birthday"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editingPlacard.description || ''}
                  onChange={(e) => setEditingPlacard({ ...editingPlacard, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={(editingPlacard.price_cents / 100).toFixed(2)}
                  onChange={(e) => setEditingPlacard({ ...editingPlacard, price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Use 0 for "included" options</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="placard_available"
                  checked={editingPlacard.available}
                  onChange={(e) => setEditingPlacard({ ...editingPlacard, available: e.target.checked })}
                  className="w-5 h-5 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                />
                <label htmlFor="placard_available" className="ml-2 text-sm font-medium text-gray-700">
                  Available for ordering
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={() => setShowPlacardModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={savePlacardOption}
                className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pickup Window Modal */}
      {showWindowModal && editingWindow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowWindowModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold">{editingWindow.id ? 'Edit' : 'Add'} Pickup Window</h3>
              <button onClick={() => setShowWindowModal(false)} className="btn-icon text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div
              ref={windowModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
              onWheel={(event) => {
                if (windowModalContentRef.current) {
                  windowModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week *</label>
                <select
                  value={editingWindow.day_of_week}
                  onChange={(e) => setEditingWindow({ ...editingWindow, day_of_week: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                >
                  {DAYS.map((day, index) => (
                    <option key={index} value={index}>{day}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                  <select
                    value={editingWindow.start_time}
                    onChange={(e) => setEditingWindow({ ...editingWindow, start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                  <select
                    value={editingWindow.end_time}
                    onChange={(e) => setEditingWindow({ ...editingWindow, end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Orders Per Slot</label>
                <input
                  type="number"
                  value={editingWindow.capacity}
                  onChange={(e) => setEditingWindow({ ...editingWindow, capacity: parseInt(e.target.value) || 5 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="window_active"
                  checked={editingWindow.active}
                  onChange={(e) => setEditingWindow({ ...editingWindow, active: e.target.checked })}
                  className="w-5 h-5 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                />
                <label htmlFor="window_active" className="ml-2 text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={() => setShowWindowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={savePickupWindow}
                className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Date Modal */}
      {showBlockedModal && editingBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowBlockedModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold">{editingBlocked.id ? 'Edit' : 'Block'} Date</h3>
              <button onClick={() => setShowBlockedModal(false)} className="btn-icon text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div
              ref={blockedModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
              onWheel={(event) => {
                if (blockedModalContentRef.current) {
                  blockedModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={editingBlocked.blocked_date}
                  onChange={(e) => setEditingBlocked({ ...editingBlocked, blocked_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                />
              </div>

              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="block_all_day"
                  checked={editingBlocked.start_time === '00:00' && editingBlocked.end_time === '23:59'}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setEditingBlocked({ ...editingBlocked, start_time: '00:00', end_time: '23:59' });
                    } else {
                      setEditingBlocked({ ...editingBlocked, start_time: '09:00', end_time: '17:00' });
                    }
                  }}
                  className="w-5 h-5 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                />
                <label htmlFor="block_all_day" className="ml-2 text-sm font-medium text-gray-700">
                  Block entire day
                </label>
              </div>

              {!(editingBlocked.start_time === '00:00' && editingBlocked.end_time === '23:59') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <select
                      value={editingBlocked.start_time || '09:00'}
                      onChange={(e) => setEditingBlocked({ ...editingBlocked, start_time: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    >
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <select
                      value={editingBlocked.end_time || '17:00'}
                      onChange={(e) => setEditingBlocked({ ...editingBlocked, end_time: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    >
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={editingBlocked.reason || ''}
                  onChange={(e) => setEditingBlocked({ ...editingBlocked, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="e.g., Holiday, Fully booked"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={() => setShowBlockedModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveBlockedSlot}
                className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
