export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  base_price_cents: number;
  published: boolean;
  featured: boolean;
  archived: boolean;
  product_type: string;
  business_line: 'three_squares' | 'latte_stone_cookies' | 'bgpacific';
  primary_image_url: string | null;
  variant_count: number;
  total_stock: number;
  inventory_level: 'none' | 'product' | 'variant';
  product_stock_quantity: number | null;
  total_variant_stock: number | null;
  in_stock: boolean;
  actually_available: boolean;
  needs_attention?: boolean;
  import_notes?: string | null;
}

export interface ProductVariant {
  id: number;
  size: string;
  color: string;
  variant_name: string;
  display_name: string;
  sku: string;
  price_cents: number;
  stock_quantity: number;
  available: boolean;
  actually_available: boolean;
  low_stock: boolean;
}

export interface DetailedProduct extends Product {
  product_type: string;
  vendor: string;
  weight_oz: number;
  sku_prefix: string;
  variants: ProductVariant[];
  images: Array<{
    id: number;
    url: string;
    alt_text: string;
    primary: boolean;
    position: number;
  }>;
  collections: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
}

export const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export interface StockDisplay {
  value: string;
  color: string;
  tooltip: string;
  outOfStock: boolean;
}

export const getStockDisplay = (product: Product): StockDisplay => {
  if (product.inventory_level === 'none') {
    return { value: '--', color: 'text-gray-500', tooltip: 'No tracking', outOfStock: false };
  }
  if (product.inventory_level === 'product') {
    const stock = product.product_stock_quantity || 0;
    return {
      value: `${stock}`,
      color: stock > 10 ? 'text-green-600' : stock > 0 ? 'text-amber-600' : 'text-red-600',
      tooltip: 'Product-level tracking',
      outOfStock: stock === 0,
    };
  }
  if (product.inventory_level === 'variant') {
    const stock = product.total_variant_stock || 0;
    return {
      value: `${stock}`,
      color: stock > 10 ? 'text-green-600' : stock > 0 ? 'text-amber-600' : 'text-red-600',
      tooltip: 'Variant-level tracking (total of all variants)',
      outOfStock: stock === 0,
    };
  }
  return { value: '--', color: 'text-gray-500', tooltip: '', outOfStock: false };
};

export const getVariantStatus = (
  variant: ProductVariant,
  inventoryLevel: string,
): { label: string; className: string } => {
  // HAF-41 fix: Check stock first for variant-level inventory.
  // Newly created variants may have actually_available=false even with stock.
  if (inventoryLevel === 'variant') {
    if (variant.stock_quantity > 0) {
      return { label: 'Available', className: 'bg-green-100 text-green-800' };
    }
    return { label: 'Out of Stock', className: 'bg-red-100 text-red-800' };
  }

  // For non-variant inventory levels, use the available flags
  const isAvailable = variant.actually_available ?? variant.available ?? true;
  if (!isAvailable) {
    return { label: 'Disabled', className: 'bg-gray-100 text-gray-800' };
  }
  return { label: 'Available', className: 'bg-green-100 text-green-800' };
};
