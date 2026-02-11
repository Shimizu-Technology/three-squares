// Cart-related TypeScript interfaces

export interface ProductVariant {
  id: number;
  sku: string;
  display_name: string;
  price_cents: number;
  stock_quantity: number;
  in_stock: boolean;
  /** Flexible variant options (e.g., { "Size": "M", "Color": "Red", "Material": "Cotton" }) */
  options?: Record<string, string>;
  /** @deprecated Use options instead. Legacy size field for backward compatibility. */
  size?: string;
  /** @deprecated Use options instead. Legacy color field for backward compatibility. */
  color?: string;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  published: boolean;
  allow_pickup?: boolean;
  allow_shipping?: boolean;
  available_location_ids?: number[];
  primary_image_url?: string;
  inventory_level: 'none' | 'product' | 'variant';
  product_stock_quantity?: number;
}

export interface CartItemAvailability {
  available: boolean;
  quantity_exceeds_stock: boolean;
  available_quantity: number;
  max_available: number;
}

export interface CartItem {
  id: number;
  quantity: number;
  subtotal_cents: number;
  product_variant: ProductVariant;
  product: Product;
  availability: CartItemAvailability;
}

export interface Cart {
  items: CartItem[];
  subtotal_cents: number;
  item_count: number;
}

export interface CartValidationIssue {
  cart_item_id: number;
  type: 'unavailable' | 'out_of_stock' | 'quantity_reduced' | 'mixed_fulfillment' | 'location_required' | 'fulfillment_not_supported';
  message: string;
  item_name: string;
  available?: number;
  requested?: number;
  action: 'remove' | 'reduce' | 'review';
}

export interface CartValidation {
  valid: boolean;
  issues: CartValidationIssue[];
  cart_items: CartItem[];
}

