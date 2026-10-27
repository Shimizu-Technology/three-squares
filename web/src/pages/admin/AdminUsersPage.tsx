import axios from 'axios';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import { authGet, authPatch } from '../../services/authApi';

interface User {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  role: 'owner' | 'manager' | 'staff' | 'customer';
  assigned_location_id: number | null;
  assigned_location_name: string | null;
  is_admin: boolean;
  clerk_id: string;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  owners: number;
  managers: number;
  staff: number;
  customers: number;
}

interface UsersIndexResponse {
  users: User[];
  stats: Stats;
  locations: { id: number; name: string }[];
}

interface AdminUserResponse {
  user: User;
  message: string;
}

export default function AdminUsersPage() {
  const access = useStaffAccess();
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestId = useRef(0);
  const active = useRef(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { role: User['role']; assigned_location_id: number | null }>>({});

  const context = JSON.stringify([appliedSearch, roleFilter]);
  const hasData = loadedContext === context;

  const fetchUsers = useCallback(async () => {
    if (!active.current) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (appliedSearch) params.search = appliedSearch;
      if (roleFilter !== 'all') params.role = roleFilter;
      const response = await authGet<UsersIndexResponse>('/admin/users', getToken, { params, timeout: 20000 });
      if (id !== requestId.current) return;
      if (!Array.isArray(response.data.users) || !response.data.stats) throw new Error('Invalid users response');
      setUsers(response.data.users);
      setLocations(response.data.locations || []);
      setStats(response.data.stats);
      setLoadedContext(context);
      setLoadError(false);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('Failed to fetch users:', err);
      setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getToken, appliedSearch, roleFilter, context]);

  useEffect(() => {
    active.current = true;
    setLoadError(false);
    void fetchUsers();
    return () => { active.current = false; requestId.current += 1; };
  }, [fetchUsers, refreshVersion]);

  const handleSearch = () => {
    if (searchQuery === appliedSearch) void fetchUsers();
    else setAppliedSearch(searchQuery);
  };

  const saveUserAccess = async (user: User) => {
    const draft = drafts[user.id];
    if (!draft || updatingUserId !== null) return;
    if (draft.role === 'staff' && !draft.assigned_location_id) {
      toast.error('Assign a location before granting staff access');
      return;
    }

    try {
      setUpdatingUserId(user.id);
      const response = await authPatch<AdminUserResponse>(`/admin/users/${user.id}`, { user: draft }, getToken);
      
      if (!active.current) return;
      // Reconcile the currently selected context, even if filters changed
      // while the role update was pending. Counts come from the server.
      setDrafts(current => { const next = { ...current }; delete next[user.id]; return next; });
      setRefreshVersion(version => version + 1);
      if (user.id === access.user?.id) await access.reload();

      toast.success(response.data.message);
    } catch (err) {
      console.error('Failed to update user:', err);
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update user' : 'Failed to update user');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const renderAccessEditor = (user: User) => {
    const draft = drafts[user.id] || { role: user.role, assigned_location_id: user.assigned_location_id };
    const saving = updatingUserId === user.id;
    const update = (changes: Partial<typeof draft>) => setDrafts(current => ({ ...current, [user.id]: { ...draft, ...changes } }));
    return <form className="min-w-0 space-y-2" onSubmit={event => { event.preventDefault(); void saveUserAccess(user); }}>
      <label className="block text-sm font-medium">Role
        <select aria-label={`Role for ${user.email}`} value={draft.role} disabled={saving} onChange={event => {
          const role = event.target.value as User['role'];
          update({ role, assigned_location_id: role === 'owner' || role === 'customer' ? null : draft.assigned_location_id });
        }} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base">
          <option value="customer">Customer</option><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option>
        </select>
      </label>
      {(draft.role === 'manager' || draft.role === 'staff') && <label className="block text-sm font-medium">Location
        <select aria-label={`Location for ${user.email}`} value={draft.assigned_location_id ?? ''} disabled={saving} onChange={event => update({ assigned_location_id: event.target.value ? Number(event.target.value) : null })} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base">
          <option value="">{draft.role === 'manager' ? 'All locations' : 'Choose a required location'}</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>}
      <p className="text-xs text-gray-600">{draft.role === 'owner' ? 'All locations, users and settings' : draft.role === 'customer' ? 'Own account and orders' : draft.assigned_location_id ? locations.find(location => location.id === draft.assigned_location_id)?.name : draft.role === 'manager' ? 'All locations' : 'Ask a manager to assign your location'}</p>
      <button type="submit" disabled={!drafts[user.id] || updatingUserId !== null || (draft.role === 'staff' && !draft.assigned_location_id)} className="btn-primary min-h-11 w-full disabled:opacity-50">{saving ? 'Saving access…' : 'Save access'}</button>
    </form>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">Only owners can change roles and account location assignments. The last owner is protected.</p>
          <button type="button" onClick={() => void fetchUsers()} disabled={loading} className="btn-secondary mt-3 min-h-11 disabled:opacity-60">Refresh users</button>
        </div>
      </div>

      <div className="mb-6">
        <AdminRequestState resource="Users" loading={loading} error={loadError} hasData={hasData} onRetry={() => void fetchUsers()} />
      </div>

      {/* Stats Cards */}
      {hasData && stats && <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Users</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{stats.owners}</p>
          <p className="text-sm text-gray-500">Owners</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center"><p className="text-3xl font-bold text-gray-900">{stats.managers}</p><p className="text-sm text-gray-500">Managers</p></div>
        <div className="bg-white rounded-lg shadow p-4 text-center"><p className="text-3xl font-bold text-gray-900">{stats.staff}</p><p className="text-sm text-gray-500">Staff</p></div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-gray-600">{stats.customers}</p>
          <p className="text-sm text-gray-500">Customers</p>
        </div>
      </div>}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Search users"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition font-medium"
              >
                Search
              </button>
            </div>
          </div>

          {/* Role Filter */}
          <select
            aria-label="Filter users by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owners</option><option value="manager">Managers</option><option value="staff">Staff</option>
            <option value="customer">Customers Only</option>
          </select>
        </div>
      </div>

      {/* Users List */}
      {!hasData || (users.length === 0 && (loading || loadError)) ? null : users.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="mb-4"><svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No users found</h3>
          <p className="text-gray-600">
            {appliedSearch || roleFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Users will appear here once they sign in.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden xl:block bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[160px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="shrink-0 h-10 w-10">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${
                            user.is_admin ? 'bg-indigo-500' : 'bg-gray-400'
                          }`}>
                            {(user.name || user.email).charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.name || 'No name'}</div>
                          <div className="break-all text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-900">{user.role}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderAccessEditor(user)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:hidden">
            {users.map((user) => (
              <div key={user.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex min-w-0 items-center">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${
                      user.is_admin ? 'bg-indigo-500' : 'bg-gray-400'
                    }`}>
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3 min-w-0">
                      <p className="font-semibold text-gray-900">{user.name || 'No name'}</p>
                      <p className="break-all text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-900">{user.role}</span>
                </div>

                <div className="text-sm text-gray-500 mb-4">
                  Joined {formatDate(user.created_at)}
                </div>

                {renderAccessEditor(user)}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Help Text */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">How User Sync Works</h4>
        <p className="text-sm text-blue-800">
          Users are synced from Clerk when they first sign in and visit the site. 
          If someone created a Clerk account but isn't showing up here, ask them to visit the site while logged in.
        </p>
      </div>
    </div>
  );
}
