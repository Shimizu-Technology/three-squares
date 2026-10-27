import { useId } from 'react';
import type { PaymentReceiptFacts } from '../../types/paymentReceipt';
import PaymentEnvironmentBadge from './PaymentEnvironmentBadge';

export interface PaymentReceiptProps {
  receipt: PaymentReceiptFacts | null;
  onPrint?: () => void;
  orderReference?: string | null;
}
const dollars = (cents: number) => Number.isSafeInteger(cents)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) : 'Unavailable';
// Descriptive card facts must never become a path for printing a full card number.
const cardFact = (value?: string | null) => typeof value === 'string'
  ? value.slice(0, 160).replace(/(?:\d[ -]?){12,19}/g, '[redacted]') : '';
const emvFacts = [
  { key: '9F06', label: 'Application ID', valid: /^[a-f][a-f\d]{9,31}$/i },
  { key: '95', label: 'Terminal verification results', valid: /^[a-f\d]{10}$/i },
  { key: '9B', label: 'Transaction status information', valid: /^[a-f\d]{4}$/i },
  { key: 'application_label', label: 'Application label', valid: /^[a-z][a-z .-]{0,31}$/i },
  { key: 'authorization_response_code', label: 'Authorization response code', valid: /^[a-z\d]{2}$/i },
] as const;

/** A factual receipt, independent of order fulfillment and payment mutation. */
export default function PaymentReceipt({ receipt, onPrint, orderReference }: PaymentReceiptProps) {
  const heading = useId();
  if (!receipt) return null;
  const details = [
    ['Card', cardFact(receipt.card_logo)],
    ['Card ending', /^\d{4}$/.test(receipt.last4 ?? '') ? receipt.last4 : null],
    ['Entry mode', cardFact(receipt.entry_mode)], ['Approval number', cardFact(receipt.approval_number)],
    ['Payment type', cardFact(receipt.payment_type)], ['Account type', cardFact(receipt.account_type)],
    ['Network', cardFact(receipt.network_label)], ['Processor time', cardFact(receipt.processor_time)],
  ];
  const emv = emvFacts.flatMap(fact => {
    const value = receipt.emv?.[fact.key];
    return typeof value === 'string' && fact.valid.test(value) ? [[fact.label, value]] : [];
  });
  return <section aria-labelledby={heading} className="min-w-0 space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={heading} className="text-base font-semibold">Payment receipt</h2>
      {onPrint && <button type="button" onClick={onPrint} className="min-h-11 touch-manipulation rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium transition-none! active:transform-none! active:bg-gray-100 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-50 print:hidden">Reprint receipt</button>}
    </div>
    <PaymentEnvironmentBadge environment={receipt.environment} inline />
    <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-x-3 gap-y-2 [&>dd]:min-w-0 [&>dd]:text-right">
      <dt>Provider</dt><dd>{receipt.provider === 'worldpay' ? 'Worldpay' : 'Stripe'}</dd>
      <dt>Payment state</dt><dd className="font-semibold">{receipt.state}</dd>
      <dt>Amount</dt><dd className="tabular-nums">{dollars(receipt.amount_cents)}</dd>
      <dt>Refunded</dt><dd className="tabular-nums">{dollars(receipt.refunded_cents)}</dd>
      {(orderReference || receipt.order_number) && <><dt>Original order</dt><dd>{orderReference || receipt.order_number}</dd></>}
      <dt>Transaction reference</dt><dd>{receipt.transaction_id}</dd>
      <dt>Observed at</dt><dd>{receipt.observed_at}</dd>
      {receipt.lane_id && <><dt>Lane</dt><dd>{receipt.lane_id}</dd></>}
      {receipt.terminal_id && <><dt>Reader</dt><dd>{receipt.terminal_id}</dd></>}
      {details.filter(([, value]) => value).map(([label, value]) => <div key={label} className="contents"><dt>{label}</dt><dd className="min-w-0 text-right">{value}</dd></div>)}
      {emv.map(([label, value]) => <div key={label} className="contents"><dt>{label}</dt><dd className="min-w-0 text-right font-mono text-xs">{value}</dd></div>)}
    </dl>
  </section>;
}
