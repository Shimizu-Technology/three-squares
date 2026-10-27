import { useEffect, useState } from 'react';
import api from '../../../services/api';
import { useStaffAccess } from '../../admin/StaffAccess.tsx';
interface Terminal { id: number; label: string; location_id: number; environment: string; status: string; collection_ready?: boolean; attempt_id: string | null; order_number?: string }
export default function SimulatedTerminalPanel({ locationId, attemptId, terminalId, onSelect, getToken, onChange }: { locationId: number | null; attemptId: string | null; terminalId: number | null; onSelect: (id: number | null) => void; getToken: () => Promise<string | null>; onChange: () => Promise<void> }) {
  const { can } = useStaffAccess();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const selected = terminalId === null ? '' : String(terminalId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const token = await getToken();
        const response = await api.get<{terminals: Terminal[]}>('/admin/payment_terminals', {headers: {Authorization: `Bearer ${token}`}});
        if (active) setTerminals(response.data.terminals.filter(row => row.environment === 'simulated' && row.location_id === locationId));
      } catch { if (active) setError('Simulated readers are unavailable.'); }
      finally { if (active && attemptId) timer = setTimeout(() => { if (document.visibilityState === 'visible') void load(); }, 2500); }
    };
    const visible = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void load(); } };
    void load();
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [getToken, locationId, attemptId]);
  async function act(action: string) {
    if (!selected || (!attemptId && action !== 'reconnect') || busy) return;
    setBusy(true); setError('');
    try {
      const headers = {Authorization: `Bearer ${await getToken()}`};
      const path = `/admin/payment_terminals/${selected}`;
      const response = action === 'take'
        ? await api.post<Terminal>(`${path}/collect`, {attempt_id: attemptId}, {headers})
        : await api.post<Terminal>(`${path}/simulate`, {command: action, attempt_id: attemptId}, {headers});
      setTerminals(rows => rows.map(row => row.id === response.data.id ? response.data : row));
      if (['approve', 'decline', 'wrong_pin'].includes(action)) await onChange();
    } catch (failure) {
      setError((failure as {response?: {data?: {error?: string}}}).response?.data?.error || 'Reader response lost. Check the saved payment before collecting again.');
    } finally { setBusy(false); }
  }
  const terminal = terminals.find(row => String(row.id) === selected);
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="mt-4 w-full min-w-0 rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-950 [overflow-wrap:anywhere]">
    <summary className="min-h-11 font-bold cursor-pointer">Simulated payments — no money moves</summary>
    <label className="block">Simulated reader<select value={selected} disabled={!!attemptId || busy} onChange={event => onSelect(event.target.value ? Number(event.target.value) : null)} className="block w-full bg-white border rounded p-2 min-h-11 text-base">{terminals.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
    <p className="my-2" role="status">{terminal?.status.replaceAll('_', ' ') || 'No reader configured'}{terminal?.order_number ? ` · ${terminal.order_number}` : ''}</p>
    {!attemptId && <p className="mb-2 text-sm">Add items and press Card to save an order, then take payment here.</p>}
    <div className="grid grid-cols-2 gap-2">{[['take','Take card payment'],['tap','Tap card'],['approve','Approve'],['decline','Decline'],['wrong_pin','Enter wrong PIN'],['disconnect','Disconnect'],['reconnect','Reconnect'],['lose_response','Lose response']].filter(([value]) => can(value === 'take' ? 'payments.collect' : 'payments.simulate')).map(([value,label]) => <button type="button" key={value} disabled={busy || !selected || (value !== 'reconnect' && (!attemptId || (value !== 'take' && terminal?.attempt_id !== attemptId) || (['tap', 'approve', 'decline', 'wrong_pin', 'lose_response'].includes(value) && (!terminal?.collection_ready || !['waiting_for_card', 'card_inserted'].includes(terminal?.status || '')))))} className="min-h-11 rounded border border-amber-500 bg-white px-2 py-2 disabled:opacity-50" onClick={() => void act(value)}>{label}</button>)}</div>
    {error && <p role="alert" className="mt-3 text-sm break-words">{error}</p>}
  </details>;
}
