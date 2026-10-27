import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useBackendAvailability } from '../hooks/useBackendAvailability';

export function CustomerConnection({ children }: { children: ReactNode }) {
  const { status, config, retry } = useBackendAvailability();
  if (!config) return <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-6 py-12">
    <div role="status">
      <h1 className="text-2xl font-bold text-warm-900">{status === 'checking' ? 'Connecting to ordering…' : "We can’t reach ordering right now."}</h1>
      <p className="mt-3 text-warm-600">{status === 'checking' ? 'Please wait while we check the current menu and ordering status.' : 'We’re retrying. Your saved cart is still on this device. Please check the connection and try again.'}</p>
      <button type="button" onClick={retry} className="btn-secondary mt-5 min-h-11">Retry connection</button>
    </div>
  </main>;
  return <>
    {status === 'unavailable' && <aside role="status" className="border-b border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-900">
      Having trouble connecting — retrying. Your loaded menu and cart are still here.
      <button type="button" onClick={retry} className="ml-3 min-h-11 underline">Retry connection</button>
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
