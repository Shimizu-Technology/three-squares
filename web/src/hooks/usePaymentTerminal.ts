import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffAccess } from '../components/admin/StaffAccess.tsx';
import { deviceLocations } from '../components/admin/staffAccess.ts';
import { getTerminals, type PaymentTerminal } from '../services/terminal';
import type { GetTokenFn } from '../services/authApi';

export interface PaymentTerminalHookState {
  terminals: PaymentTerminal[];
  selected: PaymentTerminal | null;
  selectedId: number | null;
  select: (id: number | null) => void;
  reload: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function usePaymentTerminal({ locationId, getToken }: { locationId: number | null | undefined; getToken: GetTokenFn }): PaymentTerminalHookState {
  const access = useStaffAccess();
  const owner = access.user?.clerk_id ?? null;
  const allowed = !!locationId && deviceLocations(access.user).some(location => location.id === locationId) &&
    (access.can('pos.sell') || access.can('payments.collect') || access.can('payments.terminals.manage') || access.can('payments.terminals.discover'));
  const context = `${owner ?? ''}:${locationId ?? ''}:${allowed}`;
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ context: string; terminals: PaymentTerminal[]; loading: boolean; error: string | null }>({ context: '', terminals: [], loading: false, error: null });
  const [selection, setSelection] = useState<{ context: string; id: number | null }>({ context: '', id: null });

  const reload = useCallback(async () => {
    const request = ++sequence.current;
    controller.current?.abort();
    if (!allowed) return;
    const abort = new AbortController();
    controller.current = abort;
    setResult(previous => ({ context, terminals: previous.context === context ? previous.terminals : [], loading: true, error: null }));
    try {
      const token = await getToken();
      if (abort.signal.aborted || request !== sequence.current) return;
      if (!token) throw new Error('Missing token');
      const data = await getTerminals({ token, signal: abort.signal });
      if (abort.signal.aborted || request !== sequence.current) return;
      setResult({ context, terminals: data.terminals.filter(row => row.location_id === locationId), loading: false, error: null });
    } catch {
      if (!abort.signal.aborted && request === sequence.current) setResult(previous => ({
        context, terminals: previous.context === context ? previous.terminals : [], loading: false,
        error: 'Couldn’t load readers. Retry before starting a payment. Any saved payment still needs to be checked.',
      }));
    }
  }, [allowed, context, getToken, locationId]);

  useEffect(() => {
    void reload();
    return () => { sequence.current += 1; controller.current?.abort(); };
  }, [reload]);

  // A saved reader ID may be set before the list arrives; fetching never clears it.
  const select = useCallback((id: number | null) => setSelection({ context, id }), [context]);
  const terminals = allowed && result.context === context ? result.terminals : [];
  const selectedId = selection.context === context ? selection.id : null;
  return {
    terminals, selectedId, selected: terminals.find(row => row.id === selectedId) ?? null, select, reload,
    loading: allowed && (result.context !== context || result.loading),
    error: allowed && result.context === context ? result.error : !access.loading && !allowed ? 'Choose an authorized POS location to view readers.' : null,
  };
}
