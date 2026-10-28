import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from '../src/components/ui/Button';
import { IconButton } from '../src/components/ui/IconButton';
import { StatusBadge } from '../src/components/ui/StatusBadge';
import { NavigationLink } from '../src/components/ui/NavigationLink';
import { Notice } from '../src/components/ui/Notice';
import AdminRequestState from '../src/components/admin/AdminRequestState';
import RouteErrorBoundary from '../src/components/RouteErrorBoundary';
import '../src/index.css';

export function FailingContent({ fail }: { fail: boolean }) {
  if (fail) throw new Error('Fictional recoverable fixture error');
  return <p>Recovery fixture loaded</p>;
}
export function Fixture() {
  const [loading, setLoading] = useState(false), [retried, setRetried] = useState(false), [fail, setFail] = useState(false);
  return <main className="admin-scope public-site p-4 sm:p-6 space-y-6">
    <h1 className="text-2xl">Shared controls</h1>
    <p>Geometry, keyboard and recovery fixture. No payment or external service calls.</p>
    <section className="space-y-3" aria-label="Legacy comparison">
      <h2 className="text-xl">Before: retained legacy specimens</h2>
      <div className="flex flex-wrap gap-3"><button className="btn-primary">Reload page</button><button className="btn-secondary">Retry</button></div>
    </section>
    <section className="space-y-3" aria-label="Shared recipes">
      <h2 className="text-xl">After: shared geometry</h2>
      {(['sm','md','lg'] as ButtonSize[]).map(size => <div key={size} className="flex flex-wrap items-center gap-3">
        {(['primary','secondary','ghost','destructive','link'] as ButtonVariant[]).map(variant => <Button key={variant} size={size} variant={variant} data-geometry={`${size}-${variant}`} icon={<RefreshCw/>}>{variant}</Button>)}
        <IconButton size={size} aria-label={`Refresh ${size}`} data-geometry={`${size}-icon`}><RefreshCw/></IconButton>
      </div>)}
      <div className="flex flex-wrap gap-3">
        <Button data-testid="short-loading-subject" loading={loading}>I</Button>
        <Button data-testid="loading-subject" loading={loading} icon={<RefreshCw/>}>Save item</Button>
        <Button variant="secondary" onClick={() => setLoading(!loading)}>Toggle loading</Button>
        <Button disabled>Disabled action</Button>
        <Button href="#anchor-target" variant="link">Anchor destination</Button>
        <Button to="#router-target" variant="link">Router destination</Button>
        <Button href="#blocked" disabled>Disabled link</Button>
        <IconButton to="#icon-target" aria-label="Open linked target"><RefreshCw/></IconButton>
      </div>
    </section>
    <section className="bg-tsNavy p-6 space-y-4" aria-label="Dark surface actions">
      <div className="flex flex-wrap gap-4">
        <Button size="lg" surface="dark" data-dark-control="primary">View menu</Button>
        <Button size="lg" surface="dark" variant="secondary" data-dark-control="secondary">Ask about catering</Button>
      </div>
    </section>
    <section aria-label="Navigation links" className="flex flex-wrap gap-4">
      <NavigationLink to="#router-target">Navigate within app</NavigationLink>
      <NavigationLink href="#anchor-target">Navigate with anchor</NavigationLink>
    </section>
    <section className="space-y-3" aria-label="Status and notice">
      <div className="flex flex-wrap gap-2">{(['attention','info','success','neutral','danger','inactive'] as const).map(tone => <StatusBadge key={tone} tone={tone}>{tone}</StatusBadge>)}</div>
      <Notice tone="attention">Simulated payments — no money moves. This notice wraps without becoming a badge.</Notice>
    </section>
    <section className="space-y-3" aria-label="Adopted recovery controls">
      <h2 className="text-xl">Recovery controls</h2>
      <AdminRequestState resource="Example records" hasData loading={loading} error={!retried} onRetry={() => { setLoading(true); window.setTimeout(() => {setRetried(true);setLoading(false)}, 300); }}/>
      {retried && <p role="status">Example records recovered</p>}
      <Button onClick={() => setFail(true)} variant="secondary">Trigger recoverable error</Button>
      <RouteErrorBoundary><FailingContent fail={fail}/></RouteErrorBoundary>
    </section>
    <form onSubmit={event => {event.preventDefault(); (event.currentTarget.querySelector('output')!).textContent='Form submitted';}} className="flex flex-wrap items-center gap-3">
      <Button type="submit">Submit fixture</Button><output aria-live="polite"/>
    </form>
    <div id="anchor-target">Anchor target</div><div id="router-target">Router target</div><div id="icon-target">Icon target</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Fixture/></BrowserRouter>);
