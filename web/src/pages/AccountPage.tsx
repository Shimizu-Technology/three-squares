import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUser, useAuth, SignInButton, UserProfile } from '@clerk/clerk-react';
import axios from 'axios';
import { User, Package, Settings, ChevronRight, ShoppingBag, LogIn, X } from 'lucide-react';
import FadeIn from '../components/animations/FadeIn';
import Breadcrumbs from '../components/Breadcrumbs';
import { API_BASE_URL } from '../config';

interface OrderItem {
  product_name: string;
  variant_name: string;
  quantity: number;
}

interface Order {
  id: number;
  order_number: string;
  status: string;
  status_display: string;
  total_formatted: string;
  item_count: number;
  created_at_display: string;
  items_preview: OrderItem[];
}

export default function AccountPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isLoaded: authLoaded, isSignedIn } = useAuth();
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      fetchRecentOrders();
    } else if (authLoaded && !isSignedIn) {
      setOrdersLoading(false);
    }
  }, [authLoaded, isSignedIn]);

  const fetchRecentOrders = async () => {
    try {
      setOrdersLoading(true);
      const token = await getToken();
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/orders/my?page=1&per_page=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRecentOrders(response.data.orders);
      setOrdersError(null);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setOrdersError('Unable to load recent orders.');
    } finally {
      setOrdersLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
      case 'confirmed':
        return 'bg-blue-100 text-blue-800';
      case 'shipped':
        return 'bg-purple-100 text-purple-800';
      case 'delivered':
      case 'picked_up':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-warm-100 text-warm-800';
    }
  };

  // Loading state
  if (!userLoaded || !authLoaded) {
    return (
      <div className="min-h-screen bg-warm-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-tsPrimary border-t-transparent"></div>
            <p className="mt-4 text-warm-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not signed in — show sign-in prompt
  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-warm-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-warm-100 rounded-full flex items-center justify-center">
              <LogIn className="w-8 h-8 text-warm-400" />
            </div>
            <h1 className="text-2xl font-bold text-warm-900 mb-3">Sign In to Your Account</h1>
            <p className="text-warm-600 mb-6">
              Sign in to view your profile, order history, and manage your account settings.
            </p>
            <SignInButton mode="modal">
              <button className="w-full py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition font-medium">
                Sign In
              </button>
            </SignInButton>
            <p className="text-sm text-warm-500 mt-4">
              Don&apos;t have an account? Signing in will create one automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Breadcrumbs */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Breadcrumbs items={[
          { label: 'Home', path: '/' },
          { label: 'My Account' },
        ]} />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FadeIn>
          <h1 className="text-3xl font-bold text-warm-900 mb-8">My Account</h1>
        </FadeIn>

        <div className="space-y-6">
          {/* Profile Info Section */}
          <FadeIn delay={0.05}>
            <section className="bg-white rounded-lg shadow-sm border border-warm-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-warm-100 flex items-center gap-2">
                <User className="w-5 h-5 text-warm-500" />
                <h2 className="text-lg font-semibold text-warm-900">Profile</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-5">
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName || 'Profile'}
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-warm-200"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-warm-200 flex items-center justify-center">
                      <User className="w-8 h-8 text-warm-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-warm-900">
                      {user?.fullName || 'No name set'}
                    </h3>
                    <p className="text-warm-600 text-sm">
                      {user?.primaryEmailAddress?.emailAddress || 'No email'}
                    </p>
                    {user?.createdAt && (
                      <p className="text-warm-400 text-xs mt-1">
                        Member since {new Date(user.createdAt).toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </FadeIn>

          {/* Order History Section */}
          <FadeIn delay={0.1}>
            <section className="bg-white rounded-lg shadow-sm border border-warm-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-warm-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-warm-500" />
                  <h2 className="text-lg font-semibold text-warm-900">Recent Orders</h2>
                </div>
                <Link
                  to="/orders"
                  className="text-sm text-tsPrimary hover:text-red-700 font-medium flex items-center gap-1 transition"
                >
                  View All
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="p-6">
                {ordersLoading && (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-tsPrimary border-t-transparent"></div>
                    <p className="mt-3 text-sm text-warm-500">Loading orders...</p>
                  </div>
                )}

                {ordersError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-red-700">{ordersError}</p>
                    <button
                      onClick={fetchRecentOrders}
                      className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!ordersLoading && !ordersError && recentOrders.length === 0 && (
                  <div className="text-center py-8">
                    <ShoppingBag className="w-12 h-12 mx-auto text-warm-300 mb-3" />
                    <p className="text-warm-600 mb-4">You haven&apos;t placed any orders yet.</p>
                    <Link
                      to="/products"
                      className="inline-flex items-center px-5 py-2.5 bg-tsPrimary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
                    >
                      Start Shopping
                    </Link>
                  </div>
                )}

                {!ordersLoading && !ordersError && recentOrders.length > 0 && (
                  <div className="divide-y divide-warm-100">
                    {recentOrders.map((order) => (
                      <Link
                        key={order.id}
                        to={`/orders/${order.id}`}
                        className="flex items-center justify-between py-4 first:pt-0 last:pb-0 group hover:bg-warm-50 -mx-2 px-2 rounded-lg transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-warm-900 group-hover:text-tsPrimary transition">
                              {order.order_number}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status_display}
                            </span>
                          </div>
                          <p className="text-sm text-warm-500 mt-0.5">
                            {order.created_at_display}
                            <span className="mx-1.5">&middot;</span>
                            {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span className="font-semibold text-warm-900">{order.total_formatted}</span>
                          <ChevronRight className="w-4 h-4 text-warm-400 group-hover:text-tsPrimary transition" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </FadeIn>

          {/* Account Settings Section */}
          <FadeIn delay={0.15}>
            <section className="bg-white rounded-lg shadow-sm border border-warm-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-warm-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-warm-500" />
                <h2 className="text-lg font-semibold text-warm-900">Account Settings</h2>
              </div>
              <div className="p-6">
                <p className="text-warm-600 text-sm mb-4">
                  Update your profile information, change your password, or manage connected accounts.
                </p>
                <button
                  onClick={() => setShowUserProfile(true)}
                  className="inline-flex items-center px-5 py-2.5 bg-warm-100 text-warm-700 text-sm font-medium rounded-lg hover:bg-warm-200 transition"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Account
                </button>
              </div>
            </section>
          </FadeIn>
        </div>
      </div>

      {/* Clerk UserProfile Modal */}
      {showUserProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowUserProfile(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-md hover:bg-warm-50 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-warm-600" />
            </button>
            <UserProfile
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none rounded-none',
                },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
