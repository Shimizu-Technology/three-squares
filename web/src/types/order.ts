// Order-related types

export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface ShippingMethod {
  carrier: string;
  service: string;
  rate_cents: number;
  rate_id?: string;
  delivery_days?: number;
  delivery_date?: string;
}

export interface PaymentMethod {
  token?: string;
  type: string;
}

export interface CreateOrderRequest {
  customer_name?: string;
  email: string;
  phone: string;
  fulfillment_type: 'pickup' | 'shipping';
  location_id?: number;
  notes?: string;
  shipping_address: ShippingAddress;
  shipping_method: ShippingMethod;
  payment_method: PaymentMethod;
  payment_intent_id?: string;
  item_special_instructions?: Record<string, string>;
}

export interface OrderItem {
  id: number;
  product_variant_id: number;
  quantity: number;
  price_cents: number;
  product_name: string;
  variant_name?: string;
  variant_details: {
    /** Flexible variant options (e.g., { "Size": "M", "Color": "Red" }) */
    options?: Record<string, string>;
    /** @deprecated Use options instead. Legacy size field. */
    size?: string;
    /** @deprecated Use options instead. Legacy color field. */
    color?: string;
    sku: string;
  };
}

export interface Order {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  total_cents: number;
  total_formatted: string;
  item_count: number;
  created_at: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order: Order;
  message: string;
}

export interface AppConfig {
  app_mode: 'test' | 'production';
  stripe_enabled: boolean;
  stripe_publishable_key?: string;
  placeholder_image_url?: string | null;
  features: {
    payments: boolean;
    shipping: boolean;
  };
  store_info?: {
    name: string;
    email: string;
    phone: string;
  };
  announcement_enabled?: boolean;
  announcement_text?: string | null;
  announcement_style?: string;
}

