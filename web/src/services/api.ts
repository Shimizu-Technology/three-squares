import axios from 'axios';
import type { CreateOrderRequest, CreateOrderResponse, AppConfig } from '../types/order';
import { API_BASE_URL } from '../config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const AUTH_INTERCEPTOR_ATTACHED = '__threeSquaresAuthInterceptorAttached';

const onAuthError = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof window !== 'undefined' && (status === 401 || status === 403)) {
    window.dispatchEvent(
      new CustomEvent('three-squares:auth-error', {
        detail: { status },
      })
    );
  }
  return Promise.reject(error);
};

const attachAuthErrorInterceptor = (instance: typeof axios | typeof api) => {
  const interceptorState = instance as typeof instance & { [AUTH_INTERCEPTOR_ATTACHED]?: boolean };
  if (interceptorState[AUTH_INTERCEPTOR_ATTACHED]) return;

  instance.interceptors.response.use((response) => response, onAuthError);
  interceptorState[AUTH_INTERCEPTOR_ATTACHED] = true;
};

attachAuthErrorInterceptor(api);
attachAuthErrorInterceptor(axios);

// Types
export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  base_price_cents: number;
  sale_price_cents?: number | null; // Sale price if on sale
  new_product?: boolean; // Whether to show "NEW" badge
  published?: boolean;
  featured: boolean;
  product_type: string;
  allow_pickup?: boolean;
  allow_shipping?: boolean;
  available_location_ids?: number[];
  track_inventory?: boolean;
  inventory_level?: 'none' | 'product' | 'variant';
  product_stock_quantity?: number;
  product_low_stock_threshold?: number;
  product_stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  product_low_stock?: boolean;
  in_stock: boolean;
  actually_available?: boolean; // Computed: respects published + inventory
  primary_image_url: string | null;  // Changed from image_url to match backend
  collections: Collection[];
  variant_count: number;
  total_stock?: number;
  created_at: string;
}

export interface ProductFull extends Product {
  vendor: string;
  weight_oz: number;
  variants: ProductVariant[];
  images: ProductImage[];
  meta_title: string;
  meta_description: string;
  updated_at: string;
}

export interface ProductVariant {
  id: number;
  // Flexible options (new system)
  options?: Record<string, string>;
  option_types?: string[];
  // Legacy fields (for backward compatibility)
  size: string;
  color: string;
  // Display
  display_name: string;
  sku: string;
  price_cents: number;
  in_stock: boolean;
  actually_available?: boolean; // Computed: respects available + stock
  stock_quantity: number;
  weight_oz: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt_text: string;
  position: number;
  primary: boolean;
}

export interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  thumbnail_url: string | null; // Added for collections landing page
  featured: boolean;
  product_count: number;
}

export interface Location {
  id: number;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  hours_json?: Record<string, string>;
}

