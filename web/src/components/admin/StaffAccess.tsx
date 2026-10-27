import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { authGet } from '../../services/authApi';
import { canAccessStaffRoute, hasStaffCapability, needsLocationAssignment, normalizeStaffAccess, staffScopeLabel, type StaffAccessUser, type StaffCapability } from './staffAccess.ts';

export type { StaffAccessUser, StaffCapability, StaffRole, StaffLocation } from './staffAccess.ts';

export interface StaffAccessValue {
  user: StaffAccessUser | null;
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
  can: (capability: StaffCapability) => boolean;
  roleLabel: string;
  scopeLabel: string;
  assignmentRequired: boolean;
}
const StaffAccessContext = createContext<StaffAccessValue | null>(null);

/** Wrap a shell or standalone POS gate once; consumers share the same /me check. */
export function StaffAccessProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { getToken } = useAuth();
  const identity = clerkUser?.id || null;
  const request = useRef(0);
  const [pending, setPending] = useState(true);
  const [result, setResult] = useState<{ identity: string | null; user: StaffAccessUser | null; error: boolean }>({ identity: null, user: null, error: false });
  const reload = useCallback(async () => {
    const attempt = ++request.current;
    if (!isLoaded) return;
    if (!identity) { setResult({ identity: null, user: null, error: false }); setPending(false); return; }
    setPending(true);
    try {
      const response = await authGet<unknown>('/me', getToken, { timeout: 20000 });
      if (attempt !== request.current) return;
      const user = normalizeStaffAccess(response.data);
      if (!user || user.clerk_id !== identity) throw new Error('Invalid access response');
      setResult({ identity, user, error: false });
    } catch {
      if (attempt === request.current) setResult({ identity, user: null, error: true });
    } finally {
      if (attempt === request.current) setPending(false);
    }
  }, [isLoaded, identity, getToken]);
  useEffect(() => {
    void reload();
    return () => { request.current += 1; };
  }, [reload]);
  // Identity binding removes prior privileges immediately on account switch/sign-out.
  const matches = result.identity === identity;
  const user = isLoaded && identity && matches && !pending ? result.user : null;
  const value: StaffAccessValue = {
    user, loading: !isLoaded || (!!identity && (!matches || pending)), error: matches && !!identity && result.error,
    reload, can: capability => hasStaffCapability(user, capability),
    roleLabel: user ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Signed out',
    scopeLabel: staffScopeLabel(user), assignmentRequired: needsLocationAssignment(user),
  };
  return <StaffAccessContext.Provider value={value}>{children}</StaffAccessContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStaffAccess(): StaffAccessValue {
  const value = useContext(StaffAccessContext);
  if (!value) throw new Error('useStaffAccess requires StaffAccessProvider');
  return value;
}

export function StaffAccessDenied() {
  const { user, roleLabel, scopeLabel, assignmentRequired } = useStaffAccess();
  return <section role="alert" className="mx-auto max-w-xl space-y-4 rounded-xl border border-gray-300 bg-white p-6">
    <h1 className="text-xl font-bold">This page isn’t available for your access</h1>
    <p className="break-words text-sm text-gray-700">Role: {roleLabel} · Scope: {scopeLabel}</p>
    <p>{assignmentRequired ? 'Ask a manager to assign your location' : 'Ask an owner or manager if you need access to this task.'}</p>
    <div className="flex flex-wrap gap-3">
      {canAccessStaffRoute(user, '/admin/orders/pickup-queue') && <Link to="/admin/orders/pickup-queue" className="btn-primary min-h-11">Open pickup queue</Link>}
      {canAccessStaffRoute(user, '/admin/devices') && <Link to="/admin/devices" className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-3">This device</Link>}
      <Link to="/" className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-3">View store</Link>
    </div>
  </section>;
}
