import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authDelete, authGet, authPost, authPut } from '../../services/authApi';
import api from '../../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface LocationStats {
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  orders_by_status: Record<string, number>;
}

interface LocationsResponse {
  data: Location[];
}

interface CollectionsResponse {
  data: Collection[];
}

type LocationStatus = 'active' | 'scheduled' | 'expired' | 'inactive';
type SortField = 'name' | 'status' | 'starts_at' | 'created_at';

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

// ─── Utility Functions ───────────────────────────────────────────────────────

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

function getLocationStatus(location: Location): LocationStatus {
  if (!location.active) return 'inactive';
  const now = new Date();
  if (location.starts_at && new Date(location.starts_at) > now) return 'scheduled';
  if (location.ends_at && new Date(location.ends_at) < now) return 'expired';
  return 'active';
}

function getStatusDisplay(status: LocationStatus): { label: string; dotClass: string; bgClass: string; textClass: string; borderClass: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', dotClass: 'bg-green-500', bgClass: 'bg-green-50', textClass: 'text-green-700', borderClass: 'border-green-200' };
    case 'scheduled':
      return { label: 'Scheduled', dotClass: 'bg-amber-500', bgClass: 'bg-amber-50', textClass: 'text-amber-700', borderClass: 'border-amber-200' };
    case 'expired':
      return { label: 'Expired', dotClass: 'bg-red-500', bgClass: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-200' };
    case 'inactive':
      return { label: 'Inactive', dotClass: 'bg-gray-400', bgClass: 'bg-gray-50', textClass: 'text-gray-600', borderClass: 'border-gray-200' };
  }
}

function getTimelineText(location: Location): string | null {
  if (location.location_type === 'permanent') return null;
  const now = new Date();

  if (location.starts_at) {
    const start = new Date(location.starts_at);
    if (start > now) {
      const diff = start.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (days > 0) return `Starts in ${days} day${days === 1 ? '' : 's'}`;
      if (hours > 0) return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`;
      return 'Starting soon';
    }
  }

  if (location.ends_at) {
    const end = new Date(location.ends_at);
    if (end > now) {
      const diff = end.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (days > 0) return `Active for ${days} more day${days === 1 ? '' : 's'}`;
      if (hours > 0) return `Active for ${hours} more hour${hours === 1 ? '' : 's'}`;
      return 'Ending soon';
    } else {
      const diff = now.getTime() - end.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (days > 0) return `Ended ${days} day${days === 1 ? '' : 's'} ago`;
      if (hours > 0) return `Ended ${hours} hour${hours === 1 ? '' : 's'} ago`;
      return 'Just ended';
    }
  }

  return null;
}

function isTemporary(type: string): boolean {
  return type === 'popup' || type === 'event';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

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

function StatusBadge({ status, locationType }: { status: LocationStatus; locationType: string }) {
  const display = getStatusDisplay(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${display.bgClass} ${display.textClass} border ${display.borderClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${display.dotClass}`} />
      {display.label}
      {status === 'active' && locationType !== 'permanent' && (
        <LocationTypeBadge type={locationType} />
      )}
    </span>
  );
}

// ─── Status Dashboard ────────────────────────────────────────────────────────

function StatusDashboard({
  locations,
  statusFilter,
  onFilterChange,
  onAutoDeactivate,
}: {
  locations: Location[];
  statusFilter: LocationStatus | 'all';
  onFilterChange: (status: LocationStatus | 'all') => void;
  onAutoDeactivate: () => void;
}) {
  const counts = useMemo(() => {
    const c = { active: 0, scheduled: 0, expired: 0, inactive: 0 };
    locations.forEach((l) => {
      c[getLocationStatus(l)]++;
    });
    return c;
  }, [locations]);

  const cards: { key: LocationStatus | 'all'; label: string; count: number; color: string; borderColor: string; textColor: string }[] = [
    { key: 'active', label: 'Active', count: counts.active, color: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700' },
    { key: 'scheduled', label: 'Scheduled', count: counts.scheduled, color: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700' },
    { key: 'expired', label: 'Expired', count: counts.expired, color: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' },
    { key: 'inactive', label: 'Inactive', count: counts.inactive, color: 'bg-gray-50', borderColor: 'border-gray-200', textColor: 'text-gray-600' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => onFilterChange(statusFilter === card.key ? 'all' : card.key)}
            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
              statusFilter === card.key
                ? `${card.color} ${card.borderColor} ring-2 ring-offset-1 ring-${card.key === 'active' ? 'green' : card.key === 'scheduled' ? 'amber' : card.key === 'expired' ? 'red' : 'gray'}-300`
                : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
          >
            <p className={`text-2xl font-bold ${card.textColor}`}>{card.count}</p>
            <p className="text-sm text-gray-600">{card.label}</p>
          </button>
        ))}
      </div>
      {counts.expired > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm text-red-700">
            {counts.expired} location{counts.expired !== 1 ? 's have' : ' has'} expired but {counts.expired !== 1 ? 'are' : 'is'} still active.
          </span>
          <button
            onClick={onAutoDeactivate}
            className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium"
          >
            Auto-Deactivate Expired
          </button>
        </div>
      )}
    </div>
  );
}

