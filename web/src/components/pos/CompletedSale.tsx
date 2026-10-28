import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { PaymentReceiptFacts } from '../../types/paymentReceipt';
import PaymentReceipt from '../payment/PaymentReceipt';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface CompletedSaleFacts {
  order_number: string;
  total_formatted: string;
  change_due_formatted?: string;
  cash_received_cents?: number;
  payment_receipt?: PaymentReceiptFacts | null;
}
export function CompletedSale({ order, onDismiss }: {order: CompletedSaleFacts; onDismiss: () => void}) {
  const region = useRef<HTMLElement>(null);
  useEffect(() => { region.current?.scrollIntoView({ block: 'nearest' }); }, [order.order_number]);
  return <section ref={region} tabIndex={-1} aria-label="Completed sale" className="mb-3 space-y-2 rounded-xl border border-green-200 bg-green-50 p-3">
    <div className="flex items-start gap-2">
      <Check aria-hidden="true" className="mt-2 h-5 w-5 shrink-0 text-green-800" />
      <div role="status" aria-atomic="true" className="min-w-0 flex-1 text-green-950">
        <p className="font-semibold text-green-950">Order {order.order_number} completed</p>
        <p className="text-sm text-green-950">{order.total_formatted}</p>
        {order.change_due_formatted && <p className="text-lg font-semibold text-green-950">Change: {order.change_due_formatted}</p>}
      </div>
      <IconButton aria-label="Dismiss completed sale" onClick={onDismiss}><X /></IconButton>
    </div>
    <details className="min-w-0">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">Receipt for {order.order_number}</summary>
      <div className="max-h-[35dvh] space-y-3 overflow-y-auto">
        {order.payment_receipt ? <PaymentReceipt receipt={order.payment_receipt} orderReference={order.order_number} onPrint={() => window.print()} /> :
          <div className="space-y-2 text-sm"><p>{order.change_due_formatted !== undefined ? 'Cash sale' : 'Sale'} · {order.order_number} · {order.total_formatted}</p>
            {order.cash_received_cents !== undefined && <p>Tendered: ${(order.cash_received_cents / 100).toFixed(2)}</p>}
            {order.change_due_formatted && <p>Change: {order.change_due_formatted}</p>}
            <Button variant="secondary" onClick={() => window.print()}>Reprint receipt</Button></div>}
      </div>
    </details>
  </section>;
}
