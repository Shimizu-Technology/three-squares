import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { authPatch } from '../../services/authApi';

interface Props {
  productId: number;
  productName: string;
  locationId: number;
  locationName: string;
  available: boolean;
  disabled?: boolean;
  onSaved: (productId: number, locationId: number, available: boolean) => void;
}

/** Changes one counter's pickup flag, using the narrow scoped server operation. */
export default function LocalAvailabilityToggle({ productId, productName, locationId, locationName, available, disabled = false, onSaved }: Props) {
  const { getToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async () => {
    if (pending.current || disabled) return;
    pending.current = true; setSaving(true); setError('');
    try {
      const response = await authPatch<{ data: { product_id: number; location_id: number; available: boolean } }>(`/admin/products/${productId}/availability`, { availability: { location_id: locationId, available: !available } }, getToken, { timeout: 20000 });
      const result = response.data.data;
      if (result.product_id !== productId || result.location_id !== locationId || typeof result.available !== 'boolean') throw new Error('Invalid availability response');
      onSaved(productId, locationId, result.available);
    } catch {
      if (alive.current) setError(`Couldn’t change availability at ${locationName}. Try again.`);
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  };
  return <div className="space-y-2 whitespace-normal [overflow-wrap:anywhere]">
    <p role="status" className={`text-sm font-semibold ${available ? 'text-green-800' : 'text-amber-900'}`}>{available ? 'Available' : 'Sold out'} at {locationName}</p>
    <button type="button" aria-label={`${available ? 'Mark' : 'Restore'} ${productName} ${available ? 'sold out at' : 'at'} ${locationName}`} disabled={disabled || saving} onClick={() => void save()} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50">
      {saving ? 'Saving…' : `${available ? 'Mark sold out' : 'Restore'} at ${locationName}`}
    </button>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </div>;
}
