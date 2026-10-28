import { useId, type RefObject } from 'react';
import { X } from 'lucide-react';
import type { Reader } from '@stripe/terminal-js';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const name = (reader: Reader) => reader.label || reader.serial_number || reader.id || 'Registered reader';
export function ReaderPickerDialog({ readers, connected, busy, error, returnFocusRef, onClose, onConnect, onDisconnect, onDiscover }:
  { readers: Reader[]; connected: Reader | null; busy: boolean; error: string | null;
    returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void; onConnect: (reader: Reader) => void; onDisconnect: () => void; onDiscover: () => void }) {
  const title = useId();
  return <Dialog open labelledBy={title} dismissible={!busy} returnFocusRef={returnFocusRef}
    onOpenChange={open => { if (!open && !busy) onClose(); }} className="w-full max-w-md rounded-xl bg-white p-4 sm:p-6 flex flex-col min-h-0">
    <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
      <h2 id={title} className="text-xl font-semibold">Select Card Reader</h2>
      <IconButton aria-label="Close Select Card Reader" disabled={busy} onClick={onClose}><X /></IconButton>
    </div>
    <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]">
      {connected && <div className="space-y-2 rounded-lg border p-3"><p>Connected: {name(connected)}</p><Button variant="secondary" disabled={busy} onClick={onDisconnect}>Disconnect</Button></div>}
      {readers.length ? readers.map(reader => <div key={reader.id} className="space-y-1">
        <p className="text-sm font-semibold">{name(reader)}</p>
        <Button variant="secondary" className="w-full" aria-label={`Connect reader ${name(reader)}`} disabled={busy} onClick={() => onConnect(reader)}>Connect reader</Button>
        <p className="text-sm text-slate-600">{reader.device_type}</p>
      </div>) : <div className="space-y-3"><p>No readers found. Make sure the S700 is powered on and connected to WiFi.</p><Button variant="secondary" disabled={busy} onClick={onDiscover}>Scan again</Button></div>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  </Dialog>;
}
