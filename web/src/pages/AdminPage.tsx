import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import axios from 'axios';

import { API_BASE_URL } from '../config';

export default function AdminPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const showComingSoon = () => {
    alert('Coming Soon!\n\nThis feature is currently being built.\n\nFor now, you can manage products, collections, and orders via the API endpoints or database directly.\n\nFull admin UI will be available in Phase 2.');
  };

  useEffect(() => {
    const checkAdminStatus = async () => {
      // Wait for Clerk to load before checking
      if (!isLoaded) {
        return;
      }

      // If no user after Clerk loaded, redirect
      if (!user) {
        navigate('/');
        return;
      }

      try {
        const token = await getToken();
        const response = await axios.get(`${API_BASE_URL}/api/v1/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.data.admin) {
          setIsAdmin(true);
        } else {
          // Not an admin, redirect to home
          alert('You do not have admin access');
          navigate('/');
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        alert('Error checking admin status');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [isLoaded, user, navigate, getToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage your Three Squares restaurant</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Products</h3>
            <p className="text-3xl font-bold text-tsPrimary">2</p>
            <p className="text-sm text-gray-600 mt-1">Total products</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Collections</h3>
            <p className="text-3xl font-bold text-tsPrimary">2</p>
            <p className="text-sm text-gray-600 mt-1">Total collections</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Orders</h3>
            <p className="text-3xl font-bold text-tsPrimary">0</p>
            <p className="text-sm text-gray-600 mt-1">Total orders</p>
          </div>
        </div>

        {/* Management Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Products */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Products</h2>
              <button 
                onClick={showComingSoon}
                className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium"
              >
                Add Product
              </button>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Manage your product catalog, variants, and inventory
            </p>
            <ul className="space-y-2 text-sm">
              <li className="text-gray-700">• Create and edit products</li>
              <li className="text-gray-700">• Manage variants (sizes, colors)</li>
              <li className="text-gray-700">• Upload product images</li>
              <li className="text-gray-700">• Track inventory levels</li>
            </ul>
          </div>

          {/* Collections */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Collections</h2>
              <button 
                onClick={showComingSoon}
                className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium"
              >
                Add Collection
              </button>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Organize products into collections for easy browsing
            </p>
            <ul className="space-y-2 text-sm">
              <li className="text-gray-700">• Create collections</li>
              <li className="text-gray-700">• Add products to collections</li>
              <li className="text-gray-700">• Set featured collections</li>
              <li className="text-gray-700">• Manage display order</li>
            </ul>
          </div>

          {/* Orders */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
              <button 
                onClick={showComingSoon}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition text-sm font-medium"
              >
                View All
              </button>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              View and manage customer orders
            </p>
            <ul className="space-y-2 text-sm">
              <li className="text-gray-700">• View order details</li>
              <li className="text-gray-700">• Update order status</li>
              <li className="text-gray-700">• Process refunds</li>
              <li className="text-gray-700">• Track shipments</li>
            </ul>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
              <button 
                onClick={() => navigate('/admin/settings')}
                className="bg-tsPrimary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition text-sm font-medium"
              >
                Configure
              </button>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Configure store settings and integrations
            </p>
            <ul className="space-y-2 text-sm">
              <li className="text-gray-700">• Store information</li>
              <li className="text-gray-700">• Payment test mode toggle</li>
              <li className="text-gray-700">• Shipping options</li>
              <li className="text-gray-700">• Email notifications</li>
            </ul>
          </div>
        </div>

        {/* Coming Soon Notice */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            Admin Features Coming Soon
          </h3>
          <p className="text-blue-800">
            Full admin functionality will be implemented in upcoming tasks. For now, you can access 
            the API endpoints directly using tools like curl or Postman.
          </p>
        </div>
      </div>
    </div>
  );
}

