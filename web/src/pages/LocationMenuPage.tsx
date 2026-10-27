import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import api, { locationsApi, type Location } from '../services/api';
import type { Cart } from '../types/cart';
import { useLocationStore } from '../store/locationStore';
import { useCartStore } from '../store/cartStore';
import ProductsPage from './ProductsPage';

export default function LocationMenuPage() {
  const { locationSlug = '' } = useParams();
  const navigate = useNavigate();
  const { selectedLocation, setSelectedLocation } = useLocationStore();
  const clearCart = useCartStore((state) => state.clearCart);
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotFound(false);
    void Promise.all([
      locationsApi.getLocation(locationSlug),
      api.get<Cart>('/cart', { headers: { 'X-Session-ID': useCartStore.getState().sessionId } }),
    ]).then(([nextLocation, response]) => {
      if (cancelled) return;
      // Use a server snapshot before switching: carts are not persisted locally.
      useCartStore.setState({ cart: response.data });
      const current = useLocationStore.getState().selectedLocation;
      if (response.data.items.length === 0 || current?.id === nextLocation.id) setSelectedLocation(nextLocation);
      setLocation(nextLocation);
    }).catch((failure: unknown) => {
      if (cancelled) return;
      if (axios.isAxiosError(failure) && failure.response?.status === 404) setNotFound(true);
      else setError('We could not load this menu and check your cart. Please try again.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [locationSlug, retry, setSelectedLocation]);

  const switchLocation = async () => {
    if (!location) return;
    setSwitching(true);
    setError('');
    try {
      await clearCart();
      setSelectedLocation(location);
    } catch {
      setError('Unable to clear your cart. Your pickup location has not changed. Please try again.');
    } finally { setSwitching(false); }
  };

  if (loading) return <div role="status" className="px-6 py-20 text-center">Loading location menu…</div>;
  if (notFound) return <section className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
    <h1 className="text-2xl font-bold">Location not found</h1>
    <p>This location is unavailable. Choose an active pickup location to see its menu.</p>
    <Link className="text-tsPrimary underline" to="/locations">View locations</Link>
  </section>;
  if (!location) return <section className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
    <h1 className="text-2xl font-bold">Menu unavailable</h1><p role="alert">{error}</p>
    <button className="bg-tsPrimary text-white rounded-lg px-5 py-3" onClick={() => setRetry((value) => value + 1)}>Try again</button>
  </section>;
  if (selectedLocation?.id !== location.id) return <section className="max-w-xl mx-auto px-6 py-20 space-y-5">
    <h1 className="text-2xl font-bold">Switch pickup location?</h1>
    <p>This link opens the menu for <strong>{location.name}</strong>. Your cart contains items{selectedLocation ? ` for ${selectedLocation.name}` : ''}. Switching clears those items.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex flex-col sm:flex-row gap-3">
      <button disabled={switching} className="border rounded-lg px-5 py-3" onClick={() => navigate(selectedLocation ? `/menu/${encodeURIComponent(selectedLocation.slug)}` : '/products')}>Keep current cart</button>
      <button disabled={switching} className="bg-tsPrimary text-white rounded-lg px-5 py-3 disabled:opacity-50" onClick={() => void switchLocation()}>{switching ? 'Switching…' : 'Switch & Clear'}</button>
    </div>
  </section>;
  return <ProductsPage pickupLocation={location} />;
}
