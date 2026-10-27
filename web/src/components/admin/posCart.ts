export interface POSVariant {
  id: number;
  name: string;
  price_cents: number;
  price_formatted: string;
  sku: string;
  in_stock: boolean;
  stock_quantity: number;
  inventory_pool_key?: string | null;
  available_quantity?: number | null;
}
export interface POSProduct {
  id: number;
  name: string;
  slug: string;
  product_type: string;
  location_available?: boolean;
  image_url: string | null;
  variants: POSVariant[];
}
export interface POSCategory { name: string; items: POSProduct[] }
export interface CartItem { cartId: string; product: POSProduct; variant: POSVariant; quantity: number }
export interface CartIssue { variantId: number; message: string }
const poolKey = (variant: POSVariant) => variant.inventory_pool_key || `variant:${variant.id}`;

/** Capacity is a menu snapshot; the server reserves and validates again on sale. */
export function remainingPOSCapacity(variant: POSVariant, cart: CartItem[]): number {
  if (!variant.in_stock) return 0;
  if (variant.available_quantity == null) return Infinity;
  const used = cart.filter(line => poolKey(line.variant) === poolKey(variant)).reduce((sum, line) => sum + line.quantity, 0);
  return Math.max(0, variant.available_quantity - used);
}

/** Retain unavailable rows for explicit recovery; use current menu prices for valid rows. */
export function reconcilePOSCart(cart: CartItem[], products: POSProduct[]) {
  const issues: CartIssue[] = [];
  const items = cart.map(line => {
    const product = products.find(candidate => candidate.id === line.product.id);
    const variant = product?.variants.find(candidate => candidate.id === line.variant.id);
    if (!product || !variant || !variant.in_stock) {
      issues.push({ variantId: line.variant.id, message: `${line.product.name} is unavailable at this location. Remove it or choose another location.` });
      return line;
    }
    return { ...line, product, variant };
  });
  for (const line of items) {
    if (issues.some(issue => issue.variantId === line.variant.id) || line.variant.available_quantity == null) continue;
    const used = items.filter(item => poolKey(item.variant) === poolKey(line.variant)).reduce((sum, item) => sum + item.quantity, 0);
    if (used > line.variant.available_quantity) issues.push({ variantId: line.variant.id, message: `${line.product.name}: only ${line.variant.available_quantity} available in the stock pool. Reduce the quantity or remove it.` });
  }
  return { items, issues };
}
