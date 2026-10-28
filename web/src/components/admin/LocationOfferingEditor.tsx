import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { authGet, authPatch } from '../../services/authApi';
import { useStaffAccess } from './StaffAccess.tsx';
import LocalAvailabilityToggle from './LocalAvailabilityToggle';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { StatusBadge } from '../ui/StatusBadge';

interface OfferingLocation {
  id: number; name: string; slug: string; offered: boolean; available: boolean; can_manage_availability: boolean;
}
interface Offerings { product_id: number; locations: OfferingLocation[] }

/** Menu membership is separate from the daily flag; each operation saves immediately. */
export default function LocationOfferingEditor({ productId, productName }: { productId: string; productName: string }) {
  const { getToken } = useAuth();
  const access = useStaffAccess();
  const [data, setData] = useState<Offerings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const alive = useRef(false);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await authGet<{data: Offerings}>(`/admin/products/${encodeURIComponent(productId)}/offerings`, getToken, { timeout: 20000 });
      if (alive.current) setData(response.data.data);
    } catch { if (alive.current) setError('Couldn’t load pickup locations. Try again.'); }
    finally { if (alive.current) setLoading(false); }
  }, [getToken, productId]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [load]);
  const save = async (location: OfferingLocation) => {
    if (busy.current || !data) return;
    busy.current = true; setPending(location.id); setError(''); setSaved('');
    try {
      const response = await authPatch<{data: {product_id: number; location_id: number; offered: boolean; available: boolean}}>(
        `/admin/products/${encodeURIComponent(productId)}/offerings`, { offering: { location_id: location.id, offered: !location.offered } }, getToken, { timeout: 20000 });
      const result = response.data.data;
      if (result.product_id !== data.product_id || result.location_id !== location.id || typeof result.offered !== 'boolean' || typeof result.available !== 'boolean') throw new Error('Invalid offering response');
      if (alive.current) {
        setData(current => current && ({ ...current, locations: current.locations.map(row => row.id === location.id ? { ...row, offered: result.offered, available: result.available } : row) }));
        setSaved(`${productName} ${result.offered ? 'offered' : 'removed from the menu'} at ${location.name}.`);
      }
    } catch { if (alive.current) setError(`Couldn’t change the menu at ${location.name}. Try again.`); }
    finally { busy.current = false; if (alive.current) setPending(null); }
  };
  return <section aria-label="Offered at locations" className="my-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <div><h2 className="text-lg font-semibold text-slate-900">Pickup menus &amp; daily availability</h2>
      <p className="mt-1 text-sm text-slate-600">Offering an item puts it on a location’s menu. Marking it sold out keeps it on that menu for restoration. Changes save immediately.</p></div>
    {loading && <p role="status">Loading pickup locations…</p>}
    {error && <Notice tone="danger" role="alert">{error} {!data && <Button variant="secondary" loading={loading} onClick={() => void load()}>Retry</Button>}</Notice>}
    {saved && <p role="status" className="text-sm text-green-800">{saved}</p>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {data?.locations.map(location => <div key={location.id} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="break-words font-semibold">{location.name}</h3>
        <StatusBadge tone={location.offered ? 'info' : 'neutral'}>{location.offered ? 'Offered here' : 'Not offered here'}</StatusBadge>
        {access.can('catalog.offerings.manage') && <Button variant="secondary" loading={pending === location.id} disabled={pending !== null && pending !== location.id} onClick={() => void save(location)} className="w-full" aria-label={`${location.offered ? 'Remove' : 'Offer'} ${productName} ${location.offered ? 'from the menu at' : 'at'} ${location.name}`}>{location.offered ? 'Remove from menu' : 'Offer here'}</Button>}
        {location.offered && location.can_manage_availability && <LocalAvailabilityToggle productId={data.product_id} productName={productName} locationId={location.id} locationName={location.name} available={location.available} disabled={pending !== null}
          onSaved={(_, id, available) => setData(current => current && ({...current, locations: current.locations.map(row => row.id === id ? {...row, available} : row)}))} />}
        {location.offered && !location.can_manage_availability && <p className="text-sm text-slate-600">{location.available ? 'Available' : 'Sold out today'}</p>}
      </div>)}
    </div>
  </section>;
}
