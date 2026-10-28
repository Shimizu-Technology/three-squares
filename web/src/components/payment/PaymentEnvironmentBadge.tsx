import { StatusBadge } from '../ui/StatusBadge';
import { Notice } from '../ui/Notice';

export default function PaymentEnvironmentBadge({ environment, inline = false }: { environment?: string | null; inline?: boolean }) {
  if (!environment || environment === 'production') return null;
  const simulated = environment === 'simulated';
  const badge = <StatusBadge tone="attention">{simulated ? 'Simulated' : 'Sandbox'}</StatusBadge>;
  if (inline) return <span className="inline-flex flex-wrap items-center gap-2">{badge}<span className="text-sm">{simulated ? 'payments — no money moves' : 'payments'}</span></span>;
  return <div className="mt-2 space-y-2">{badge}<Notice tone="attention">{simulated ? 'Simulated payments — no money moves' : 'Sandbox payments'}</Notice></div>;
}
