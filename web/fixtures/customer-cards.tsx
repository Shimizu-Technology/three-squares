import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HomeCategoryCard } from "../src/components/ui/HomeCategoryCard";
import ProductCard from "../src/components/ProductCard";
import type { Product, CatalogPricing } from "../src/services/api";
import { CustomerCard } from "../src/components/ui/CustomerCard";
import OptimizedImage from "../src/components/ui/OptimizedImage";
import "../src/index.css";

const pricing: CatalogPricing = {
  unit_price_cents: 1295,
  compare_at_price_cents: null,
  purchasable: true,
  reason: null,
  price_varies: false,
  location_id: null,
};
const product: Product = {
  id: 1,
  name: "Fictional meal",
  slug: "fixture-meal",
  description: "",
  base_price_cents: 1295,
  featured: false,
  product_type: "single",
  in_stock: true,
  actually_available: true,
  primary_image_url: null,
  collections: [],
  variant_count: 1,
  created_at: "2026-01-01",
  pricing,
};
const cases: Array<Partial<Product>> = [
  { name: "Fictional short meal" },
  { name: "Fictional grilled salmon with garlic lemon butter, steamed rice and seasonal vegetables" },
  {
    name: "Fictional catering platter",
    pricing: {
      ...pricing,
      purchasable: false,
      unit_price_cents: null,
      reason: "This item now requires a catering inquiry",
    },
  },
  { name: "Fictional failed photo", primary_image_url: "/fixture-photo-does-not-exist.jpg", actually_available: false },
  {
    name: "Fictional sale meal",
    pricing: { ...pricing, unit_price_cents: 1195, compare_at_price_cents: 1495, price_varies: true },
  },
  { name: "Fictional side", product_type: "complimentary_with_meal", pricing: { ...pricing, unit_price_cents: 0 } },
];
cases.push(
  {name: 'Fictional large sale', pricing: {...pricing, unit_price_cents: 123456, compare_at_price_cents: 199999, price_varies: true}},
  {name: 'Fictional very large price', pricing: {...pricing, unit_price_cents: 123456789012, compare_at_price_cents: null}},
);
export function Fixture() {
  return (
    <main className="public-site p-4 space-y-6 max-w-7xl mx-auto">
      <h1>Customer card acceptance</h1>
      <section aria-label="Meal specimens" className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        {cases.map((item, index) => (
          <ProductCard key={index} product={{ ...product, ...item, id: index + 1, slug: `fixture-${index}` }} />
        ))}
      </section>
      <section aria-label="Collection specimens" className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {["Fictional seasonal menu", "Fictional menu with a longer name and missing photo"].map((name) => (
          <CustomerCard key={name} to="/collections/fixture" kind="collection">
            <div className="customer-card__media">
              <OptimizedImage src={null} alt={name} context="card" />
            </div>
            <div className="customer-card__body">
              <h2 className="customer-card__title">{name}</h2>
              <p className="mt-auto">Browse menu</p>
            </div>
          </CustomerCard>
        ))}
      </section>
      <section aria-label="Home category specimens" className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {(['feature', 'half', 'lead', 'standard'] as const).map(layout => <HomeCategoryCard key={layout} layout={layout} card={{title:`Fictional ${layout} menu`,subtitle:'Browse the fictional menu',button_text:'View fictional menu',button_link:'#home-category-destination',image_url:null}} />)}
      </section>
      <p id="home-category-destination">Fictional home destination</p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Fixture />
  </BrowserRouter>
);