export interface ProductsResponse {
  products: Product[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface CollectionsResponse {
  collections: Collection[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface CollectionDetailResponse {
  collection: Collection;
  products: Product[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

// API Functions
export const productsApi = {
  // Get all products
  getProducts: async (params?: {
    page?: number;
    per_page?: number;
    product_type?: string;
    collection?: string; // Changed to support slug
    featured?: boolean;
    search?: string;
    min_price?: number;
    max_price?: number;
    sort?: string; // Added sort parameter
    location_id?: number;
    business_line?: string;
  }): Promise<ProductsResponse> => {
    const response = await api.get('/products', { params });
    return response.data;
  },

  // Get single product
  getProduct: async (idOrSlug: string | number): Promise<ProductFull> => {
    const response = await api.get(`/products/${idOrSlug}`);
    return response.data;
  },
};

export const locationsApi = {
  getLocations: async (): Promise<{ locations: Location[] }> => {
    const response = await api.get('/locations');
    return response.data;
  },
};

// Collections API
export const collectionsApi = {
  // Get all collections with pagination and search
  getCollections: async (params?: {
    page?: number;
    per_page?: number;
    search?: string;
  }): Promise<CollectionsResponse> => {
    const response = await api.get('/collections', { params });
    return response.data;
  },

  // Get collection by slug with products
  getCollectionBySlug: async (
    slug: string,
    params?: {
      page?: number;
      per_page?: number;
      product_type?: string;
      search?: string;
    }
  ): Promise<CollectionDetailResponse> => {
    const response = await api.get(`/collections/${slug}`, { params });
    return response.data;
  },
};

// Homepage Sections types
export interface HomepageSection {
  id: number;
  section_type: 'hero' | 'category_card' | 'featured_products' | 'promo_banner' | 'text_block' | 'image_gallery';
  position: number;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  image_url: string | null;
  background_image_url: string | null;
  settings: Record<string, unknown>;
  active: boolean;
}

export interface HomepageSectionsResponse {
  sections: HomepageSection[];
  grouped: {
    hero?: HomepageSection[];
    category_card?: HomepageSection[];
    featured_products?: HomepageSection[];
    promo_banner?: HomepageSection[];
    text_block?: HomepageSection[];
    image_gallery?: HomepageSection[];
  };
}

// Homepage API
export const homepageApi = {
  // Get all active homepage sections
  getSections: async (): Promise<HomepageSectionsResponse> => {
    const response = await api.get('/homepage_sections');
    return response.data;
  },
};

// Config API
export const configApi = {
  // Get app configuration
  getConfig: async (): Promise<AppConfig> => {
    const response = await api.get('/config');
    return response.data;
  },
};

// Orders API
export const ordersApi = {
  // Create order
  createOrder: async (orderData: CreateOrderRequest, token?: string | null, sessionId?: string | null): Promise<CreateOrderResponse> => {
    const headers: Record<string, string> = {};
    // Always include both auth token and session ID if available
    // This allows the backend to merge session cart items to the user
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }
    
    const response = await api.post('/orders', { order: orderData }, { headers });
    return response.data;
  },
};

// Payment Intents API (Stripe)
export interface CreatePaymentIntentRequest {
  email: string;
  shipping_cost_cents: number;
  fulfillment_type: 'pickup' | 'shipping';
  location_id?: number;
}

export interface CreatePaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  amount_cents: number;
}

export const paymentIntentsApi = {
  create: async (
    data: CreatePaymentIntentRequest,
    token?: string | null,
    sessionId?: string | null
  ): Promise<CreatePaymentIntentResponse> => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }
    const response = await api.post('/payment_intents', data, { headers });
    return response.data;
  },
};

// Shipping API
export const shippingApi = {
  // Calculate shipping rates
  calculateRates: async (address: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  }, sessionId?: string | null, token?: string | null): Promise<{
    rates: Array<{
      carrier: string;
      service: string;
      rate_cents: number;
      rate_id?: string;
      delivery_days?: number;
      delivery_date?: string;
    }>;
    total_weight_oz: number;
  }> => {
    const headers: Record<string, string> = {};
    // Always include both auth token and session ID if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }
    
    const response = await api.post('/shipping/rates', { address }, { headers });
    return response.data;
  },
};

// ============================================
// ACAI CAKES API
// ============================================

export interface AcaiSettings {
  name: string;
  description: string;
  base_price_cents: number;
  formatted_price: string;
  image_url: string | null;
  pickup_location: string;
  pickup_instructions: string | null;
  pickup_phone: string;
  advance_hours: number;
  minimum_order_date: string;
  active: boolean;
  placard_enabled: boolean;
  placard_price_cents: number;
  toppings_info: string | null;
}

export interface AcaiCrustOption {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  formatted_price: string;
}

export interface AcaiPlacardOption {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  formatted_price: string;
}

export interface AcaiPickupWindow {
  id: number;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  display_name: string;
}

export interface AcaiConfigResponse {
  settings: AcaiSettings;
  crust_options: AcaiCrustOption[];
  placard_options: AcaiPlacardOption[];
  pickup_windows: AcaiPickupWindow[];
  ordering_enabled: boolean;
}

export interface AcaiAvailableDate {
  date: string;
  day_of_week: number;
  day_name: string;
  available_slots: number;
  fully_booked: boolean;
}

export interface AcaiAvailableDatesResponse {
  dates: AcaiAvailableDate[];
  minimum_date: string;
  maximum_date: string;
}

export interface AcaiTimeSlot {
  time: string;
  time_value: string;
  slot_string: string;
  slot_value: string;
  available: boolean;
  remaining: number;
}

export interface AcaiAvailableSlotsResponse {
  date: string;
  day_name: string;
  window: {
    start_time: string;
    end_time: string;
  };
  slots: AcaiTimeSlot[];
}

export interface AcaiOrderRequest {
  pickup_date: string;
  pickup_time: string;
  crust_option_id: number;
  name: string;
  email: string;
  phone: string;
  quantity?: number;
  include_placard?: boolean;
  placard_option_id?: number;
  placard_text?: string;
  notes?: string;
  payment_token?: string;
}

export interface AcaiOrderResponse {
  success: boolean;
  order: {
    id: number;
    order_number: string;
    status: string;
    payment_status: string;
    total_cents: number;
    formatted_total: string;
    pickup_date: string;
    pickup_time: string;
    crust_type: string;
    placard_text: string | null;
    pickup_location: string;
    pickup_phone: string;
  };
}

export const acaiApi = {
  // Get Acai configuration (settings, crust options, placard options, pickup windows)
  getConfig: async (): Promise<AcaiConfigResponse> => {
    const response = await api.get('/acai/config');
    return response.data;
  },

  // Get available dates for pickup
  getAvailableDates: async (days?: number): Promise<AcaiAvailableDatesResponse> => {
    const response = await api.get('/acai/available_dates', { params: { days } });
    return response.data;
  },

  // Get available time slots for a specific date
  getAvailableSlots: async (date: string): Promise<AcaiAvailableSlotsResponse> => {
    const response = await api.get('/acai/available_slots', { params: { date } });
    return response.data;
  },

  // Create an Acai order
  createOrder: async (orderData: AcaiOrderRequest, token?: string | null): Promise<AcaiOrderResponse> => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await api.post('/acai/orders', orderData, { headers });
    return response.data;
  },
};

// Helper to format price
export const formatPrice = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

export default api;

