export type PaymentEnvironment = 'simulated' | 'sandbox' | 'production';
export type PaymentProvider = 'stripe' | 'worldpay';

/** Facts returned by the API; a receipt is not authority to mark an order paid. */
export interface PaymentReceiptFacts {
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  transaction_id: string;
  state: string;
  amount_cents: number;
  refunded_cents: number;
  observed_at: string;
  order_number?: string | null;
  lane_id?: string | null;
  terminal_id?: string | null;
  card_logo?: string | null;
  last4?: string | null;
  entry_mode?: string | null;
  approval_number?: string | null;
  payment_type?: string | null;
  account_type?: string | null;
  network_label?: string | null;
  processor_time?: string | null;
  emv?: Record<string, string> | null;
}
