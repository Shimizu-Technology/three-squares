import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import api, { collectionsApi, type Collection } from '../services/api';

import { API_BASE_URL } from '../config';

// ============================================================================
// TYPES
// ============================================================================

interface SiteSettings {
  payment_test_mode: boolean;
  payment_processor: string;
  // Per-order-type email settings
  send_retail_emails: boolean;
  send_wholesale_emails: boolean;
  // Legacy field (kept for backwards compatibility)
  send_customer_emails: boolean;
  store_name: string;
  store_email: string;
  store_phone: string;
  placeholder_image_url?: string;
  order_notification_emails: string[];
  shipping_origin_address: {
    company: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email?: string;
  };
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_style: string;
}

const REQUIRED_ORIGIN_FIELDS: Array<keyof SiteSettings['shipping_origin_address']> = [
  'company',
  'street1',
  'city',
  'state',
  'zip',
  'country',
  'phone'
];

const DEFAULT_PLACEHOLDER_IMAGE = '/images/three-squares-logo.svg';
const DEFAULT_HOMEPAGE_HERO_IMAGE = '/images/three-squares-hero.jpg';
const DEFAULT_HERO_BADGE_TEXT = 'Island Living Apparel';
const DEFAULT_HERO_SECONDARY_TEXT = 'Browse Collections';
const DEFAULT_HERO_SECONDARY_LINK = '/collections';
const DEFAULT_CATEGORY_CARD_IMAGES: Record<number, string> = {
  0: '/images/three-squares-menu.jpg',
  1: '/images/three-squares-catering.jpg',
};
const DEFAULT_CATEGORY_CARD_LINKS: Record<number, string> = {
  0: '/products?collection=womens',
  1: '/products?collection=mens',
};
const DEFAULT_HERO_LINK = '/products';

const getMissingOriginFields = (address: SiteSettings['shipping_origin_address']) => {
  return REQUIRED_ORIGIN_FIELDS.filter((field) => !address[field]?.toString().trim());
};

interface HomepageSection {
  id: number;
  section_type: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  image_url: string | null;
  background_image_url: string | null;
  settings: Record<string, unknown>;
  active: boolean;
}

type TabType = 'general' | 'homepage';

