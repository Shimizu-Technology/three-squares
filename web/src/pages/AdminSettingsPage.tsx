import { StatusBadge } from '../components/ui/StatusBadge';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import { CheckField } from '../components/ui/CheckField';
import { Textarea } from '../components/ui/Textarea';
import { FileButton } from '../components/ui/FileButton';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Field } from '../components/ui/Field';
import { Switch } from '../components/ui/Switch';
import { ChoiceGroup } from '../components/ui/ChoiceGroup';
import { Button } from '../components/ui/Button';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import api, { collectionsApi, type Collection } from '../services/api';
import { invalidateAppConfig } from '../hooks/useAppConfig';

import OnlineOrderingSection from '../components/admin/OnlineOrderingSection';
import { API_BASE_URL } from '../config';
import { ANNOUNCEMENT_STYLE_HEX } from '../constants/announcementStyles';
import PaymentStatusPanel from '../components/payment/PaymentStatusPanel';

// ============================================================================
// TYPES
// ============================================================================

interface SiteSettings {
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
  enable_storefront_three_squares: boolean;
  enable_storefront_latte_stone: boolean;
  enable_storefront_catering: boolean;
  enable_catering_online_ordering: boolean;
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

type EmailField = 'send_retail_emails' | 'send_wholesale_emails';
type StorefrontField = 'enable_storefront_three_squares' | 'enable_storefront_latte_stone' | 'enable_storefront_catering' | 'enable_catering_online_ordering';
type ImmediateField = EmailField | StorefrontField;
type SaveState = 'saving' | 'saved' | 'checking' | 'checked' | 'uncertain';

type TabType = 'general' | 'homepage';

const TABS: { id: TabType; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'homepage', label: 'Homepage' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminSettingsPage({ homepageOnly = false }: { homepageOnly?: boolean }) {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get active tab from URL or default to 'general'
  const activeTab = homepageOnly ? 'homepage' : (searchParams.get('tab') as TabType) || 'general';

  // General settings state
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldSaveStates, setFieldSaveStates] = useState<Partial<Record<ImmediateField, SaveState>>>({});
  const pendingFields = useRef(new Set<ImmediateField>());
  const saveGeneration = useRef(0);
  useEffect(() => () => { saveGeneration.current += 1; }, []);
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
    if (!homepageOnly) fetchSettings();
  }, [homepageOnly]);

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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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

  // A lost response cannot prove a write failed. Read only the affected field;
  // replacing a full settings response here would erase unrelated drafts.
  const checkSavedImmediateField = async (field: ImmediateField, generation = saveGeneration.current) => {
    setFieldSaveStates((prev) => ({ ...prev, [field]: 'checking' }));
    try {
      const token = await getToken();
      const emailField = field === 'send_retail_emails' || field === 'send_wholesale_emails';
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/admin/${emailField ? 'settings' : 'site_settings'}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
      );
      const value = (emailField ? response.data.settings : response.data)[field];
      if (typeof value !== 'boolean') throw new Error('Saved value unavailable');
      if (generation !== saveGeneration.current) return;
      setSettings((prev) => prev ? { ...prev, [field]: value } : prev);
      setLastSavedSiteSettings((prev) => prev ? { ...prev, [field]: value } : prev);
      setFieldSaveStates((prev) => ({ ...prev, [field]: 'checked' }));
      if (!emailField) invalidateAppConfig();
    } catch {
      if (generation !== saveGeneration.current) return;
      setFieldSaveStates((prev) => ({ ...prev, [field]: 'uncertain' }));
    }
  };

  const handleCheckSavedField = async (field: ImmediateField) => {
    if (pendingFields.current.has(field)) return;
    pendingFields.current.add(field);
    try { await checkSavedImmediateField(field); }
    finally { pendingFields.current.delete(field); }
  };

  // Toggle individual email settings per order type
  const handleToggleEmailSetting = async (field: EmailField) => {
    if (!settings || saving || pendingFields.current.has(field)) return;
    pendingFields.current.add(field);
    const generation = saveGeneration.current;
    setFieldSaveStates((prev) => ({ ...prev, [field]: 'saving' }));

    try {
      const newValue = !settings[field];
      const token = await getToken();
      const response = await axios.put(
        `${API_BASE_URL}/api/v1/admin/settings`,
        { settings: { [field]: newValue } },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
      );

      if (generation !== saveGeneration.current) return;
      const savedValue = response.data.settings[field] ?? newValue;
      setSettings((prev) => prev ? { ...prev, [field]: savedValue } : prev);
      setLastSavedSiteSettings((prev) => prev ? { ...prev, [field]: savedValue } : prev);
      setFieldSaveStates((prev) => ({ ...prev, [field]: 'saved' }));

      const orderTypeLabels: Record<string, string> = {
        send_retail_emails: 'Retail',
        send_wholesale_emails: 'Wholesale'
      };
      const label = orderTypeLabels[field];
      const message = newValue
        ? `${label} order emails enabled`
        : `${label} order emails disabled`;

      toast.success(message, { duration: 3000 });
    } catch (err: any) {
      if (generation !== saveGeneration.current) return;
      await checkSavedImmediateField(field, generation);
      if (generation !== saveGeneration.current) return;
      console.error('Failed to toggle email setting:', err);
      toast.error('Save response unavailable. Check the current saved value.');
    } finally {
      pendingFields.current.delete(field);
    }
  };

  const handleToggleStorefront = async (field: StorefrontField) => {
    if (!settings || saving || pendingFields.current.has(field)) return;
    pendingFields.current.add(field);
    const generation = saveGeneration.current;
    setFieldSaveStates((prev) => ({ ...prev, [field]: 'saving' }));

    try {
      const newValue = !settings[field];
      const token = await getToken();
      await axios.put(
        `${API_BASE_URL}/api/v1/admin/site_settings`,
        { site_setting: { [field]: newValue } },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
      );

      if (generation !== saveGeneration.current) return;
      setFieldSaveStates((prev) => ({ ...prev, [field]: 'saved' }));
      // Saving one toggle must not replace unrelated unsaved form fields.
      setSettings((prev) => (prev ? { ...prev, [field]: newValue } : prev));
      setLastSavedSiteSettings((prev) => (prev ? { ...prev, [field]: newValue } : prev));

      const labels: Record<string, string> = {
        enable_storefront_three_squares: 'Three Squares',
        enable_storefront_latte_stone: 'Latte Stone Cookies',
        enable_storefront_catering: 'Catering',
        enable_catering_online_ordering: 'Catering online ordering',
      };
      invalidateAppConfig();
      toast.success(`${labels[field]} ${newValue ? 'enabled' : 'disabled'}`, { duration: 3000 });
    } catch (err: unknown) {
      if (generation !== saveGeneration.current) return;
      await checkSavedImmediateField(field, generation);
      if (generation !== saveGeneration.current) return;
      console.error('Failed to toggle storefront:', err);
      toast.error('Save response unavailable. Check the current saved value.');
    } finally {
      pendingFields.current.delete(field);
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
    } catch (err: any) {
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
    if (!settings || saving || pendingFields.current.size > 0) return;

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
      const savedFields = Object.fromEntries(Object.keys(updates).map((key) => [key, responseData[key as keyof SiteSettings] ?? updates[key as keyof SiteSettings]]));
      setSettings((prev) => {
        if (!prev) return prev;
        const unchangedFields = Object.fromEntries(Object.entries(savedFields).filter(([key]) =>
          JSON.stringify(prev[key as keyof SiteSettings]) === JSON.stringify(updates[key as keyof SiteSettings])));
        return { ...prev, ...unchangedFields };
      });
      setLastSavedSiteSettings((prev) => prev ? { ...prev, ...savedFields } : prev);
      // Invalidate the app config cache so public-facing pages pick up changes
      // within the TTL window (no page reload required for visitors)
      invalidateAppConfig();
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
      setSettings((prev) => prev ? { ...prev, placeholder_image_url: placeholderImageUrl } : prev);
      toast.success('Placeholder image ready. Click Save to apply.');
    } catch (err: any) {
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
    } catch (err: any) {
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
    setSettings((prev) => prev ? { ...prev, ...updates } : prev);
  };

  const updateShippingAddress = (updates: Partial<SiteSettings['shipping_origin_address']>) => {
    setSettings((prev) => prev ? { ...prev, shipping_origin_address: { ...prev.shipping_origin_address, ...updates } } : prev);
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
    } catch (err: any) {
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
    } catch (err: any) {
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


  return (
    <div>
      <div className="space-y-6">
        <AdminPageHeader title={homepageOnly ? 'Homepage' : 'Store Settings'}
          subtitle={homepageOnly ? 'Manage homepage banners and featured content' : 'Manage global settings for your Three Squares store'} />

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <ChoiceGroup label="Settings sections" value={activeTab} onChange={handleTabChange}
            choices={TABS.filter(tab => !homepageOnly || tab.id === 'homepage').map(tab => ({value:tab.id,label:tab.label}))} />
        </div>

        {activeTab === 'general' && <OnlineOrderingSection />}
        {activeTab === 'general' && loading && (
          <p role="status" className="py-8 text-gray-600">Loading settings...</p>
        )}
        {activeTab === 'general' && !loading && !settings && (
          <div role="alert" className="py-8">
            <p className="text-red-600 mb-4">Failed to load settings</p>
            <Button onClick={fetchSettings} variant="primary">Retry</Button>
          </div>
        )}
        {/* Tab Content */}
        {activeTab === 'general' && !loading && settings && (
          <GeneralSettingsTab
            settings={settings}
            saving={saving}
            fieldSaveStates={fieldSaveStates}
            onCheckSavedField={handleCheckSavedField}
            placeholderUploading={placeholderUploading}
            showPlaceholderUrlInput={showPlaceholderUrlInput}
            isSiteSettingsDirty={isSiteSettingsDirty}
            onToggleEmailSetting={handleToggleEmailSetting}
            onUpdateSettings={updateSettings}
            onUpdateShippingAddress={updateShippingAddress}
            onPlaceholderFileChange={handlePlaceholderFileChange}
            onUpdatePlaceholderImage={updatePlaceholderImage}
            onTogglePlaceholderUrlInput={() => setShowPlaceholderUrlInput((prev) => !prev)}
            onSaveSiteSettings={handleSaveSiteSettings}
            onDiscardSiteSettings={handleDiscardSiteSettings}
            onToggleStorefront={handleToggleStorefront}
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
  fieldSaveStates: Partial<Record<ImmediateField, SaveState>>;
  onCheckSavedField: (field: ImmediateField) => void;
  placeholderUploading: boolean;
  showPlaceholderUrlInput: boolean;
  isSiteSettingsDirty: boolean;
  onToggleEmailSetting: (field: 'send_retail_emails' | 'send_wholesale_emails') => void;
  onUpdateSettings: (updates: Partial<SiteSettings>) => void;
  onUpdateShippingAddress: (updates: Partial<SiteSettings['shipping_origin_address']>) => void;
  onPlaceholderFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdatePlaceholderImage: (value: string) => void;
  onTogglePlaceholderUrlInput: () => void;
  onSaveSiteSettings: () => void;
  onDiscardSiteSettings: () => void;
  onToggleStorefront: (field: 'enable_storefront_three_squares' | 'enable_storefront_latte_stone' | 'enable_storefront_catering' | 'enable_catering_online_ordering') => void;
}

function GeneralSettingsTab({
  settings,
  saving,
  fieldSaveStates,
  onCheckSavedField,
  placeholderUploading,
  showPlaceholderUrlInput,
  isSiteSettingsDirty,
  onToggleEmailSetting,
  onUpdateSettings,
  onUpdateShippingAddress,
  onPlaceholderFileChange,
  onUpdatePlaceholderImage,
  onTogglePlaceholderUrlInput,
  onSaveSiteSettings,
  onDiscardSiteSettings,
  onToggleStorefront,
}: GeneralSettingsTabProps) {
  const immediateSaving = Object.values(fieldSaveStates).some((state) => state === 'saving' || state === 'checking');
  const fieldUnavailable = (field: ImmediateField) => ['saving', 'checking', 'uncertain'].includes(fieldSaveStates[field] || '');
  const saveFeedback = (field: ImmediateField, label: string) => (
    <div className="mt-1 text-sm text-gray-700">
      <p role="status">{fieldSaveStates[field] === 'saving' ? `${label}: Saving…` : fieldSaveStates[field] === 'saved' ? `${label}: Saved` : fieldSaveStates[field] === 'checking' ? `${label}: Save not confirmed. Checking saved value…` : fieldSaveStates[field] === 'checked' ? `${label}: Save was not confirmed. Current saved value loaded; review before changing it again.` : fieldSaveStates[field] === 'uncertain' ? `${label}: Save outcome unknown. Check the saved value before changing it again.` : 'Saves immediately.'}</p>
      {fieldSaveStates[field] === 'uncertain' && <Button type="button" disabled={saving} onClick={() => onCheckSavedField(field)} variant="ghost">Check saved {label}</Button>}
    </div>
  );
  const missingOriginFields = getMissingOriginFields(settings.shipping_origin_address);
  const isDefaultPlaceholder =
    !settings.placeholder_image_url || settings.placeholder_image_url === DEFAULT_PLACEHOLDER_IMAGE;

  return (
    <div className="space-y-6">
      {/* Announcement Banner Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Announcement Banner</h2>
          <p className="text-sm text-gray-500 mt-1">Display a banner at the top of every page. Banner changes apply when you select Save changes.</p>
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
            <Switch
              type="button"
                            aria-label="Enable Banner"
              aria-checked={settings.announcement_enabled}
              onClick={() => onUpdateSettings({ announcement_enabled: !settings.announcement_enabled })}
            ></Switch>
          </div>

          {/* Banner Text */}
          <div>
            <Field label="Banner Message">
            <Input
              type="text"
              id="announcement_text"
              value={settings.announcement_text || ''}
              onChange={(e) => onUpdateSettings({ announcement_text: e.target.value })}
              placeholder="Enter your announcement message..."
            /></Field>
          </div>

          {/* Style Selector */}
          <div>
            <Field label="Banner Style">
            <Select
              id="announcement_style"
              value={settings.announcement_style || 'gold'}
              onChange={(e) => onUpdateSettings({ announcement_style: e.target.value })}
            >
              <option value="gold">Gold (Default)</option>
              <option value="info">Info (Blue)</option>
              <option value="success">Success (Green)</option>
              <option value="warning">Warning (Amber)</option>
              <option value="danger">Urgent (Red)</option>
            </Select></Field>
          </div>

          {/* Preview */}
          {settings.announcement_text?.trim() && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
              <div
                className="relative flex items-center justify-center px-10 py-2 rounded-lg shadow-sm"
                style={{ backgroundColor: ANNOUNCEMENT_STYLE_HEX[settings.announcement_style] ?? ANNOUNCEMENT_STYLE_HEX.gold }}
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
          <p className="text-sm text-gray-500 mt-1">Payments are read-only. Email changes save immediately.</p>
        </div>
        <div className="p-6 space-y-6">

        <PaymentStatusPanel />

        {/* Customer Emails Toggles - Per Order Type */}
        <div className="border-b border-gray-200 pb-4 mb-4">
          <h3 className="font-medium text-gray-900 mb-1">Customer Confirmation Emails</h3>
          <p className="text-sm text-gray-600 mb-4">
            Saves immediately. Configure which order types send confirmation emails to customers.
            Admin notifications are always sent regardless of these settings.
          </p>

          {/* Retail Orders Toggle */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Retail Orders</p>
              <p className="text-sm text-gray-500">Online store purchases</p>
              {saveFeedback('send_retail_emails', 'Retail order emails')}
            </div>
            <Switch
              type="button"
                            aria-label="Retail order emails"
              aria-checked={settings.send_retail_emails}
              onClick={() => onToggleEmailSetting('send_retail_emails')}
              disabled={saving || fieldUnavailable('send_retail_emails')}
            ></Switch>
          </div>

          {/* Wholesale Orders Toggle */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-gray-900">Wholesale Orders</p>
              <p className="text-sm text-gray-500">Wholesale orders</p>
              {saveFeedback('send_wholesale_emails', 'Wholesale order emails')}
            </div>
            <Switch
              type="button"
                            aria-label="Wholesale order emails"
              aria-checked={settings.send_wholesale_emails}
              onClick={() => onToggleEmailSetting('send_wholesale_emails')}
              disabled={saving || fieldUnavailable('send_wholesale_emails')}
            ></Switch>
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
        </div>
      </div>

      {/* Storefronts Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Storefront navigation</h2>
          <p className="text-sm text-gray-500 mt-1">Saves immediately. Enable a storefront to show its menu and allow customers to browse its products. Disabled storefront links redirect to the available menu. Cookies stay off for launch.</p>
        </div>
        <div className="p-6 space-y-1">
          {([
            { field: 'enable_storefront_three_squares' as const, label: 'Three Squares', desc: 'Daily comfort food and local favorites' },
            { field: 'enable_storefront_latte_stone' as const, label: 'Latte Stone Cookies', desc: 'Artisan shortbread cookies' },
            { field: 'enable_storefront_catering' as const, label: 'Catering', desc: 'Party trays and catering packages' },
          ]).map(({ field, label, desc }) => (
            <div key={field} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div>
                <p className="font-medium text-gray-900">{label}</p>
                <p className="text-sm text-gray-500">{desc}</p>
                {saveFeedback(field, `${label} storefront`)}
              </div>
              <Switch
                type="button"
                aria-label={`Enable ${label} storefront`}
                                aria-checked={settings[field]}
                onClick={() => onToggleStorefront(field)}
                disabled={saving || fieldUnavailable(field)}
              ></Switch>
            </div>
          ))}
        </div>
      </div>

      <section aria-labelledby="catering-ordering-title" className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 id="catering-ordering-title" className="text-lg font-semibold text-gray-900">Catering online ordering</h2>
        <p className="mt-2 text-sm text-gray-700">Off by default. Customers can browse catering items and submit an inquiry. Enable only when the menu is ready for direct online orders. This does not add minimum quantities, lead times or capacity rules.</p>
        <CheckField type="checkbox" role="switch" checked={settings.enable_catering_online_ordering === true} disabled={saving || fieldUnavailable('enable_catering_online_ordering')} onChange={() => onToggleStorefront('enable_catering_online_ordering')}>

          <span>Allow catering online orders</span>
        </CheckField>
        <p role="status" className="mt-2 text-sm text-gray-700">{fieldSaveStates.enable_catering_online_ordering === 'checking' || fieldSaveStates.enable_catering_online_ordering === 'uncertain' ? 'Saved ordering status is unconfirmed.' : settings.enable_catering_online_ordering ? 'Online orders enabled. Saves immediately.' : 'Inquiry only. Saves immediately.'}</p>
        {saveFeedback('enable_catering_online_ordering', 'Catering online ordering')}
      </section>

      {/* Store Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Store Information</h2>
          <p className="text-sm text-gray-500 mt-1">Save changes when finished</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Store Name */}
          <div>
            <Field label="Store Name">
            <Input
              type="text"
              id="store_name"
              value={settings.store_name}
              onChange={(e) => onUpdateSettings({ store_name: e.target.value })}
              required
            /></Field>
          </div>

          {/* Store Email */}
          <div>
            <Field label="Store Email">
            <Input
              type="email"
              id="store_email"
              value={settings.store_email}
              onChange={(e) => onUpdateSettings({ store_email: e.target.value })}
              required
            /></Field>
            <p className="mt-1 text-sm text-gray-500">
              Used for order notifications and customer communications
            </p>
          </div>

          {/* Store Phone */}
          <div>
            <Field label="Store Phone">
            <Input
              type="tel"
              id="store_phone"
              value={settings.store_phone}
              onChange={(e) => onUpdateSettings({ store_phone: e.target.value })}
              required
            /></Field>
          </div>

          {/* Placeholder Image */}
          <div>
            <p className="text-sm font-semibold text-gray-700">
              Product Placeholder Image
            </p>
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
                <FileButton accept="image/*" onChange={onPlaceholderFileChange} disabled={saving || placeholderUploading}>
                    {placeholderUploading ? 'Uploading...' : 'Upload Custom Placeholder'}
                  </FileButton>
                {!isDefaultPlaceholder && (
                  <Button
                    type="button"
                    onClick={() => onUpdatePlaceholderImage(DEFAULT_PLACEHOLDER_IMAGE)}
                    disabled={saving || placeholderUploading}
                    variant="secondary"
                  >
                    Reset to default logo
                  </Button>
                )}
                <Button
                  type="button"
                  aria-expanded={showPlaceholderUrlInput} onClick={onTogglePlaceholderUrlInput}
                  variant="ghost"
                >
                  {showPlaceholderUrlInput ? 'Hide custom URL' : 'Use a custom URL instead'}
                </Button>
              </div>
            </div>
            {showPlaceholderUrlInput && (
              <div className="mt-3">
                <Field label="Custom placeholder image URL"><Input
                  type="text"
                  id="placeholder_image_url"
                  value={isDefaultPlaceholder ? '' : settings.placeholder_image_url || ''}
                  onChange={(e) => onUpdateSettings({ placeholder_image_url: e.target.value })}
                  placeholder="https://... or /images/..."
                /></Field>
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
                <Field label="Company Name">
                <Input
                  type="text"
                  id="company"
                  value={settings.shipping_origin_address.company}
                  onChange={(e) => onUpdateShippingAddress({ company: e.target.value })}
                  required
                /></Field>
              </div>

              <div>
                <Field label="Street Address">
                <Input
                  type="text"
                  id="street1"
                  value={settings.shipping_origin_address.street1}
                  onChange={(e) => onUpdateShippingAddress({ street1: e.target.value })}
                  required
                /></Field>
              </div>

              <div>
                <Field label="Street Address Line 2 (Optional)">
                <Input
                  type="text"
                  id="street2"
                  value={settings.shipping_origin_address.street2 || ''}
                  onChange={(e) => onUpdateShippingAddress({ street2: e.target.value })}
                /></Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Field label="City">
                  <Input
                    type="text"
                    id="city"
                    value={settings.shipping_origin_address.city}
                    onChange={(e) => onUpdateShippingAddress({ city: e.target.value })}
                    required
                  /></Field>
                </div>

                <div>
                  <Field label="State">
                  <Input
                    type="text"
                    id="state"
                    value={settings.shipping_origin_address.state}
                    onChange={(e) => onUpdateShippingAddress({ state: e.target.value })}
                    required
                  /></Field>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Field label="ZIP Code">
                  <Input
                    type="text"
                    id="zip"
                    value={settings.shipping_origin_address.zip}
                    onChange={(e) => onUpdateShippingAddress({ zip: e.target.value })}
                    required
                  /></Field>
                </div>

                <div>
                  <Field label="Country">
                  <Input
                    type="text"
                    id="country"
                    value={settings.shipping_origin_address.country}
                    onChange={(e) => onUpdateShippingAddress({ country: e.target.value })}
                    required
                  /></Field>
                </div>
              </div>

              <div>
                <Field label="Shipping Phone">
                <Input
                  type="tel"
                  id="address_phone"
                  value={settings.shipping_origin_address.phone}
                  onChange={(e) => onUpdateShippingAddress({ phone: e.target.value })}
                  required
                /></Field>
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
              <Button
                type="button"
                onClick={onDiscardSiteSettings}
                disabled={saving || immediateSaving}
                variant="secondary"
              >
                Discard
              </Button>
              <Button
                type="button"
                onClick={onSaveSiteSettings}
                loading={saving} disabled={immediateSaving}
                variant="primary"
              >
                Save changes
              </Button>
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
                        <StatusBadge tone={section.active ? 'success' : 'inactive'}>
                          {section.active ? 'Active' : 'Hidden'}
                        </StatusBadge>
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
                      <Button
                        onClick={() => onToggleSectionActive(section)}
                        variant="secondary"
                      >
                        {section.active ? 'Hide' : 'Show'}
                      </Button>
                      <Button
                        onClick={() => onSetEditingSection(section)}
                        variant="secondary"
                      >
                        Edit
                      </Button>
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
        <Button
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
        >
          View Homepage
        </Button>
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
    } catch (err: any) {
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
          <Field label="Title">
          <Input
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Enter section title"
          /></Field>
        </div>

        {/* Subtitle */}
        <div>
          <Field label="Subtitle">
          <Textarea
            value={formData.subtitle || ''}
            onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
            rows={2}
            placeholder="Enter subtitle or description"
          /></Field>
        </div>

        {/* Hero-only settings */}
        {formData.section_type === 'hero' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Field label="Badge Text">
              <Input
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
                placeholder={DEFAULT_HERO_BADGE_TEXT}
              /></Field>
            </div>
            <div>
              <Field label="Secondary Button Text">
              <Input
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
                placeholder={DEFAULT_HERO_SECONDARY_TEXT}
              /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Secondary Button Link">
              <Input
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
                placeholder={DEFAULT_HERO_SECONDARY_LINK}
              /></Field>
              <p className="mt-1 text-xs text-gray-500">Example: /collections</p>
            </div>
          </div>
        )}

        {/* Image - Show different field based on section type */}
        {formData.section_type === 'hero' ? (
          // Hero sections use background_image_url
          <div>
            <p className="text-sm font-semibold text-gray-700">Background Image</p>
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
                <FileButton accept="image/*" onChange={(e) => handleFileChange(e, 'background_image_url')} disabled={saving || imageUploading}>
                    {imageUploading ? 'Uploading...' : 'Upload New Image'}
                  </FileButton>
                {!isDefaultBackground && defaultBackgroundUrl && (
                  <Button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, background_image_url: defaultBackgroundUrl }))}
                    variant="secondary"
                  >
                    Reset to default image
                  </Button>
                )}
                <Button
                  type="button"
                  aria-expanded={showBackgroundUrlInput} onClick={() => setShowBackgroundUrlInput((prev) => !prev)}
                  variant="ghost"
                >
                  {showBackgroundUrlInput ? 'Hide custom URL' : 'Use a custom URL instead'}
                </Button>
              </div>
            </div>
            {showBackgroundUrlInput && (
              <div className="mt-3">
                <Field label="Custom background image URL"><Input
                  type="text"
                  value={formData.background_image_url || ''}
                  onChange={(e) => setFormData({ ...formData, background_image_url: e.target.value })}
                  placeholder="https://... or /images/..."
                /></Field>
                <p className="mt-1 text-xs text-gray-500">Paste a public image URL.</p>
              </div>
            )}
          </div>
        ) : (
          // Category cards and other sections use image_url
          <div>
            <p className="text-sm font-semibold text-gray-700">Card Image</p>
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
                <FileButton accept="image/*" onChange={(e) => handleFileChange(e, 'image_url')} disabled={saving || imageUploading}>
                    {imageUploading ? 'Uploading...' : 'Upload New Image'}
                  </FileButton>
                {!isDefaultImage && defaultImageUrl && (
                  <Button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, image_url: defaultImageUrl }))}
                    variant="secondary"
                  >
                    Reset to default image
                  </Button>
                )}
                <Button
                  type="button"
                  aria-expanded={showImageUrlInput} onClick={() => setShowImageUrlInput((prev) => !prev)}
                  variant="ghost"
                >
                  {showImageUrlInput ? 'Hide custom URL' : 'Use a custom URL instead'}
                </Button>
              </div>
            </div>
            {showImageUrlInput && (
              <div className="mt-3">
                <Field label="Custom card image URL"><Input
                  type="text"
                  value={formData.image_url || ''}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://... or /images/..."
                /></Field>
                <p className="mt-1 text-xs text-gray-500">Paste a public image URL.</p>
              </div>
            )}
          </div>
        )}

        {/* Button */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Field label="Button Text">
            <Input
              type="text"
              value={formData.button_text || ''}
              onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
              placeholder="Shop Now"
            /></Field>
          </div>
          <div>
            <Field label="Link Type">
            <Select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as 'collection' | 'page' | 'custom')}
            >
              <option value="page">Page</option>
              <option value="collection">Collection</option>
              <option value="custom">Custom URL</option>
            </Select></Field>
            {!isDefaultLink && defaultButtonLink && (
              <Button
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
                variant="secondary" className="mt-2"
              >
                Reset to default link
              </Button>
            )}
          </div>
        </div>

        {linkType === 'collection' && (
          <div>
            <Field label="Collection">
            <Select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
            >
              <option value="">Select a collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.slug}>
                  {collection.name}
                </option>
              ))}
            </Select></Field>
            {!selectedCollectionExists && (
              <p className="mt-1 text-xs text-amber-600">
                This collection no longer exists. Choose a new one or reset to default.
              </p>
            )}
          </div>
        )}

        {linkType === 'page' && (
          <div>
            <Field label="Page">
            <Select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
            >
              <option value="/products">Shop</option>
              <option value="/collections">Collections</option>
              <option value="/about">Our Story</option>
              <option value="/contact">Contact</option>
              <option value="/shipping-info">Shipping Info</option>
              <option value="/returns">Returns</option>
            </Select></Field>
          </div>
        )}

        {linkType === 'custom' && (
          <div>
            <Field label="Button Link">
            <Input
              type="text"
              value={formData.button_link || ''}
              onChange={(e) => setFormData({ ...formData, button_link: e.target.value })}
              placeholder="https://... or /products"
            /></Field>
            <p className="mt-1 text-xs text-gray-500">Use a full URL or a site path.</p>
          </div>
        )}

        {/* Phase 2: Position field will be re-added when Add Section is implemented */}

        {/* Active Toggle */}
        <CheckField type="checkbox" id="active" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })}>
            Active (visible on homepage)
          </CheckField>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <Button
            type="submit"
            loading={saving}
            variant="primary"
          >
            {section ? 'Save Changes' : 'Create Section'}
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            variant="secondary"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
