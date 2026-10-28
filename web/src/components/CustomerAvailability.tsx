import { Button } from './ui/Button';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useBackendAvailability } from '../hooks/useBackendAvailability';

export function CustomerConnection({ children }: { children: ReactNode }) {
  const { status, config, retry } = useBackendAvailability();
  const hasCartItems = useCartStore(state => (state.cart?.items.length ?? 0) > 0);
  if (!config) return <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-6 py-12">
    <div role="status">
      <h1 className="text-2xl font-bold text-warm-900">{status === 'checking' ? 'Connecting to ordering…' : "We can’t reach ordering right now."}</h1>
      <p className="mt-3 text-warm-600">{status === 'checking' ? 'Please wait while we check the current menu and ordering status.' : `We’re retrying. ${hasCartItems ? 'Your cart is still here. Please check the connection and try again.' : 'Please try again in a moment.'}`}</p>
      <Button onClick={retry} variant="secondary" className="mt-6">Retry connection</Button>
    </div>
  </main>;
  return <>
    {status === 'unavailable' && <aside role="status" className="border-b border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-900">
      Having trouble connecting — retrying. Your loaded menu and cart are still here.
      <Button onClick={retry} variant="link" className="ml-3">Retry connection</Button>
    </aside>}
    {config.online_ordering_paused && <aside role="status" className="border-b border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-900">
      <strong>Online ordering is paused.</strong> {config.online_ordering_pause_message}
    </aside>}
    {children}
  </>;
}

export default function CustomerAvailability({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // This branch never subscribes to a public availability probe.
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/pos' || pathname.startsWith('/pos/')) return children;
  return <CustomerConnection>{children}</CustomerConnection>;
}