const TABS: { id: TabType; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'homepage', label: 'Homepage' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminSettingsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get active tab from URL or default to 'general'
  const activeTab = (searchParams.get('tab') as TabType) || 'general';

  // General settings state
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [placeholderUploading, setPlaceholderUploading] = useState(false);
  const [showPlaceholderUrlInput, setShowPlaceholderUrlInput] = useState(false);
  // Homepage sections state
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [lastSavedSiteSettings, setLastSavedSiteSettings] = useState<SiteSettings | null>(null);

  // Fetch general settings
  useEffect(() => {
    fetchSettings();
  }, []);

  // Fetch homepage sections when tab changes
  useEffect(() => {
    if (activeTab === 'homepage') {
      fetchSections();
      fetchCollections();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const [siteSettingsResponse, adminSettingsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/v1/admin/site_settings`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/v1/admin/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const mergedSettings = {
        ...siteSettingsResponse.data,
        ...adminSettingsResponse.data.settings
      };
      setSettings(mergedSettings);
      setLastSavedSiteSettings(mergedSettings);
    } catch (err) {
      console.error('Failed to load settings:', err);
      toast.error('Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSections = useCallback(async () => {
    try {
      setSectionsLoading(true);
      const token = await getToken();
      const response = await api.get('/admin/homepage_sections', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSections(response.data.sections);
    } catch (err) {
      console.error('Failed to fetch sections:', err);
      toast.error('Failed to load homepage sections');
    } finally {
      setSectionsLoading(false);
    }
  }, [getToken]);

  const fetchCollections = useCallback(async () => {
    try {
      const response = await collectionsApi.getCollections({ per_page: 200 });
      setCollections(response.collections);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  }, []);

  const handleTabChange = (tab: TabType) => {
    setSearchParams({ tab });
  };

  const getSiteSettingsSnapshot = (value: SiteSettings | null) => {
    if (!value) return '';
    return JSON.stringify({
      store_name: value.store_name,
      store_email: value.store_email,
      store_phone: value.store_phone,
      placeholder_image_url: value.placeholder_image_url,
      announcement_enabled: value.announcement_enabled,
      announcement_text: value.announcement_text || '',
      announcement_style: value.announcement_style || 'gold',
      shipping_origin_address: {
        company: value.shipping_origin_address?.company || '',
        street1: value.shipping_origin_address?.street1 || '',
        street2: value.shipping_origin_address?.street2 || '',
        city: value.shipping_origin_address?.city || '',
        state: value.shipping_origin_address?.state || '',
        zip: value.shipping_origin_address?.zip || '',
        country: value.shipping_origin_address?.country || '',
        phone: value.shipping_origin_address?.phone || '',
        email: value.shipping_origin_address?.email || ''
      }
    });
  };

  const isSiteSettingsDirty =
    getSiteSettingsSnapshot(settings) !== getSiteSettingsSnapshot(lastSavedSiteSettings);

  // ============================================================================
  // GENERAL SETTINGS HANDLERS
  // ============================================================================

  const handleToggleTestMode = async () => {
    if (!settings) return;

    try {
      setSaving(true);

      const token = await getToken();
      const response = await axios.put(
        `${API_BASE_URL}/api/v1/admin/site_settings`,
        {
          site_setting: {
            payment_test_mode: !settings.payment_test_mode
          }
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setSettings((prev) => (prev ? { ...prev, ...response.data } : response.data));
      setLastSavedSiteSettings((prev) => (prev ? { ...prev, ...response.data } : response.data));
      const message = settings.payment_test_mode
        ? 'Production mode enabled - Real payments will be processed'
        : 'Test mode enabled - Payments will be simulated';

      toast.success(message, { duration: 4000 });
    } catch (err) {
      console.error('Failed to update settings:', err);
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update payment mode' : 'Failed to update payment mode');
    } finally {
      setSaving(false);
    }
  };

  // Toggle individual email settings per order type
  const handleToggleEmailSetting = async (field: 'send_retail_emails' | 'send_wholesale_emails') => {
    if (!settings) return;

    try {
      setSaving(true);

      const newValue = !settings[field];
      const token = await getToken();
      const response = await axios.put(
        `${API_BASE_URL}/api/v1/admin/settings`,
        { settings: { [field]: newValue } },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSettings({ ...settings, ...response.data.settings });

      const orderTypeLabels: Record<string, string> = {
        send_retail_emails: 'Retail',
        send_wholesale_emails: 'Wholesale'
      };
      const label = orderTypeLabels[field];
      const message = newValue
        ? `${label} order emails enabled`
        : `${label} order emails disabled`;

      toast.success(message, { duration: 3000 });
    } catch (err) {
      console.error('Failed to toggle email setting:', err);
      toast.error('Failed to update email setting');
    } finally {
      setSaving(false);
    }
  };

  const saveSiteSettings = async (updates: Partial<SiteSettings>) => {
    if (!settings) return;

    try {
      setSaving(true);
      const token = await getToken();
      const response = await axios.put(
        `${API_BASE_URL}/api/v1/admin/site_settings`,
        { site_setting: updates },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data as SiteSettings;
    } catch (err) {
      console.error('Failed to update settings:', err);
      const errorMsg =
        err.response?.data?.errors?.join(', ') ||
        err.response?.data?.error ||
        'Failed to update settings';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSiteSettings = async () => {
    if (!settings) return;

    const updates: Partial<SiteSettings> = {
      store_name: settings.store_name,
      store_email: settings.store_email,
      store_phone: settings.store_phone,
      placeholder_image_url: settings.placeholder_image_url,
      announcement_enabled: settings.announcement_enabled,
      announcement_text: settings.announcement_text,
      announcement_style: settings.announcement_style,
      shipping_origin_address: settings.shipping_origin_address
    };

    const responseData = await saveSiteSettings(updates);
    if (responseData) {
      const merged = { ...settings, ...responseData };
      setSettings(merged);
      setLastSavedSiteSettings(merged);
      toast.success('Settings saved');
    }
  };

  const handleDiscardSiteSettings = () => {
    if (!lastSavedSiteSettings) return;
    setSettings((prev) => (prev ? { ...prev, ...lastSavedSiteSettings } : lastSavedSiteSettings));
  };

  const updatePlaceholderImage = async (placeholderImageUrl: string) => {
    if (!settings) return;

    try {
      setPlaceholderUploading(true);
      setSettings({ ...settings, placeholder_image_url: placeholderImageUrl });
      toast.success('Placeholder image ready. Click Save to apply.');
    } catch (err) {
      console.error('Failed to update placeholder image:', err);
      toast.error(err.response?.data?.error || 'Failed to update placeholder image');
    } finally {
      setPlaceholderUploading(false);
    }
  };

  const handlePlaceholderUpload = async (file: File) => {
    try {
      setPlaceholderUploading(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await axios.post(
        `${API_BASE_URL}/api/v1/admin/uploads`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const { signed_id: signedId, filename } = uploadResponse.data.data;
      const encodedFilename = encodeURIComponent(filename);
      const blobUrl = `${API_BASE_URL}/rails/active_storage/blobs/redirect/${signedId}/${encodedFilename}`;

      await updatePlaceholderImage(blobUrl);
      setShowPlaceholderUrlInput(false);
    } catch (err) {
      console.error('Failed to upload placeholder image:', err);
      toast.error(err.response?.data?.error || 'Failed to upload placeholder image');
      setPlaceholderUploading(false);
    }
  };

  const handlePlaceholderFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handlePlaceholderUpload(file);
    e.target.value = '';
  };

  const updateSettings = (updates: Partial<SiteSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const updateShippingAddress = (updates: Partial<SiteSettings['shipping_origin_address']>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      shipping_origin_address: {
        ...settings.shipping_origin_address,
        ...updates
      }
    });
  };

  // ============================================================================
  // HOMEPAGE SECTION HANDLERS
  // ============================================================================

  const handleSaveSection = async (section: Partial<HomepageSection>) => {
    try {
      setSaving(true);
      const token = await getToken();

      if (section.id) {
        await api.put(`/admin/homepage_sections/${section.id}`, { section }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Section updated!');
      } else {
        await api.post('/admin/homepage_sections', { section }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Section created!');
      }

      await fetchSections();
      setEditingSection(null);
      setShowNewForm(false);
    } catch (err) {
      console.error('Failed to save section:', err);
      toast.error('Failed to save section');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = async (id: number) => {
    if (!confirm('Are you sure you want to delete this section?')) return;

    try {
      const token = await getToken();
      await api.delete(`/admin/homepage_sections/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Section deleted');
      await fetchSections();
    } catch (err) {
      console.error('Failed to delete section:', err);
      toast.error('Failed to delete section');
    }
  };

  const handleToggleSectionActive = async (section: HomepageSection) => {
    await handleSaveSection({ ...section, active: !section.active });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load settings</p>
          <button
            onClick={fetchSettings}
            className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin')}
            className="text-tsPrimary hover:underline mb-4 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Admin Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Store Settings</h1>
          <p className="text-gray-600 mt-2">Manage global settings for your Three Squares store</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === tab.id
                    ? 'border-tsPrimary text-tsPrimary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && (
          <GeneralSettingsTab
            settings={settings}
            saving={saving}
            placeholderUploading={placeholderUploading}
            showPlaceholderUrlInput={showPlaceholderUrlInput}
            isSiteSettingsDirty={isSiteSettingsDirty}
            onToggleTestMode={handleToggleTestMode}
            onToggleEmailSetting={handleToggleEmailSetting}
            onUpdateSettings={updateSettings}
            onUpdateShippingAddress={updateShippingAddress}
            onPlaceholderFileChange={handlePlaceholderFileChange}
            onUpdatePlaceholderImage={updatePlaceholderImage}
            onTogglePlaceholderUrlInput={() => setShowPlaceholderUrlInput((prev) => !prev)}
            onSaveSiteSettings={handleSaveSiteSettings}
            onDiscardSiteSettings={handleDiscardSiteSettings}
          />
        )}

        {activeTab === 'homepage' && (
          <HomepageSettingsTab
            sections={sections}
            collections={collections}
            loading={sectionsLoading}
            saving={saving}
            editingSection={editingSection}
            showNewForm={showNewForm}
            onSetEditingSection={setEditingSection}
            onSetShowNewForm={setShowNewForm}
            onSaveSection={handleSaveSection}
            onDeleteSection={handleDeleteSection}
            onToggleSectionActive={handleToggleSectionActive}
            onRefresh={fetchSections}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// GENERAL SETTINGS TAB
// ============================================================================

interface GeneralSettingsTabProps {
  settings: SiteSettings;
  saving: boolean;
  placeholderUploading: boolean;
  showPlaceholderUrlInput: boolean;
  isSiteSettingsDirty: boolean;
  onToggleTestMode: () => void;
  onToggleEmailSetting: (field: 'send_retail_emails' | 'send_wholesale_emails') => void;
  onUpdateSettings: (updates: Partial<SiteSettings>) => void;
  onUpdateShippingAddress: (updates: Partial<SiteSettings['shipping_origin_address']>) => void;
  onPlaceholderFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdatePlaceholderImage: (value: string) => void;
  onTogglePlaceholderUrlInput: () => void;
  onSaveSiteSettings: () => void;
  onDiscardSiteSettings: () => void;
}

function GeneralSettingsTab({
  settings,
  saving,
  placeholderUploading,
  showPlaceholderUrlInput,
  isSiteSettingsDirty,
  onToggleTestMode,
  onToggleEmailSetting,
  onUpdateSettings,
  onUpdateShippingAddress,
  onPlaceholderFileChange,
  onUpdatePlaceholderImage,
  onTogglePlaceholderUrlInput,
  onSaveSiteSettings,
  onDiscardSiteSettings,
}: GeneralSettingsTabProps) {
  const missingOriginFields = getMissingOriginFields(settings.shipping_origin_address);
  const isDefaultPlaceholder =
    !settings.placeholder_image_url || settings.placeholder_image_url === DEFAULT_PLACEHOLDER_IMAGE;

  return (
    <div className="space-y-6">
      {/* Announcement Banner Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Announcement Banner</h2>
          <p className="text-sm text-gray-500 mt-1">Display a banner at the top of every page</p>
        </div>
        <div className="p-6 space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div className="grow">
              <h3 className="font-medium text-gray-900">Enable Banner</h3>
              <p className="text-sm text-gray-600 mt-1">
                Show the announcement banner to all visitors
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ announcement_enabled: !settings.announcement_enabled })}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-tsPrimary focus:ring-offset-2 ml-4 ${
                settings.announcement_enabled ? 'bg-tsPrimary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.announcement_enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Banner Text */}
          <div>
            <label htmlFor="announcement_text" className="block text-sm font-medium text-gray-700 mb-2">
              Banner Message
            </label>
            <input
              type="text"
              id="announcement_text"
              value={settings.announcement_text || ''}
              onChange={(e) => onUpdateSettings({ announcement_text: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              placeholder="Enter your announcement message..."
            />
          </div>

          {/* Style Selector */}
          <div>
            <label htmlFor="announcement_style" className="block text-sm font-medium text-gray-700 mb-2">
              Banner Style
            </label>
            <select
              id="announcement_style"
              value={settings.announcement_style || 'gold'}
              onChange={(e) => onUpdateSettings({ announcement_style: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            >
              <option value="gold">Gold (Default)</option>
              <option value="info">Info (Blue)</option>
              <option value="success">Success (Green)</option>
              <option value="warning">Warning (Amber)</option>
              <option value="danger">Urgent (Red)</option>
            </select>
          </div>

          {/* Preview */}
          {settings.announcement_text?.trim() && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
              <div
                className="relative flex items-center justify-center px-10 py-2 rounded-lg shadow-sm"
                style={{ backgroundColor: {
                  gold: '#D4A030',
                  info: '#2563EB',
                  success: '#16A34A',
                  warning: '#D97706',
                  danger: '#DC2626',
                }[settings.announcement_style] ?? '#D4A030' }}
              >
                <p className="text-white text-sm font-medium text-center leading-snug">
                  {settings.announcement_text}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Settings Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Payment & Email Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Changes auto-save</p>
        </div>
        <div className="p-6 space-y-6">

        {/* Test Mode Toggle */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="grow">
              <h3 className="font-medium text-gray-900">Payment Test Mode</h3>
              <p className="text-sm text-gray-600 mt-1">
                When enabled, all payments are simulated without charging customers.
                Turn this off to process real payments via Stripe.
              </p>
            </div>
            <button
              onClick={onToggleTestMode}
              disabled={saving}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-tsPrimary focus:ring-offset-2 ml-4 ${
                settings.payment_test_mode ? 'bg-tsPrimary' : 'bg-gray-200'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.payment_test_mode ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <div className="flex items-center">
              {settings.payment_test_mode ? (
                <>
                  <svg className="w-6 h-6 inline mr-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <div>
                    <p className="font-medium text-gray-900">Test Mode Active</p>
                    <p className="text-sm text-gray-600">
                      Orders will be created but no actual charges will be made.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 inline mr-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                  <div>
                    <p className="font-medium text-gray-900">Production Mode Active</p>
                    <p className="text-sm text-gray-600">
                      Real payments will be processed via Stripe.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Customer Emails Toggles - Per Order Type */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h3 className="font-medium text-gray-900 mb-1">Customer Confirmation Emails</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure which order types send confirmation emails to customers.
            Admin notifications are always sent regardless of these settings.
          </p>

          {/* Retail Orders Toggle */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Retail Orders</p>
              <p className="text-sm text-gray-500">Online store purchases</p>
            </div>
            <button
              onClick={() => onToggleEmailSetting('send_retail_emails')}
              disabled={saving}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-tsPrimary focus:ring-offset-2 ${
                settings.send_retail_emails ? 'bg-green-500' : 'bg-gray-200'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.send_retail_emails ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Wholesale Orders Toggle */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-gray-900">Wholesale Orders</p>
              <p className="text-sm text-gray-500">Wholesale orders</p>
            </div>
            <button
              onClick={() => onToggleEmailSetting('send_wholesale_emails')}
              disabled={saving}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-tsPrimary focus:ring-offset-2 ${
                settings.send_wholesale_emails ? 'bg-green-500' : 'bg-gray-200'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.send_wholesale_emails ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Summary */}
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <div className="flex items-center">
              <svg className="w-5 h-5 inline mr-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              <p className="text-sm text-gray-600">
                <strong>Status:</strong>{' '}
                {[
                  settings.send_retail_emails && 'Retail',
                  settings.send_wholesale_emails && 'Wholesale'
                ].filter(Boolean).join(', ') || 'All emails disabled'}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Processor */}
        <div>
          <h3 className="font-medium text-gray-900 mb-2">Payment Processor</h3>
          <div className="flex items-center">
            <img
              src="https://stripe.com/img/v3/home/social.png"
              alt="Stripe"
              className="h-8 w-auto mr-3"
            />
            <span className="text-gray-700 font-medium">Stripe</span>
            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
              Active
            </span>
          </div>
        </div>
        </div>
      </div>

      {/* Store Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Store Information</h2>
          <p className="text-sm text-gray-500 mt-1">Save changes when finished</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Store Name */}
          <div>
            <label htmlFor="store_name" className="block text-sm font-medium text-gray-700 mb-2">
              Store Name
            </label>
            <input
              type="text"
              id="store_name"
              value={settings.store_name}
              onChange={(e) => onUpdateSettings({ store_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              required
            />
          </div>

          {/* Store Email */}
          <div>
            <label htmlFor="store_email" className="block text-sm font-medium text-gray-700 mb-2">
              Store Email
            </label>
            <input
              type="email"
              id="store_email"
              value={settings.store_email}
              onChange={(e) => onUpdateSettings({ store_email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Used for order notifications and customer communications
            </p>
          </div>

          {/* Store Phone */}
          <div>
            <label htmlFor="store_phone" className="block text-sm font-medium text-gray-700 mb-2">
              Store Phone
            </label>
            <input
              type="tel"
              id="store_phone"
              value={settings.store_phone}
              onChange={(e) => onUpdateSettings({ store_phone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              required
            />
          </div>

          {/* Placeholder Image */}
          <div>
            <label htmlFor="placeholder_image_url" className="block text-sm font-medium text-gray-700 mb-2">
              Product Placeholder Image
            </label>
            <p className="mt-1 text-sm text-gray-500">
              Used wherever a product image is missing. Default is the Three Squares logo.
            </p>
            <div className="mt-3 flex items-center gap-4">
              <div className="h-24 w-24 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                <img
                  src={settings.placeholder_image_url || DEFAULT_PLACEHOLDER_IMAGE}
                  alt="Placeholder preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPlaceholderFileChange}
                    className="hidden"
                    disabled={saving || placeholderUploading}
                  />
                  <span
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                      saving || placeholderUploading
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-tsPrimary hover:text-tsPrimary cursor-pointer'
                    }`}
                  >
                    {placeholderUploading ? 'Uploading...' : 'Upload Custom Placeholder'}
                  </span>
                </label>
                {!isDefaultPlaceholder && (
                  <button
                    type="button"
                    onClick={() => onUpdatePlaceholderImage(DEFAULT_PLACEHOLDER_IMAGE)}
                    disabled={saving || placeholderUploading}
                    className="text-sm text-gray-600 hover:text-tsPrimary underline disabled:text-gray-400"
                  >
                    Reset to default logo
                  </button>
                )}
                <button
                  type="button"
                  onClick={onTogglePlaceholderUrlInput}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {showPlaceholderUrlInput ? 'Hide custom URL' : 'Use a custom URL instead'}
                </button>
              </div>
            </div>
            {showPlaceholderUrlInput && (
              <div className="mt-3">
                <input
                  type="text"
                  id="placeholder_image_url"
                  value={isDefaultPlaceholder ? '' : settings.placeholder_image_url || ''}
                  onChange={(e) => onUpdateSettings({ placeholder_image_url: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="https://... or /images/..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  Paste a public image URL. Save changes when finished.
                </p>
              </div>
            )}
          </div>

          {/* Shipping Origin Address */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Shipping Origin Address</h3>

            {missingOriginFields.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">Shipping origin address is incomplete.</p>
                <p className="mt-1 text-sm text-amber-800">
                  Rates may fail until all required fields are filled:
                  <span className="font-semibold"> {missingOriginFields.join(', ')}</span>
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  id="company"
                  value={settings.shipping_origin_address.company}
                  onChange={(e) => onUpdateShippingAddress({ company: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="street1" className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address
                </label>
                <input
                  type="text"
                  id="street1"
                  value={settings.shipping_origin_address.street1}
                  onChange={(e) => onUpdateShippingAddress({ street1: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="street2" className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address Line 2 (Optional)
                </label>
                <input
                  type="text"
                  id="street2"
                  value={settings.shipping_origin_address.street2 || ''}
                  onChange={(e) => onUpdateShippingAddress({ street2: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    id="city"
                    value={settings.shipping_origin_address.city}
                    onChange={(e) => onUpdateShippingAddress({ city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    id="state"
                    value={settings.shipping_origin_address.state}
                    onChange={(e) => onUpdateShippingAddress({ state: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-2">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    id="zip"
                    value={settings.shipping_origin_address.zip}
                    onChange={(e) => onUpdateShippingAddress({ zip: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    id="country"
                    value={settings.shipping_origin_address.country}
                    onChange={(e) => onUpdateShippingAddress({ country: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="address_phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Shipping Phone
                </label>
                <input
                  type="tel"
                  id="address_phone"
                  value={settings.shipping_origin_address.phone}
                  onChange={(e) => onUpdateShippingAddress({ phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {isSiteSettingsDirty && (
        <div className="sticky bottom-4">
          <div className="bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-gray-600">
              You have unsaved changes.
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onDiscardSiteSettings}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={onSaveSiteSettings}
                disabled={saving}
                className={`px-5 py-2 rounded-lg text-sm font-medium text-white bg-tsPrimary hover:bg-primary-dark transition ${
                  saving ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HOMEPAGE SETTINGS TAB
// ============================================================================

// Phase 2: Section types will be used when Add Section is implemented
// const SECTION_TYPES = [
//   { value: 'hero', label: 'Hero Banner', description: 'Main banner at top of homepage' },
//   { value: 'category_card', label: 'Category Card', description: 'Shop by category cards' },
//   { value: 'promo_banner', label: 'Promo Banner', description: 'Promotional announcement' },
//   { value: 'text_block', label: 'Text Block', description: 'Text content section' },
// ];

interface HomepageSettingsTabProps {
  sections: HomepageSection[];
  collections: Collection[];
  loading: boolean;
  saving: boolean;
  editingSection: HomepageSection | null;
  showNewForm: boolean;
  onSetEditingSection: (section: HomepageSection | null) => void;
  onSetShowNewForm: (show: boolean) => void;
  onSaveSection: (section: Partial<HomepageSection>) => Promise<void>;
  onDeleteSection: (id: number) => Promise<void>;
  onToggleSectionActive: (section: HomepageSection) => Promise<void>;
  onRefresh: () => void;
}

function HomepageSettingsTab({
  sections,
  collections,
  loading,
  saving,
  editingSection,
  showNewForm,
  onSetEditingSection,
  onSetShowNewForm,
  onSaveSection,
  onDeleteSection,
  onToggleSectionActive,
}: HomepageSettingsTabProps) {
  // Suppress unused variable warnings for Phase 2 functionality
  void onDeleteSection;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tsPrimary"></div>
      </div>
    );
  }

  // Group sections by type
  const groupedSections = sections.reduce((acc, section) => {
    if (!acc[section.section_type]) {
      acc[section.section_type] = [];
    }
    acc[section.section_type].push(section);
    return acc;
  }, {} as Record<string, HomepageSection[]>);

  // Suppress unused variable warnings for Phase 2 functionality
  void showNewForm;
  void onSetShowNewForm;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Homepage Sections</h2>
          <p className="text-sm text-gray-500">Update your hero banner and category cards.</p>
        </div>
      </div>

      {/* Phase 2: Add Section functionality will go here */}

      {/* Edit Section Form */}
      {editingSection && (
        <SectionForm
          section={editingSection}
          collections={collections}
          onSave={onSaveSection}
          onCancel={() => onSetEditingSection(null)}
          saving={saving}
        />
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No homepage sections configured yet. Run database seeds to set up the default hero and category cards.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSections).map(([type, typeSections]) => (
            <div key={type} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {type.replace('_', ' ')} Sections
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {type === 'hero' ? 'Main homepage banner content.' : 'Cards shown in the Shop by Category section.'}
                </p>
              </div>
              <div className="divide-y">
                {typeSections.map((section) => (
                  <div key={section.id} className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Preview */}
                    {(section.image_url || section.background_image_url) && (
                      <div className="w-full sm:w-32 sm:h-24 rounded-lg overflow-hidden shrink-0 bg-gray-100 border border-gray-200">
                        <img
                          src={section.image_url || section.background_image_url || ''}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 truncate">
                          {section.title || 'Untitled Section'}
                        </h4>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          section.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {section.active ? 'Active' : 'Hidden'}
                        </span>
                      </div>
                      {section.subtitle && (
                        <p className="text-sm text-gray-600 truncate">{section.subtitle}</p>
                      )}
                      {section.button_link && (
                        <p className="text-xs text-gray-400 mt-1">Links to: {section.button_link}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-start">
                      <button
                        onClick={() => onToggleSectionActive(section)}
                        className={`px-3 py-1 text-sm rounded-lg border ${
                          section.active
                            ? 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        }`}
                      >
                        {section.active ? 'Hide' : 'Show'}
                      </button>
                      <button
                        onClick={() => onSetEditingSection(section)}
                        className="px-3 py-1 text-sm bg-tsPrimary/10 text-tsPrimary rounded-lg hover:bg-tsPrimary/15"
                      >
                        Edit
                      </button>
                      {/* Phase 2: Delete button will be re-enabled when Add Section is implemented */}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Link */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-blue-900">Preview your homepage</p>
          <p className="text-sm text-blue-700">See how your changes look on the live site</p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          View Homepage
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION FORM COMPONENT
// ============================================================================

interface SectionFormProps {
  section?: HomepageSection;
  collections: Collection[];
  onSave: (section: Partial<HomepageSection>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function SectionForm({ section, collections, onSave, onCancel, saving }: SectionFormProps) {
  const { getToken } = useAuth();
  const defaultImageUrl =
    section?.settings?.default_image_url
      ? String(section.settings.default_image_url)
      : section?.section_type === 'category_card' && typeof section?.position === 'number'
        ? DEFAULT_CATEGORY_CARD_IMAGES[section.position] || ''
        : '';
  const defaultBackgroundUrl =
    section?.settings?.default_background_image_url
      ? String(section.settings.default_background_image_url)
      : section?.section_type === 'hero'
        ? DEFAULT_HOMEPAGE_HERO_IMAGE
        : '';
  const defaultButtonLink =
    section?.settings?.default_button_link
      ? String(section.settings.default_button_link)
      : section?.section_type === 'hero'
        ? DEFAULT_HERO_LINK
        : section?.section_type === 'category_card' && typeof section?.position === 'number'
          ? DEFAULT_CATEGORY_CARD_LINKS[section.position] || ''
          : '';
  const [formData, setFormData] = useState<Partial<HomepageSection>>({
    section_type: section?.section_type || 'hero',
    title: section?.title || '',
    subtitle: section?.subtitle || '',
    button_text: section?.button_text || '',
    button_link: section?.button_link || '',
    image_url: section?.image_url || '',
    background_image_url: section?.background_image_url || '',
    position: section?.position || 0,
    active: section?.active ?? true,
    ...section,
  });
  const [imageUploading, setImageUploading] = useState(false);
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [showBackgroundUrlInput, setShowBackgroundUrlInput] = useState(false);
  const [linkType, setLinkType] = useState<'collection' | 'page' | 'custom'>(() => {
    const link = section?.button_link || '';
    if (link.startsWith('/products?collection=')) return 'collection';
    if (link.startsWith('/') && !link.includes('http')) return 'page';
    if (!link) return 'page';
    return 'custom';
  });
  const [selectedCollection, setSelectedCollection] = useState<string>(() => {
    const link = section?.button_link || '';
    const match = link.match(/\/products\?collection=([^&]+)/);
    return match?.[1] || '';
  });
  const [selectedPage, setSelectedPage] = useState<string>(() => {
    const link = section?.button_link || '';
    if (!link || link.startsWith('/products?collection=')) return '/products';
    return link;
  });
  const isDefaultImage = defaultImageUrl ? (formData.image_url || '') === defaultImageUrl : true;
  const isDefaultBackground = defaultBackgroundUrl
    ? (formData.background_image_url || '') === defaultBackgroundUrl
    : true;
  const isDefaultLink = defaultButtonLink ? (formData.button_link || '') === defaultButtonLink : true;
  const selectedCollectionExists = selectedCollection
    ? collections.some((collection) => collection.slug === selectedCollection)
    : true;

  useEffect(() => {
    setShowImageUrlInput(false);
    setShowBackgroundUrlInput(false);
    const link = section?.button_link || '';
    if (link.startsWith('/products?collection=')) {
      setLinkType('collection');
      const match = link.match(/\/products\?collection=([^&]+)/);
      setSelectedCollection(match?.[1] || '');
    } else if (link.startsWith('/') && !link.includes('http')) {
      setLinkType('page');
      setSelectedPage(link);
    } else if (!link) {
      setLinkType('page');
      setSelectedPage('/products');
    } else {
      setLinkType('custom');
    }
  }, [section?.id]);

  useEffect(() => {
    if (linkType === 'collection') {
      const link = selectedCollection ? `/products?collection=${selectedCollection}` : '';
      setFormData((prev) => ({ ...prev, button_link: link }));
    } else if (linkType === 'page') {
      setFormData((prev) => ({ ...prev, button_link: selectedPage || '' }));
    }
  }, [linkType, selectedCollection, selectedPage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const uploadSectionImage = async (file: File, field: 'image_url' | 'background_image_url') => {
    try {
      setImageUploading(true);
      const token = await getToken();
      const formDataPayload = new FormData();
      formDataPayload.append('file', file);

      const uploadResponse = await axios.post(
        `${API_BASE_URL}/api/v1/admin/uploads`,
        formDataPayload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const { signed_id: signedId, filename } = uploadResponse.data.data;
      const encodedFilename = encodeURIComponent(filename);
      const blobUrl = `${API_BASE_URL}/rails/active_storage/blobs/redirect/${signedId}/${encodedFilename}`;

      setFormData((prev) => ({ ...prev, [field]: blobUrl }));
      toast.success('Image uploaded');
    } catch (err) {
      console.error('Failed to upload image:', err);
      toast.error(err.response?.data?.error || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'image_url' | 'background_image_url'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadSectionImage(file, field);
    e.target.value = '';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900">
        {section ? 'Edit Section' : 'New Section'}
        </h3>
        <span className="text-xs text-gray-500">Changes apply after Save</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section Type - Read only display */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <span className="text-sm text-gray-500">Section Type: </span>
          <span className="font-medium text-gray-900">
            {formData.section_type === 'hero' ? 'Hero Banner' :
             formData.section_type === 'category_card' ? 'Category Card' :
             formData.section_type}
          </span>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            placeholder="Enter section title"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subtitle
          </label>
          <textarea
            value={formData.subtitle || ''}
            onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            placeholder="Enter subtitle or description"
          />
        </div>

        {/* Hero-only settings */}
        {formData.section_type === 'hero' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Badge Text</label>
              <input
                type="text"
                value={
                  typeof formData.settings?.badge_text === 'string'
                    ? (formData.settings.badge_text as string)
                    : DEFAULT_HERO_BADGE_TEXT
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    settings: {
                      ...(prev.settings || {}),
                      badge_text: e.target.value,
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                placeholder={DEFAULT_HERO_BADGE_TEXT}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Button Text</label>
              <input
                type="text"
                value={
                  typeof formData.settings?.secondary_button_text === 'string'
                    ? (formData.settings.secondary_button_text as string)
                    : DEFAULT_HERO_SECONDARY_TEXT
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    settings: {
                      ...(prev.settings || {}),
                      secondary_button_text: e.target.value,
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                placeholder={DEFAULT_HERO_SECONDARY_TEXT}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Button Link</label>
              <input
                type="text"
                value={
                  typeof formData.settings?.secondary_button_link === 'string'
                    ? (formData.settings.secondary_button_link as string)
                    : DEFAULT_HERO_SECONDARY_LINK
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    settings: {
                      ...(prev.settings || {}),
                      secondary_button_link: e.target.value,
                    },
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                placeholder={DEFAULT_HERO_SECONDARY_LINK}
              />
              <p className="mt-1 text-xs text-gray-500">Example: /collections</p>
            </div>
          </div>
        )}

        {/* Image - Show different field based on section type */}
        {formData.section_type === 'hero' ? (
          // Hero sections use background_image_url
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Background Image
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Shown behind the hero text. Default image is already set.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="h-28 w-full sm:w-48 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                {formData.background_image_url ? (
                  <img src={formData.background_image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400">No image</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, 'background_image_url')}
                    className="hidden"
                    disabled={saving || imageUploading}
                  />
                  <span
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                      saving || imageUploading
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-tsPrimary hover:text-tsPrimary cursor-pointer'
                    }`}
                  >
                    {imageUploading ? 'Uploading...' : 'Upload New Image'}
                  </span>
                </label>
                {!isDefaultBackground && defaultBackgroundUrl && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, background_image_url: defaultBackgroundUrl }))}
                    className="text-xs text-gray-500 hover:text-gray-700 text-left"
                  >
                    Reset to default image
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowBackgroundUrlInput((prev) => !prev)}
                  className="text-xs text-gray-500 hover:text-gray-700 text-left"
                >
                  {showBackgroundUrlInput ? 'Hide custom URL' : 'Use a custom URL instead'}
                </button>
              </div>
            </div>
            {showBackgroundUrlInput && (
              <div className="mt-3">
                <input
                  type="text"
                  value={formData.background_image_url || ''}
                  onChange={(e) => setFormData({ ...formData, background_image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="https://... or /images/..."
                />
                <p className="mt-1 text-xs text-gray-500">Paste a public image URL.</p>
              </div>
            )}
          </div>
        ) : (
          // Category cards and other sections use image_url
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Card Image
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Shown on the card. Default image is already set.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="h-28 w-full sm:w-48 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                {formData.image_url ? (
                  <img src={formData.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400">No image</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, 'image_url')}
                    className="hidden"
                    disabled={saving || imageUploading}
                  />
                  <span
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                      saving || imageUploading
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-tsPrimary hover:text-tsPrimary cursor-pointer'
                    }`}
                  >
                    {imageUploading ? 'Uploading...' : 'Upload New Image'}
                  </span>
                </label>
                {!isDefaultImage && defaultImageUrl && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, image_url: defaultImageUrl }))}
                    className="text-xs text-gray-500 hover:text-gray-700 text-left"
                  >
                    Reset to default image
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowImageUrlInput((prev) => !prev)}
                  className="text-xs text-gray-500 hover:text-gray-700 text-left"
                >
                  {showImageUrlInput ? 'Hide custom URL' : 'Use a custom URL instead'}
                </button>
              </div>
            </div>
            {showImageUrlInput && (
              <div className="mt-3">
                <input
                  type="text"
                  value={formData.image_url || ''}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="https://... or /images/..."
                />
                <p className="mt-1 text-xs text-gray-500">Paste a public image URL.</p>
              </div>
            )}
          </div>
        )}

        {/* Button */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Button Text
            </label>
            <input
              type="text"
              value={formData.button_text || ''}
              onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              placeholder="Shop Now"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link Type
            </label>
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as 'collection' | 'page' | 'custom')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent bg-white"
            >
              <option value="page">Page</option>
              <option value="collection">Collection</option>
              <option value="custom">Custom URL</option>
            </select>
            {!isDefaultLink && defaultButtonLink && (
              <button
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, button_link: defaultButtonLink }));
                  if (defaultButtonLink.startsWith('/products?collection=')) {
                    setLinkType('collection');
                    const match = defaultButtonLink.match(/\/products\?collection=([^&]+)/);
                    setSelectedCollection(match?.[1] || '');
                  } else if (defaultButtonLink.startsWith('/') && !defaultButtonLink.includes('http')) {
                    setLinkType('page');
                    setSelectedPage(defaultButtonLink);
                  } else {
                    setLinkType('custom');
                  }
                }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                Reset to default link
              </button>
            )}
          </div>
        </div>

        {linkType === 'collection' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Collection
            </label>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent bg-white"
            >
              <option value="">Select a collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.slug}>
                  {collection.name}
                </option>
              ))}
            </select>
            {!selectedCollectionExists && (
              <p className="mt-1 text-xs text-amber-600">
                This collection no longer exists. Choose a new one or reset to default.
              </p>
            )}
          </div>
        )}

        {linkType === 'page' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page
            </label>
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent bg-white"
            >
              <option value="/products">Shop</option>
              <option value="/collections">Collections</option>
              <option value="/about">Our Story</option>
              <option value="/contact">Contact</option>
              <option value="/shipping-info">Shipping Info</option>
              <option value="/returns">Returns</option>
            </select>
          </div>
        )}

        {linkType === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Button Link
            </label>
            <input
              type="text"
              value={formData.button_link || ''}
              onChange={(e) => setFormData({ ...formData, button_link: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              placeholder="https://... or /products"
            />
            <p className="mt-1 text-xs text-gray-500">Use a full URL or a site path.</p>
          </div>
        )}

        {/* Phase 2: Position field will be re-added when Add Section is implemented */}

        {/* Active Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={formData.active}
            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
            className="w-4 h-4 text-tsPrimary focus:ring-tsPrimary border-gray-300 rounded"
          />
          <label htmlFor="active" className="text-sm text-gray-700">
            Active (visible on homepage)
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : section ? 'Save Changes' : 'Create Section'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
