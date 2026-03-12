// Shared types, formatters, and helpers for admin orders

export interface OrderItem {
  id: number;
  product_name: string;
  variant_name: string;
  product_sku: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  special_instructions?: string;
}

export interface Refund {
  id: number;
  amount_cents: number;
  amount_formatted: string;
  status: string;
  reason: string | null;
  stripe_refund_id: string | null;
  created_at: string;
  admin_user: string | null;
}

export interface Order {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  order_type: 'retail' | 'wholesale';
  business_line?: 'three_squares' | 'latte_stone' | 'catering';
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  subtotal_cents: number;
  shipping_cost_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_method: string;
  shipping_address_line1?: string;
  shipping_address_line2?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_country?: string;
  fulfillment_type?: string;
  location_id?: number;
  location_name?: string;
  tracking_number?: string;
  admin_notes?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  order_items: OrderItem[];
  item_count: number;
  refunds?: Refund[];
  total_refunded_cents?: number;
}

export const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-indigo-100 text-indigo-800',
  processing: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  shipped: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  shipped: 'Shipped',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const getStatusBadge = (status: string) =>
  STATUS_BADGES[status] || 'bg-gray-100 text-gray-800';

export const formatStatus = (status: string) =>
  STATUS_LABELS[status] || status;

export interface NextStatusAction {
  label: string;
  status: string;
  color: string;
}

export const getNextStatusAction = (order: Order): NextStatusAction | null => {
  if (order.order_type === 'retail') {
    switch (order.status) {
      case 'pending':
        return { label: 'Process', status: 'processing', color: 'bg-blue-600 hover:bg-blue-700' };
      case 'processing':
        return { label: 'Ship', status: 'shipped', color: 'bg-purple-600 hover:bg-purple-700' };
      case 'shipped':
        return { label: 'Delivered', status: 'delivered', color: 'bg-green-600 hover:bg-green-700' };
      default:
        return null;
    }
  } else {
    switch (order.status) {
      case 'pending':
        return { label: 'Confirm', status: 'confirmed', color: 'bg-indigo-600 hover:bg-indigo-700' };
      case 'confirmed':
      case 'processing':
        return { label: 'Ready', status: 'ready', color: 'bg-emerald-600 hover:bg-emerald-700' };
      case 'ready':
        return { label: 'Picked Up', status: 'picked_up', color: 'bg-green-600 hover:bg-green-700' };
      default:
        return null;
    }
  }
};