// ─── QR Code Modal ───────────────────────────────────────────────────────────

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

// ─── Customer Preview ────────────────────────────────────────────────────────

function LocationPreview({ formData, frontendUrl }: { formData: typeof emptyForm; frontendUrl: string }) {
  const menuUrl = formData.slug ? `${frontendUrl}/menu?location=${formData.slug}` : '';

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Customer Preview</p>
      <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-gray-900">{formData.name || 'Location Name'}</p>
          <LocationTypeBadge type={formData.location_type} />
        </div>
        {formData.address && <p className="text-sm text-gray-500">{formData.address}</p>}
        {formData.description && <p className="text-sm text-gray-400 mt-1">{formData.description}</p>}
        {isTemporary(formData.location_type) && formData.starts_at && (
          <p className="text-xs text-gray-400 mt-2">
            {formatDate(formData.starts_at)}
            {formData.ends_at && ` — ${formatDate(formData.ends_at)}`}
          </p>
        )}
      </div>
      {menuUrl && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Direct Menu URL</p>
          <p className="text-xs text-blue-600 font-mono break-all">{menuUrl}</p>
        </div>
      )}
    </div>
  );
}

// ─── Location Form ───────────────────────────────────────────────────────────

function LocationForm({
  formData,
  setFormData,
  onSubmit,
  submitting,
  submitLabel,
  cancelFn,
  collections,
  showPreview = false,
}: {
  formData: typeof emptyForm;
  setFormData: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  submitting: boolean;
  submitLabel: string;
  cancelFn?: () => void;
  collections: Collection[];
  showPreview?: boolean;
}) {
  const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;

  // Validation warnings
  const warnings: string[] = [];
  if (isTemporary(formData.location_type) && !formData.starts_at && !formData.ends_at) {
    warnings.push('Popup/event locations should have a date range set.');
  }
  if (formData.ends_at && new Date(formData.ends_at) < new Date()) {
    warnings.push('End date is in the past.');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            onChange={(e) => {
              const newType = e.target.value as 'permanent' | 'popup' | 'event';
              setFormData((prev) => ({
                ...prev,
                location_type: newType,
                // Default auto_deactivate ON for temporary types
                auto_deactivate: isTemporary(newType) ? true : prev.auto_deactivate,
              }));
            }}
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
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700 flex items-center gap-2">
              <span>⚠️</span> {w}
            </p>
          ))}
        </div>
      )}

      {/* Preview */}
      {showPreview && formData.name && <LocationPreview formData={formData} frontendUrl={frontendUrl} />}

      <div className="flex gap-2">
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
}

// ─── Location Card ───────────────────────────────────────────────────────────

