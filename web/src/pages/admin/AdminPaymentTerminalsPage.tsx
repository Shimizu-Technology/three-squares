import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { StaffAccessDenied, useStaffAccess, type StaffAccessUser, type StaffLocation } from '../../components/admin/StaffAccess.tsx';
import { deviceLocations } from '../../components/admin/staffAccess.ts';
import Dialog from '../../components/ui/Dialog';
import PaymentEnvironmentBadge from '../../components/payment/PaymentEnvironmentBadge';
import {
  createPaymentTerminal, getTerminals, pairPaymentTerminal, retirePaymentTerminal, updatePaymentTerminal,
  type AdministrationState, type NewTerminalPayload, type PaymentTerminal, type TerminalProfile,
} from '../../services/terminal';
import type { GetTokenFn } from '../../services/authApi';
import type { PaymentEnvironment, PaymentProvider } from '../../types/paymentReceipt';

const storageKey = 'tsq-pending-terminal-administration-v1';
const control = 'min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base disabled:opacity-60';
const button = 'min-h-11 touch-manipulation rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition-none! active:transform-none! disabled:cursor-not-allowed disabled:opacity-50 active:bg-gray-100 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-50';
const primary = `${button} border-tsPrimary bg-tsPrimary text-white active:bg-tsNavy [@media(hover:hover)_and_(pointer:fine)]:hover:bg-tsNavy`;
const states: AdministrationState[] = ['reserved', 'dispatching', 'unknown', 'succeeded', 'failed'];
interface DeviceSnapshot {
  label: string;
  location_id: number;
  lane_id: string;
  terminal_id: string;
  environment: PaymentEnvironment;
  provider: PaymentProvider;
  device_serial: string | null;
  device_model: string | null;
}
type Operation = { kind: 'create'; payload: NewTerminalPayload } | { kind: 'pair' | 'retire'; terminal_id: number };
type PendingOperation = Operation & { version: 1; owner_id: number; key: string; state: AdministrationState; device: DeviceSnapshot };
interface StoredOperation { pending: PendingOperation | null; blocked: boolean }
type Confirmation = { kind: 'operation'; operation: PendingOperation; saved: boolean } | { kind: 'edit'; terminal: PaymentTerminal };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;

/** Decode an explicit nonsecret allowlist. A malformed record blocks dispatch, never resets it. */
function readSaved(): StoredOperation {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { pending: null, blocked: false };
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || !positiveId(value.owner_id) || !text(value.key) ||
      !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value.key) ||
      !states.includes(value.state as AdministrationState) || !record(value.device)) throw new Error('Invalid saved administration');
    const source = value.device;
    if (!text(source.label) || !positiveId(source.location_id) || !text(source.lane_id) || !text(source.terminal_id) ||
      !['simulated', 'sandbox', 'production'].includes(String(source.environment)) || !['stripe', 'worldpay'].includes(String(source.provider))) throw new Error('Invalid reader');
    const device: DeviceSnapshot = {
      label: source.label, location_id: source.location_id, lane_id: source.lane_id, terminal_id: source.terminal_id,
      provider: source.provider as PaymentProvider, environment: source.environment as PaymentEnvironment,
      device_serial: typeof source.device_serial === 'string' ? source.device_serial.slice(0, 200) : null,
      device_model: typeof source.device_model === 'string' ? source.device_model.slice(0, 200) : null,
    };
    const common = { version: 1 as const, owner_id: value.owner_id, key: value.key, state: value.state as AdministrationState, device };
    if (value.kind === 'create' && record(value.payload)) {
      const payload = value.payload;
      if (!positiveId(payload.payment_profile_id) || !positiveId(payload.location_id) || !text(payload.label) || !text(payload.lane_id) || !text(payload.terminal_id) ||
        payload.location_id !== device.location_id || payload.label !== device.label || payload.lane_id !== device.lane_id || payload.terminal_id !== device.terminal_id) throw new Error('Invalid pairing');
      return { blocked: false, pending: { ...common, kind: 'create', payload: {
        payment_profile_id: payload.payment_profile_id, location_id: payload.location_id, label: payload.label,
        lane_id: payload.lane_id, terminal_id: payload.terminal_id,
      } } };
    }
    if ((value.kind === 'pair' || value.kind === 'retire') && positiveId(value.terminal_id)) {
      return { blocked: false, pending: { ...common, kind: value.kind, terminal_id: value.terminal_id } };
    }
    throw new Error('Invalid operation');
  } catch { return { pending: null, blocked: true }; }
}

