export default function PaymentEnvironmentBadge({ environment, inline = false }: { environment?: string | null; inline?: boolean }) {
  if (!environment || environment === 'production') return null;
  return <span className={inline
    ? 'inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-950'
    : 'mt-2 inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950'
  }>{environment === 'simulated' ? 'Simulated payments — no money moves' : 'Sandbox payments'}</span>;
}
