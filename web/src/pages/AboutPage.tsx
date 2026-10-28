import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-warm-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[{ label: 'Home', path: '/' }, { label: 'About Us' }]} />
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-tsPrimary mb-4">Three Squares · Guam</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-warm-900">
            Good Food, Good Mood, Good Service
          </h1>
          <p className="mt-6 text-lg text-warm-700 leading-relaxed max-w-xl">
            Three Squares is a Guam comfort food restaurant and catering service, part of B&amp;G Pacific LLC. Food and the people sharing it are at the center of the story.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/products" size="lg">Explore the menu</Button>
            <Button to="/locations" variant="secondary" size="lg">Find a location</Button>
          </div>
        </div>
        <figure className="overflow-hidden rounded-2xl bg-warm-100">
          <img src="/images/staff1.jpeg" alt="Three Squares team member holding a tray of food" className="w-full max-h-[590px] object-cover object-center" loading="eager" />
        </figure>
      </section>

      <section className="bg-white py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-16 items-center">
          <div className="grid grid-cols-2 gap-3">
            <img src="/images/Loco_Moco.JPG" alt="Loco moco from the Three Squares menu" className="w-full aspect-[4/5] object-cover rounded-xl" loading="lazy" />
            <img src="/images/Bleu_Chz_Burger.jpg" alt="Bleu cheese burger from the Three Squares menu" className="w-full aspect-[4/5] object-cover rounded-xl mt-8" loading="lazy" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-tsPrimary mb-4">At the table</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight">Meals for today. Food for gatherings.</h2>
            <p className="mt-5 text-warm-700 leading-relaxed">Browse the restaurant menu for a meal, or tell us about an event through the catering inquiry. The team can discuss a quote after reviewing your details.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/products" variant="link">View the menu</Button>
              <Button to="/catering" variant="link">Ask about catering</Button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <h2 className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight">Two places in Tamuning</h2>
        <p className="mt-3 text-warm-700 max-w-2xl">Visit the Main restaurant on Chalan San Antonio or Three Squares inside Don Quijote. See each location's hours and menu before heading over.</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          <Link to="/menu/three-squares-main" className="block rounded-xl border border-warm-200 bg-white p-6 hover:border-tsPrimary focus-visible:outline-2 focus-visible:outline-tsPrimary">
            <h3 className="text-xl font-bold text-warm-900">Three Squares Main</h3>
            <p className="mt-2 text-warm-700">416 Chalan San Antonio, Tamuning</p>
            <span className="inline-block mt-5 font-semibold text-tsPrimary">View Main menu →</span>
          </Link>
          <Link to="/menu/three-squares-donki" className="block rounded-xl border border-warm-200 bg-white p-6 hover:border-tsPrimary focus-visible:outline-2 focus-visible:outline-tsPrimary">
            <h3 className="text-xl font-bold text-warm-900">Three Squares @ Donki</h3>
            <p className="mt-2 text-warm-700">Inside Don Quijote, Tamuning</p>
            <span className="inline-block mt-5 font-semibold text-tsPrimary">View Donki menu →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
