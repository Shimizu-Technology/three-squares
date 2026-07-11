import { CalendarClock, ChefHat, Mail, MapPin, Phone } from 'lucide-react';

const previewItems = [
  { title: 'Restaurant ordering', detail: 'Dine-in and takeout flows designed for repeat local customers.' },
  { title: 'Catering requests', detail: 'A guided path for platters, events, and larger group orders.' },
  { title: 'Multi-location operations', detail: 'One system for Three Squares and B&G Pacific workflows.' },
];

export default function PausedPreviewPage() {
  return (
    <main className="min-h-screen bg-warm text-warm-900">
      <header className="border-b border-warm-200 bg-white/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <img src="/images/three-squares-logo.svg" alt="Three Squares" className="h-10 w-auto max-w-[210px] sm:h-12 sm:max-w-none" />
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 sm:px-3 sm:text-xs"><span className="sm:hidden">Preview</span><span className="hidden sm:inline">Preview mode</span></span>
        </div>
      </header>

      <section className="relative overflow-hidden bg-warm-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.22),transparent_45%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-amber-200">
              <CalendarClock size={17} /> Online ordering is temporarily paused
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight !text-white sm:text-5xl lg:text-6xl">A better Three Squares ordering experience is being prepared.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 !text-warm-200">
              The online storefront is not accepting orders right now. The restaurant remains open—call or message the team directly for current menus, catering, and order availability.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="tel:+16716462652" className="btn-primary gap-2"><Phone size={18} /> Call Three Squares</a>
              <a href="https://wa.me/16718646656" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10"><Mail size={18} /> WhatsApp orders</a>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-3 shadow-2xl">
            <img src="/images/catering7.jpg" alt="Three Squares catering presentation" className="aspect-[4/3] w-full rounded-2xl object-cover" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="text-center">
          <ChefHat className="mx-auto text-tsPrimary" size={34} />
          <h2 className="mt-4 text-3xl font-bold">What the platform is built to support</h2>
          <p className="mx-auto mt-3 max-w-2xl text-warm-600">A preview of the experience that will return when online ordering is ready.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {previewItems.map((item) => (
            <article key={item.title} className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-warm-600">{item.detail}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-5 rounded-2xl border border-warm-200 bg-warm-100 p-6 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <MapPin className="shrink-0 text-tsPrimary" />
            <p><strong className="block">Visit the main location</strong><span className="text-sm text-warm-600">416 Chalan San Antonio, Tamuning, Guam</span></p>
          </div>
          <a href="mailto:sales@bgpacific.com?subject=Three%20Squares%20Online%20Ordering%20Updates" className="font-semibold text-tsPrimary hover:underline">Get ordering updates</a>
        </div>
      </section>

      <footer className="border-t border-warm-200 py-6 text-center text-xs text-warm-500">Built by <a href="https://shimizu-technology.com" className="font-semibold hover:underline">Shimizu Technology</a></footer>
    </main>
  );
}