function LocationCard({
  location,
  stats,
  savingId,
  deletingId,
  generatingQrId,
  duplicatingId,
  onToggleActive,
  onGenerateQr,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  location: Location;
  stats: LocationStats | null;
  savingId: number | null;
  deletingId: number | null;
  generatingQrId: number | null;
  duplicatingId: number | null;
  onToggleActive: (l: Location) => void;
  onGenerateQr: (l: Location) => void;
  onEdit: (l: Location) => void;
  onDelete: (l: Location) => void;
  onDuplicate: (l: Location) => void;
}) {
  const status = getLocationStatus(location);
  const timeline = getTimelineText(location);

  return (
    <div className="px-6 py-4">
      <div className="flex flex-col gap-3">
        {/* Top row: info + status */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900">{location.name}</p>
              <StatusBadge status={status} locationType={location.location_type} />
              {status !== 'active' && <LocationTypeBadge type={location.location_type} />}
            </div>
            <p className="text-sm text-gray-500">{location.slug}</p>
            {location.address && <p className="text-sm text-gray-500">{location.address}</p>}
            {location.description && <p className="text-sm text-gray-400 mt-1">{location.description}</p>}

            {/* Timeline indicator */}
            {timeline && (
              <p className={`text-xs font-medium mt-1 ${
                status === 'expired' ? 'text-red-600' : status === 'scheduled' ? 'text-amber-600' : 'text-green-600'
              }`}>
                {timeline}
              </p>
            )}

            {/* Date range */}
            {isTemporary(location.location_type) && (location.starts_at || location.ends_at) && (
              <p className="text-xs text-gray-400 mt-1">
                {location.starts_at && `From ${formatDate(location.starts_at)}`}
                {location.starts_at && location.ends_at && ' — '}
                {location.ends_at && `Until ${formatDate(location.ends_at)}`}
                {location.auto_deactivate && (
                  <span className="ml-2 text-amber-600">(auto-deactivate)</span>
                )}
              </p>
            )}

            {/* Stats summary */}
            {stats && stats.total_orders > 0 && (
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>{stats.total_orders} order{stats.total_orders !== 1 ? 's' : ''}</span>
                <span>{formatCurrency(stats.total_revenue)} revenue</span>
                <span>Avg {formatCurrency(stats.average_order_value)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onToggleActive(location)}
              disabled={savingId === location.id}
              className={`px-3 py-1.5 text-sm rounded-lg border ${
                location.active
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700'
              } disabled:opacity-50`}
            >
              {savingId === location.id ? 'Saving...' : location.active ? 'Active' : 'Inactive'}
            </button>
            <button
              type="button"
              onClick={() => onGenerateQr(location)}
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
              onClick={() => onDuplicate(location)}
              disabled={duplicatingId === location.id}
              className="px-3 py-1.5 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {duplicatingId === location.id ? 'Duplicating...' : 'Duplicate'}
            </button>
            <a
              href={`/admin/orders?location_id=${location.id}`}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
            >
              View Orders
            </a>
            <button
              type="button"
              onClick={() => onEdit(location)}
              className="px-3 py-1.5 text-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-700"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(location)}
              disabled={deletingId === location.id}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 disabled:opacity-50"
            >
              {deletingId === location.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function AdminLocationsPage() {
  const { getToken } = useAuth();
  const [searchParams] = useSearchParams();
  const [locations, setLocations] = useState<Location[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [locationStats, setLocationStats] = useState<Record<number, LocationStats>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [qrModal, setQrModal] = useState<QrModalData | null>(null);
  const [generatingQrId, setGeneratingQrId] = useState<number | null>(null);

  // Filters & sorting
  const [statusFilter, setStatusFilter] = useState<LocationStatus | 'all'>(
    (searchParams.get('status') as LocationStatus) || 'all'
  );
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);

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
      // Collections are optional
    }
  }, [getToken]);

  const fetchAllStats = useCallback(async (locs: Location[]) => {
    const statsMap: Record<number, LocationStats> = {};
    // Fetch in parallel, don't block UI
    await Promise.allSettled(
      locs.map(async (loc) => {
        try {
          const response = await authGet<{ data: LocationStats }>(`/admin/locations/${loc.id}/stats`, getToken);
          statsMap[loc.id] = response.data.data;
        } catch {
          // Stats are optional
        }
      })
    );
    setLocationStats(statsMap);
  }, [getToken]);

  useEffect(() => {
    fetchLocations();
    fetchCollections();
  }, [fetchLocations, fetchCollections]);

  useEffect(() => {
    if (locations.length > 0) {
      fetchAllStats(locations);
    }
  }, [locations, fetchAllStats]);

  // Filtered & sorted locations
  const filteredLocations = useMemo(() => {
    let result = [...locations];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((l) => getLocationStatus(l) === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((l) => l.location_type === typeFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.slug.toLowerCase().includes(q) ||
          (l.address && l.address.toLowerCase().includes(q)) ||
          (l.description && l.description.toLowerCase().includes(q))
      );
    }

    // Sort
    const statusOrder: Record<LocationStatus, number> = { expired: 0, active: 1, scheduled: 2, inactive: 3 };
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'status':
          cmp = statusOrder[getLocationStatus(a)] - statusOrder[getLocationStatus(b)];
          break;
        case 'starts_at':
          cmp = (a.starts_at || '').localeCompare(b.starts_at || '');
          break;
        case 'created_at':
          cmp = a.id - b.id; // Approximation — IDs are sequential
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [locations, statusFilter, typeFilter, searchQuery, sortField, sortAsc]);

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
      setShowCreateForm(false);
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
    if (!window.confirm(`Delete location "${location.name}"? This cannot be undone.`)) return;
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

  const handleDuplicate = async (location: Location) => {
    try {
      setDuplicatingId(location.id);
      await authPost(`/admin/locations/${location.id}/duplicate`, {}, getToken);
      toast.success(`Duplicated "${location.name}"`);
      await fetchLocations();
    } catch (error) {
      console.error('Failed to duplicate location:', error);
      toast.error('Failed to duplicate location');
    } finally {
      setDuplicatingId(null);
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
    const expiredCount = locations.filter((l) => getLocationStatus(l) === 'expired').length;
    if (expiredCount === 0) {
      toast('No expired locations to deactivate');
      return;
    }
    if (!window.confirm(`Deactivate ${expiredCount} expired location${expiredCount !== 1 ? 's' : ''}?`)) return;
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
      await fetchLocations();
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      toast.error('Failed to generate QR code');
    } finally {
      setGeneratingQrId(null);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage pickup locations, pop-ups, and events.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark font-medium"
        >
          {showCreateForm ? 'Cancel' : '+ Add Location'}
        </button>
      </div>

      {/* Status Dashboard */}
      {!loading && locations.length > 0 && (
        <StatusDashboard
          locations={locations}
          statusFilter={statusFilter}
          onFilterChange={setStatusFilter}
          onAutoDeactivate={handleAutoDeactivate}
        />
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Location</h2>
          <LocationForm
            formData={form}
            setFormData={setForm}
            onSubmit={handleCreate}
            submitting={creating}
            submitLabel="Create Location"
            cancelFn={() => { setShowCreateForm(false); setForm(emptyForm); }}
            collections={collections}
            showPreview
          />
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Types</option>
            <option value="permanent">Permanent</option>
            <option value="popup">Pop-up</option>
            <option value="event">Event</option>
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Sort:</span>
            {(['name', 'status', 'starts_at', 'created_at'] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => handleSort(field)}
                className={`px-2 py-1 text-xs rounded ${
                  sortField === field
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {field === 'starts_at' ? 'Date' : field === 'created_at' ? 'Created' : field.charAt(0).toUpperCase() + field.slice(1)}
                {sortField === field && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Locations List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Locations
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({filteredLocations.length}{filteredLocations.length !== locations.length ? ` of ${locations.length}` : ''})
            </span>
          </h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : filteredLocations.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            {locations.length === 0 ? 'No locations found.' : 'No locations match your filters.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLocations.map((location) => {
              const isEditing = editingId === location.id;

              return (
                <div key={location.id}>
                  {isEditing ? (
                    <div className="px-6 py-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        Editing: {location.name}
                      </h3>
                      <LocationForm
                        formData={editForm}
                        setFormData={setEditForm}
                        onSubmit={handleUpdate}
                        submitting={saving}
                        submitLabel="Save Changes"
                        cancelFn={() => setEditingId(null)}
                        collections={collections}
                        showPreview
                      />
                    </div>
                  ) : (
                    <LocationCard
                      location={location}
                      stats={locationStats[location.id] || null}
                      savingId={savingId}
                      deletingId={deletingId}
                      generatingQrId={generatingQrId}
                      duplicatingId={duplicatingId}
                      onToggleActive={handleToggleActive}
                      onGenerateQr={handleGenerateQr}
                      onEdit={startEditing}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                    />
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
