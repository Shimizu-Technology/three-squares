import axios from 'axios';
import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { authGet, authPatch } from '../../services/authApi';

type UserRole = 'customer' | 'staff' | 'manager' | 'owner';

interface User {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  role: UserRole;
  is_admin: boolean;
  clerk_id: string;
  assigned_location_id: number | null;
  assigned_location_name: string | null;
  location_scoped: boolean;
  created_at: string;
  updated_at: string;
}

interface Location {
  id: number;
  name: string;
}

interface Stats {
  total: number;
  owners: number;
  admins: number;
  customers: number;
}

interface UsersIndexResponse {
  users: User[];
  stats: Stats;
}

interface AdminUserResponse {
  user: User;
  message: string;
}

const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-purple-100 text-purple-800',
  manager: 'bg-blue-100 text-blue-800',
  staff: 'bg-green-100 text-green-800',
  customer: 'bg-gray-100 text-gray-800',
};

const ROLE_AVATAR_COLORS: Record<UserRole, string> = {
  owner: 'bg-purple-500',
  manager: 'bg-blue-500',
  staff: 'bg-green-500',
  customer: 'bg-gray-400',
};

export default function AdminUsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, owners: 0, admins: 0, customers: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('customer');
  const [editLocationId, setEditLocationId] = useState<number | null>(null);

  // Fetch locations for staff/manager assignment
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await authGet<{ data: Location[] }>('/admin/locations', getToken);
        setLocations(response.data.data || []);
      } catch {
        // Locations not critical for page load
      }
    };
    fetchLocations();
  }, [getToken]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      if (roleFilter !== 'all') params.role = roleFilter;
      const response = await authGet<UsersIndexResponse>('/admin/users', getToken, { params });
      setUsers(response.data.users);
      setStats(response.data.stats);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [roleFilter]);

  const handleSearch = () => { fetchUsers(); };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditLocationId(user.assigned_location_id);
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;

    // Validate staff requires location
    if (editRole === 'staff' && !editLocationId) {
      toast.error('Staff members must have an assigned location');
      return;
    }

    const action = editRole !== editingUser.role
      ? `change ${editingUser.email} to ${editRole}`
      : `update location for ${editingUser.email}`;
    if (!confirm(`Are you sure you want to ${action}?`)) return;

    try {
      setUpdatingUserId(editingUser.id);
      const payload: Record<string, unknown> = { role: editRole };
      if (editRole === 'staff' || editRole === 'manager') {
        payload.assigned_location_id = editLocationId;
      } else {
        payload.assigned_location_id = null;
      }
      const response = await authPatch<AdminUserResponse>(
        `/admin/users/${editingUser.id}`,
        { user: payload },
        getToken
      );
      setUsers(users.map(u => u.id === editingUser.id ? response.data.user : u));
      toast.success(response.data.message);
      setEditingUser(null);
    } catch (err) {
      console.error('Failed to update user:', err);
      toast.error(
        axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to update user' : 'Failed to update user'
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const RoleBadge = ({ role }: { role: UserRole }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[role]}`}>
      {role}
    </span>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">Manage user accounts and role assignments</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Users</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{stats.owners}</p>
          <p className="text-sm text-gray-500">Owners</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.admins}</p>
          <p className="text-sm text-gray-500">Staff+</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-3xl font-bold text-gray-600">{stats.customers}</p>
          <p className="text-sm text-gray-500">Customers</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="flex gap-2">
              <input
                type="text"
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
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owners</option>
            <option value="manager">Managers</option>
            <option value="staff">Staff</option>
            <option value="customer">Customers</option>
          </select>
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary"></div>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No users found</h3>
          <p className="text-gray-600">
            {searchQuery || roleFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Users will appear here once they sign in.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${ROLE_AVATAR_COLORS[u.role]}`}>
                          {(u.name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{u.name || 'No name'}</div>
                          <div className="text-sm text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap"><RoleBadge role={u.role} /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {u.assigned_location_name || (u.role === 'staff' || u.role === 'manager' ? 'All Locations' : '—')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(u)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        Edit Role
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${ROLE_AVATAR_COLORS[u.role]}`}>
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3">
                      <p className="font-semibold text-gray-900">{u.name || 'No name'}</p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <RoleBadge role={u.role} />
                </div>
                {u.assigned_location_name && (
                  <p className="text-sm text-gray-500 mb-2">📍 {u.assigned_location_name}</p>
                )}
                <p className="text-sm text-gray-500 mb-4">Joined {formatDate(u.created_at)}</p>
                <button
                  onClick={() => openEditModal(u)}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Edit Role
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Edit User Role</h3>
            <p className="text-sm text-gray-500 mb-4">{editingUser.email}</p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={editRole}
              onChange={(e) => {
                const r = e.target.value as UserRole;
                setEditRole(r);
                if (r !== 'staff' && r !== 'manager') setEditLocationId(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
            >
              <option value="customer">Customer</option>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>

            {(editRole === 'staff' || editRole === 'manager') && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assigned Location {editRole === 'staff' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={editLocationId ?? ''}
                  onChange={(e) => setEditLocationId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                >
                  {editRole === 'manager' && <option value="">All Locations</option>}
                  {editRole === 'staff' && <option value="">Select a location...</option>}
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                {editRole === 'staff' && (
                  <p className="text-xs text-gray-500 -mt-2 mb-4">Staff members can only see orders at their assigned location.</p>
                )}
                {editRole === 'manager' && (
                  <p className="text-xs text-gray-500 -mt-2 mb-4">Leave blank for all-location access, or pick one to scope their view.</p>
                )}
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={updatingUserId === editingUser.id}
                className="flex-1 py-2 px-4 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark font-medium transition disabled:opacity-50"
              >
                {updatingUserId === editingUser.id ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Role Hierarchy</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li><strong>Owner</strong> — Full access to everything (settings, products, users, etc.)</li>
          <li><strong>Manager</strong> — Orders, analytics, inventory, POS, refunds. No settings/products/users.</li>
          <li><strong>Staff</strong> — Orders at their location, POS, pickup queue only.</li>
          <li><strong>Customer</strong> — Browse, order, view own orders.</li>
        </ul>
      </div>
    </div>
  );
}