function DeviceFacts({ device, locations }: { device: DeviceSnapshot; locations: StaffLocation[] }) {
  return <div className="min-w-0 space-y-1 text-sm [overflow-wrap:anywhere]">
    <p className="font-semibold text-gray-900">{device.label}</p>
    <p>Location: {locations.find(location => location.id === device.location_id)?.name ?? 'Unavailable location'} (#{device.location_id})</p>
    <p>Lane: {device.lane_id} · Reader: {device.terminal_id}</p>
    <p>Provider: {device.provider === 'worldpay' ? 'Worldpay' : 'Stripe'} · Environment: {device.environment}</p>
    <p>Device: {device.device_model || 'Model not verified'} · Serial: {device.device_serial || 'Not verified'}</p>
    <PaymentEnvironmentBadge environment={device.environment} inline />
  </div>;
}

/** This gate mounts no requester until central staff access authorizes management. */
export default function AdminPaymentTerminalsPage() {
  const access = useStaffAccess();
  const { getToken } = useAuth();
  if (access.loading) return <p role="status" className="p-6">Checking terminal management access…</p>;
  if (!access.user || !access.can('payments.terminals.manage')) return <StaffAccessDenied />;
  return <TerminalAdministration key={`${access.user.clerk_id}:${access.user.operational_scope}:${access.user.assigned_location_id}:${access.user.authorized_locations.map(location => location.id).join(',')}`} user={access.user} getToken={getToken} />;
}

function TerminalAdministration({ user, getToken }: { user: StaffAccessUser; getToken: GetTokenFn }) {
  const locations = deviceLocations(user);
  const id = useId();
  const alive = useRef(false);
  const activeRequest = useRef(false);
  const loadSequence = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const [saved, setSaved] = useState<StoredOperation>(readSaved);
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editEnabled, setEditEnabled] = useState(false);
  const [form, setForm] = useState({ profile: '', location: '', lane: '', terminal: '', label: '' });
  const pending = saved.pending;
  const foreign = !!pending && pending.owner_id !== user.id;
  const blocked = saved.blocked || !!pending || busy;
  const selectedProfile = profiles.find(profile => String(profile.id) === form.profile);
  const selectedLocation = Number(form.location);
  const compatible = (profile: TerminalProfile, locationId: number) => profile.location_id === null || profile.location_id === locationId;
  const locationChoices = locations.filter(location => !selectedProfile || compatible(selectedProfile, location.id));
  const profileChoices = profiles.filter(profile => (!form.location || compatible(profile, selectedLocation)) &&
    (profile.location_id === null || locations.some(location => location.id === profile.location_id)));

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current;
    loadAbort.current?.abort();
    const abort = new AbortController();
    loadAbort.current = abort;
    setLoading(true);
    setLoadError('');
    try {
      const token = await getToken();
      if (!alive.current || abort.signal.aborted) return;
      if (!token) throw new Error('Missing token');
      const data = await getTerminals({ token, signal: abort.signal });
      if (!alive.current || abort.signal.aborted || sequence !== loadSequence.current) return;
      const authorized = deviceLocations(user);
      setTerminals(data.terminals.filter(terminal => authorized.some(location => location.id === terminal.location_id)));
      setProfiles(data.profiles ?? []);
    } catch {
      if (alive.current && !abort.signal.aborted && sequence === loadSequence.current) setLoadError('Couldn’t load payment readers and profiles. Retry to get current information.');
    } finally {
      if (alive.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [getToken, user]);

  useEffect(() => {
    alive.current = true;
    void reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      setSaved(readSaved());
      setConfirmation(null);
      setActivationCode('');
    };
    window.addEventListener('storage', onStorage);
    return () => {
      alive.current = false;
      loadSequence.current += 1;
      loadAbort.current?.abort();
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  const persist = (operation: PendingOperation) => {
    // Operation objects contain only the explicit nonsecret schema above.
    localStorage.setItem(storageKey, JSON.stringify(operation));
    setSaved({ pending: operation, blocked: false });
  };
  const currentSaved = (operation: PendingOperation) => {
    const current = readSaved();
    return !current.blocked && current.pending?.key === operation.key && current.pending.owner_id === user.id;
  };

  const dispatch = async (operation: PendingOperation, code?: string, existing = true) => {
    if (activeRequest.current || operation.owner_id !== user.id || !alive.current) return;
    activeRequest.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const current = readSaved();
      if (current.blocked || (existing ? !currentSaved(operation) : !!current.pending)) throw new Error('Saved request changed');
      if (!existing) persist(operation);
      const token = await getToken();
      if (!alive.current) return;
      if (!token || !currentSaved(operation)) throw new Error('Request unavailable');
      // From this point, loss of a response must be treated as uncertain dispatch.
      // Only a server-reported reserved state permits activation-code re-entry.
      const sending: PendingOperation = { ...operation, state: 'unknown' };
      persist(sending);
      setConfirmation(null);
      setActivationCode('');
      const activation = operation.state === 'reserved' ? code : undefined;
      const response = operation.kind === 'create'
        ? await createPaymentTerminal({ token, key: operation.key, payload: operation.payload, activationCode: activation })
        : operation.kind === 'pair'
          ? await pairPaymentTerminal({ token, key: operation.key, terminalId: operation.terminal_id, activationCode: activation })
          : await retirePaymentTerminal({ token, key: operation.key, terminalId: operation.terminal_id });
      if (!alive.current) return;
      if (!states.includes(response.administration?.state) || !currentSaved(operation)) throw new Error('Unknown response');
      const state = response.administration.state;
      if (state === 'succeeded' || state === 'failed') {
        localStorage.removeItem(storageKey);
        setSaved({ pending: null, blocked: false });
        if (state === 'succeeded') {
          setNotice(operation.kind === 'retire' ? 'Reader retirement confirmed.' : 'Reader pairing confirmed.');
          if (operation.kind === 'create') setForm({ profile: '', location: '', lane: '', terminal: '', label: '' });
        } else setError('The saved reader operation failed. Review the reader and configuration before trying again.');
      } else persist({ ...operation, state });
      await reload();
    } catch {
      if (alive.current) {
        setSaved(readSaved());
        setError('The reader operation could not be confirmed. Keep the saved request and check it again. If it is reserved, review configuration or re-enter its activation code.');
      }
    } finally {
      activeRequest.current = false;
      if (alive.current) { setBusy(false); setActivationCode(''); }
    }
  };

  const newOperation = (operation: Operation, device: DeviceSnapshot): PendingOperation => ({
    ...operation, device: {
      label: device.label, location_id: device.location_id, lane_id: device.lane_id, terminal_id: device.terminal_id,
      environment: device.environment, provider: device.provider, device_serial: device.device_serial, device_model: device.device_model,
    }, version: 1, owner_id: user.id, key: crypto.randomUUID(), state: 'reserved',
  });
  const openOperation = (operation: Operation, device: DeviceSnapshot) => {
    const current = readSaved();
    if (blocked || loading || loadError || current.blocked || current.pending) { setSaved(current); return; }
    setActivationCode('');
    setConfirmation({ kind: 'operation', operation: newOperation(operation, device), saved: false });
  };
  const prepareCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProfile || !locations.some(location => location.id === selectedLocation) || !compatible(selectedProfile, selectedLocation)) return;
    if (selectedProfile.provider === 'worldpay' && selectedProfile.environment !== 'simulated' &&
      (!/^[1-9]\d*$/.test(form.lane.trim()) || !Number.isSafeInteger(Number(form.lane.trim())))) {
      setError('Enter the numeric lane assigned by your payment provider.'); return;
    }
    const payload: NewTerminalPayload = { payment_profile_id: selectedProfile.id, location_id: selectedLocation,
      label: form.label.trim(), lane_id: form.lane.trim(), terminal_id: form.terminal.trim() };
    if (!payload.label || !payload.lane_id || !payload.terminal_id) return;
    openOperation({ kind: 'create', payload }, { ...payload, provider: selectedProfile.provider, environment: selectedProfile.environment, device_model: null, device_serial: null });
  };

  const saveEdit = async () => {
    if (confirmation?.kind !== 'edit' || activeRequest.current || blocked || !editLabel.trim()) return;
    const terminal = confirmation.terminal;
    activeRequest.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const current = readSaved();
      if (current.blocked || current.pending) { setSaved(current); throw new Error('Pending operation'); }
      const token = await getToken();
      if (!alive.current) return;
      if (!token) throw new Error('Missing token');
      const latest = readSaved();
      if (latest.blocked || latest.pending) { setSaved(latest); throw new Error('Pending operation'); }
      await updatePaymentTerminal({ token, terminalId: terminal.id, label: editLabel.trim(), enabled: editEnabled });
      if (!alive.current) return;
      setConfirmation(null);
      setNotice('Reader label and availability saved.');
      await reload();
    } catch {
      if (alive.current) setError('Couldn’t confirm the reader settings. Refresh readers before retrying; the changes in this dialog are still here.');
    } finally {
      activeRequest.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const dialogOperation = confirmation?.kind === 'operation' ? confirmation.operation : null;
  const needsCode = !!dialogOperation && dialogOperation.kind !== 'retire' && dialogOperation.state === 'reserved';
  const dialogDevice = dialogOperation?.device ?? (confirmation?.kind === 'edit' ? confirmation.terminal : null);
  const title = confirmation?.kind === 'edit' ? 'Edit reader settings' : dialogOperation?.kind === 'retire' ? 'Retire this reader?' : 'Pair this reader?';
  return <div className="min-w-0 space-y-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2"><h1 className="text-2xl font-bold">Payment readers</h1><p className="text-sm">Pair and manage readers for authorized locations. Resolve any saved operation before making another change.</p></div>
      <button type="button" className={button} disabled={busy || loading} onClick={() => void reload()}>Refresh readers</button>
    </header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
    {saved.blocked && <section role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-base font-semibold">Saved reader operation unavailable</h2>
      <p className="text-sm">Browser storage is unavailable or the saved operation cannot be read. Changes are blocked. Ask an administrator to reconcile the original lane before clearing browser data.</p>
    </section>}
    {pending && <section aria-labelledby={`${id}-pending`} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 id={`${id}-pending`} className="text-base font-semibold">Saved {pending.kind === 'retire' ? 'retirement' : 'pairing'} needs resolution</h2>
      {foreign ? <p role="alert">This saved operation belongs to another staff account. Sign in with the original account to check it. Other changes are blocked.</p> : <>
        <DeviceFacts device={pending.device} locations={locations} />
        <p className="text-sm">Administration state: <strong>{pending.state}</strong>. {pending.state === 'reserved'
          ? 'The server may need an activation code or configuration correction before dispatch.'
          : 'The outcome is not yet confirmed. Do not request another code or create another pairing.'}</p>
        <p className="text-xs">Original request reference: {pending.key}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void dispatch(pending)}>{busy ? 'Checking saved operation…' : pending.kind === 'retire' ? 'Check saved retirement' : 'Check saved pairing'}</button>
          {pending.state === 'reserved' && pending.kind !== 'retire' && <button type="button" className={button} disabled={busy} onClick={() => { setActivationCode(''); setConfirmation({ kind: 'operation', operation: pending, saved: true }); }}>Retry reserved pairing</button>}
        </div>
      </>}
    </section>}
    <section aria-labelledby={`${id}-add`} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <h2 id={`${id}-add`} className="text-lg font-semibold">Pair a new reader</h2>
      <p className="text-sm">Choose an existing payment profile and its location. For Worldpay sandbox or production, use the assigned numeric lane and reader identifier. Ask an administrator if a profile is missing.</p>
      <form onSubmit={prepareCreate} className="space-y-4">
        <fieldset disabled={blocked || loading || !!loadError} className="grid min-w-0 gap-4 sm:grid-cols-2 disabled:opacity-60">
          <legend className="sr-only">New reader details</legend>
          <label className="min-w-0 space-y-1 text-sm font-medium">Payment profile
            <select required className={control} value={form.profile} onChange={event => setForm(previous => ({ ...previous, profile: event.target.value }))}>
              <option value="">Select a payment profile</option>
              {profileChoices.map(profile => <option key={profile.id} value={profile.id}>{profile.provider === 'worldpay' ? 'Worldpay' : 'Stripe'} · {profile.environment} · {profile.presentation} · #{profile.id}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm font-medium">Location
            <select required className={control} value={form.location} onChange={event => setForm(previous => ({ ...previous, location: event.target.value }))}>
              <option value="">Select a location</option>
              {locationChoices.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm font-medium">Reader label<input className={control} required maxLength={120} autoComplete="off" value={form.label} onChange={event => setForm(previous => ({ ...previous, label: event.target.value }))} /></label>
          <label className="min-w-0 space-y-1 text-sm font-medium">Assigned lane<input className={control} required maxLength={64} autoComplete="off" inputMode={selectedProfile?.provider === 'worldpay' && selectedProfile.environment !== 'simulated' ? 'numeric' : 'text'} value={form.lane} onChange={event => setForm(previous => ({ ...previous, lane: event.target.value }))} /></label>
          <label className="min-w-0 space-y-1 text-sm font-medium">Assigned reader identifier<input className={control} required maxLength={120} autoComplete="off" value={form.terminal} onChange={event => setForm(previous => ({ ...previous, terminal: event.target.value }))} /></label>
        </fieldset>
        {selectedProfile && <PaymentEnvironmentBadge environment={selectedProfile.environment} inline />}
        {!loading && !loadError && profiles.length === 0 && <p className="text-sm">No compatible payment profiles are available. A configured profile is required before pairing.</p>}
        <button type="submit" className={primary} disabled={blocked || loading || !!loadError || !selectedProfile || !form.location}>Review pairing</button>
      </form>
    </section>
    <section aria-labelledby={`${id}-readers`} className="space-y-3">
      <h2 id={`${id}-readers`} className="text-lg font-semibold">Installed readers</h2>
      {loading && <p role="status">Loading readers and payment profiles…</p>}
      {loadError && <p role="alert" className="text-sm text-red-800">{loadError} Use Refresh readers to retry.</p>}
      {!loading && !loadError && terminals.length === 0 && <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm">No readers are installed at your authorized locations.</p>}
      {terminals.map(terminal => {
        const unavailable = blocked || loading || !!loadError || terminal.status === 'retired';
        const occupied = !!terminal.attempt_id || ['waiting_for_card', 'card_inserted', 'processing'].includes(terminal.status);
        return <article key={terminal.id} aria-label={terminal.label} className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <DeviceFacts device={terminal} locations={locations} />
          <p className="text-sm">Reader: <strong>{terminal.status.replaceAll('_', ' ')}</strong> · {terminal.enabled ? 'Enabled' : 'Disabled'} · Connection: {terminal.connection_state?.replaceAll('_', ' ') || 'not verified'}</p>
          <p className="text-xs">Connection verified: {terminal.connection_verified_at || 'Not verified'} · Firmware: {terminal.device_firmware || 'Not verified'}</p>
          {occupied && <p className="text-sm font-medium text-amber-950">Reader has an unresolved payment{terminal.order_number ? ` for order ${terminal.order_number}` : ''}. Resolve the original payment in POS before pairing or retiring.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={unavailable} onClick={() => { setEditLabel(terminal.label); setEditEnabled(terminal.enabled); setConfirmation({ kind: 'edit', terminal }); }}>Edit label / availability</button>
            <button type="button" className={button} disabled={unavailable || occupied} onClick={() => openOperation({ kind: 'pair', terminal_id: terminal.id }, terminal)}>Pair reader</button>
            <button type="button" className={button} disabled={unavailable || occupied || terminal.connection_state === 'unknown'} onClick={() => openOperation({ kind: 'retire', terminal_id: terminal.id }, terminal)}>Retire reader</button>
          </div>
        </article>;
      })}
      <p className="text-xs text-gray-600">Connectivity does not establish a payment outcome. Retirement is confirmed only after the provider and server resolve the saved operation.</p>
    </section>
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) { setConfirmation(null); setActivationCode(''); } }}
      labelledBy={`${id}-dialog-title`} describedBy={`${id}-dialog-description`} dismissible={!busy} className="w-lg rounded-xl">
      <form className="min-w-0 space-y-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-6 [overflow-wrap:anywhere]" onSubmit={event => {
        event.preventDefault();
        if (confirmation?.kind === 'edit') void saveEdit();
        else if (dialogOperation && (!needsCode || activationCode.trim())) void dispatch(dialogOperation, activationCode.trim(), confirmation?.kind === 'operation' && confirmation.saved);
      }}>
        <h2 id={`${id}-dialog-title`} className="text-xl font-semibold">{title}</h2>
        <p id={`${id}-dialog-description`} className="text-sm">{confirmation?.kind === 'edit' ? 'Only the label and enabled status can change. The profile, location, lane and reader identifiers stay assigned.'
          : dialogOperation?.kind === 'retire' ? 'Confirm this exact device and lane. A busy or unresolved lane must be reconciled before retirement can complete.'
            : 'Confirm this exact device, location, lane and payment environment before sending its activation code.'}</p>
        {dialogDevice && <DeviceFacts device={dialogDevice} locations={locations} />}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {confirmation?.kind === 'edit' && <>
          <label className="block space-y-1 text-sm font-medium">Reader label<input autoComplete="off" required maxLength={120} className={control} disabled={busy} value={editLabel} onChange={event => setEditLabel(event.target.value)} /></label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base"><input type="checkbox" className="h-5 w-5" disabled={busy} checked={editEnabled} onChange={event => setEditEnabled(event.target.checked)} />Enabled for new payments</label>
        </>}
        {needsCode && <label className="block space-y-1 text-sm font-medium">Activation code<input type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" required maxLength={200} className={control} disabled={busy} value={activationCode} onChange={event => setActivationCode(event.target.value)} /></label>}
        {needsCode && dialogDevice?.environment === 'simulated' && <p className="text-sm text-amber-950">Simulated profile only — no money moves. Fixtures: SIM-APPROVE, SIM-DECLINE, SIM-TIMEOUT.</p>}
        {needsCode && <p className="text-xs text-gray-600">The activation code is cleared after dispatch and is never saved in browser storage.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => { setConfirmation(null); setActivationCode(''); }}>Back</button>
          <button type="submit" className={primary} disabled={busy || (needsCode && !activationCode.trim()) || (confirmation?.kind === 'edit' && !editLabel.trim())}>{busy ? 'Saving…' : confirmation?.kind === 'edit' ? 'Save settings' : dialogOperation?.kind === 'retire' ? 'Confirm retirement' : 'Confirm pairing'}</button>
        </div>
      </form>
    </Dialog>
  </div>;
}
