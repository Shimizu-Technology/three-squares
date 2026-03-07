import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser, useAuth } from '@clerk/clerk-react';
import ProductsPage from './pages/ProductsPage';
import BusinessLineEntryPage from './pages/BusinessLineEntryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import CollectionsPage from './pages/CollectionsPage';
import CollectionDetailPage from './pages/CollectionDetailPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminPickupQueuePage from './pages/admin/AdminPickupQueuePage';
import AdminShippingQueuePage from './pages/admin/AdminShippingQueuePage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import AdminCollectionsPage from './pages/admin/AdminCollectionsPage';
import AdminImportPage from './pages/admin/AdminImportPage';
import ProductFormPage from './pages/admin/ProductFormPage';
import AdminInventoryPage from './pages/admin/AdminInventoryPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminVariantPresetsPage from './pages/admin/AdminVariantPresetsPage';
import AdminCateringPage from './pages/admin/AdminCateringPage';
import AdminLocationsPage from './pages/admin/AdminLocationsPage';
import AdminPOSPage from './pages/admin/AdminPOSPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderConfirmationPage from './pages/OrderConfirmationPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import AccountPage from './pages/AccountPage';
import NotFoundPage from './pages/NotFoundPage';
import ContactPage from './pages/ContactPage';
import ShippingInfoPage from './pages/ShippingInfoPage';
import ReturnsPage from './pages/ReturnsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import CateringPage from './pages/CateringPage';
import LocationsPage from './pages/LocationsPage';
import axios from 'axios';
import { Toaster } from 'react-hot-toast';
import CartIcon from './components/CartIcon'; // Import CartIcon
import CartDrawer from './components/CartDrawer'; // Import CartDrawer
import ScrollToTop from './components/ScrollToTop'; // Import ScrollToTop
import SmoothScroll from './components/SmoothScroll'; // Import SmoothScroll
import { AnimatePresence } from 'framer-motion'; // Page transitions
import NavDropdown from './components/NavDropdown'; // Import NavDropdown
import MobileNavDropdown from './components/MobileNavDropdown'; // Import MobileNavDropdown
import { useCartStore } from './store/cartStore'; // Import cart store
import { API_BASE_URL } from './config';

// Custom UserButton with Admin Dashboard Link and My Orders
function CustomUserButton({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();

  return (
    <UserButton afterSignOutUrl="/">
      <UserButton.MenuItems>
        {/* My Account - available to all signed-in users */}
        <UserButton.Action
          label="My Account"
          labelIcon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
          onClick={() => navigate('/account')}
        />
        {/* My Orders - available to all signed-in users */}
        <UserButton.Action
          label="My Orders"
          labelIcon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
          onClick={() => navigate('/orders')}
        />
        {/* Admin Dashboard - only for admins */}
        {isAdmin && (
          <UserButton.Action
            label="Admin Dashboard"
            labelIcon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            onClick={() => navigate('/admin')}
          />
        )}
      </UserButton.MenuItems>
    </UserButton>
  );
}

// AppContent component (uses useNavigate, must be inside BrowserRouter)
function AppContent() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const { closeCart } = useCartStore(); // Get closeCart function

  // Close cart and mobile menu on route change (handles back/forward, programmatic navigation, etc.)
  useEffect(() => {
    setMobileMenuOpen(false); // eslint-disable-line react-hooks/set-state-in-effect -- intentional: reset UI on route change
    closeCart();
  }, [location.pathname, closeCart]);

  useEffect(() => {
    const handleAuthError = () => {
      setIsAdmin(false);
      if (location.pathname.startsWith('/admin')) {
        navigate('/');
      }
    };

    window.addEventListener('threesquares:auth-error', handleAuthError as EventListener);
    return () => {
      window.removeEventListener('threesquares:auth-error', handleAuthError as EventListener);
    };
  }, [location.pathname, navigate]);

  // Helper to close both mobile menu and cart (for explicit link clicks)
  const handleNavClick = () => {
    setMobileMenuOpen(false);
    closeCart();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!isLoaded) {
        return;
      }
      
      if (!user) {
        setIsAdmin(false);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          setIsAdmin(false);
          return;
        }
        
        const response = await axios.get(`${API_BASE_URL}/api/v1/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        setIsAdmin(response.data.admin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        if (axios.isAxiosError(error)) {
          console.error('Response data:', error.response?.data);
          console.error('Response status:', error.response?.status);
          console.error('Response headers:', error.response?.headers);
        }
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, [isLoaded, user, getToken]);

  // Check if we're on admin pages
  const isAdminPage = location.pathname.startsWith('/admin');
  const routeTransitionKey = isAdminPage ? '/admin' : location.pathname;

  return (
    <>
      <SmoothScroll>
      <ScrollToTop />
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#fff',
            color: '#333',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '14px',
            fontWeight: '500',
          },
          success: {
            style: {
              border: '1px solid #10B981',
            },
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            style: {
              border: '1px solid #EF4444',
            },
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <div className="min-h-screen bg-warm-50">
        {/* Cart Drawer */}
        <CartDrawer />

        {/* Navigation - Hidden when printing and on admin pages */}
        {!isAdminPage && (
        <nav className="bg-warm-50 border-b border-warm-200 sticky top-0 z-40 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-18 py-3.5">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-3 group" onClick={handleNavClick}>
                <img 
                  src="/images/three-squares-logo.svg" 
                  alt="Three Squares" 
                  className="block h-8 sm:h-9 w-auto object-contain"
                />
                <span className="hidden xl:block text-[11px] tracking-wide uppercase text-warm-500">
                  by B&amp;G Pacific
                </span>
              </Link>

              {/* Desktop Navigation Links */}
              <div className="hidden md:flex items-center space-x-10">
                {/* Shop Dropdown */}
                <NavDropdown onItemClick={handleNavClick} darkMode={false} />
                <Link
                  to="/catering"
                  className="text-warm-700 hover:text-tsPrimary text-[15px] font-medium transition py-2"
                  onClick={handleNavClick}
                >
                  Catering
                </Link>
                <Link
                  to="/locations"
                  className="text-warm-700 hover:text-tsPrimary text-[15px] font-medium transition py-2"
                  onClick={handleNavClick}
                >
                  Locations
                </Link>
                <Link
                  to="/about"
                  className="text-warm-700 hover:text-tsPrimary text-[15px] font-medium transition py-2"
                  onClick={handleNavClick}
                >
                  About Us
                </Link>
              </div>

              {/* Right Side: Search, Cart, Auth, Mobile Menu */}
              <div className="flex items-center space-x-3 md:space-x-4">
                {/* Search Bar - Desktop */}
                <form onSubmit={handleSearch} className="hidden lg:block">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search menu..."
                      className="pl-10 pr-4 py-2.5 bg-white border border-warm-200 rounded-full focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary w-56 xl:w-64 transition-all text-sm text-warm-900 placeholder-warm-400"
                    />
                    <svg
                      className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-warm-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </form>

                {/* Search Icon - Tablet */}
                <button
                  type="button"
                  className="hidden md:flex lg:hidden p-2.5 min-w-[44px] min-h-[44px] items-center justify-center text-warm-600 hover:text-tsPrimary transition rounded-lg"
                  onClick={() => {
                    const input = document.querySelector('input[placeholder="Search menu..."]') as HTMLInputElement;
                    if (input) input.focus();
                  }}
                  aria-label="Search"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* Cart Icon */}
                <CartIcon darkMode={false} />

                {/* Auth - Desktop */}
                <div className="hidden md:flex items-center">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="text-sm px-5 py-2.5 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition font-medium">
                        Log In
                      </button>
                    </SignInButton>
                  </SignedOut>

                  <SignedIn>
                    <CustomUserButton isAdmin={isAdmin} />
                  </SignedIn>
                </div>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-warm-600 hover:text-tsPrimary transition rounded-lg"
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-warm-100 bg-white animate-slide-down">
              <div className="px-4 py-4 space-y-4">
                {/* Mobile Search */}
                <form onSubmit={handleSearch}>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search menu..."
                      className="w-full pl-10 pr-4 py-3 bg-warm-50 border border-warm-200 rounded-full focus:outline-none focus:ring-2 focus:ring-tsPrimary/20 focus:border-tsPrimary text-warm-900 placeholder-warm-400 transition text-sm"
                    />
                    <svg
                      className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-warm-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </form>

                {/* Shop Dropdown */}
                <MobileNavDropdown onItemClick={handleNavClick} darkMode={false} />
                
                {/* Other Nav Links */}
                <Link
                  to="/catering"
                  className="flex items-center gap-3 text-warm-700 hover:text-tsPrimary font-medium py-2"
                  onClick={handleNavClick}
                >
                  <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.126-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265z" />
                  </svg>
                  Catering
                </Link>
                <Link
                  to="/locations"
                  className="flex items-center gap-3 text-warm-700 hover:text-tsPrimary font-medium py-2"
                  onClick={handleNavClick}
                >
                  <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  Locations
                </Link>
                <Link
                  to="/about"
                  className="flex items-center gap-3 text-warm-700 hover:text-tsPrimary font-medium py-2"
                  onClick={handleNavClick}
                >
                  <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  About Us
                </Link>
                
                {/* Auth Section */}
                <div className="pt-4 border-t border-warm-100">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="w-full py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition font-medium">
                        Log In
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <div className="flex items-center justify-between py-2">
                      <Link
                        to="/account"
                        className="text-warm-700 hover:text-tsPrimary font-medium transition"
                        onClick={handleNavClick}
                      >
                        My Account
                      </Link>
                      <CustomUserButton isAdmin={isAdmin} />
                    </div>
                  </SignedIn>
                </div>
              </div>
            </div>
          )}
        </nav>
        )}

        {/* Routes with page transitions */}
        <AnimatePresence mode="wait">
        <Routes location={location} key={routeTransitionKey}>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/shop/three-squares" element={<BusinessLineEntryPage businessLine="three_squares" />} />
          <Route path="/shop/latte-stone-cookies" element={<BusinessLineEntryPage businessLine="latte_stone" />} />
          <Route path="/shop/catering" element={<BusinessLineEntryPage businessLine="catering" />} />
          <Route path="/products/:slug" element={<ProductDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:slug" element={<CollectionDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/catering" element={<CateringPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/orders/:id" element={<OrderConfirmationPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/shipping" element={<ShippingInfoPage />} />
          <Route path="/returns" element={<ReturnsPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          
          {/* POS Mode — Full screen, outside admin layout */}
          <Route path="/admin/pos" element={<AdminPOSPage />} />

          {/* Admin Routes with Layout */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="orders/pickup-queue" element={<AdminPickupQueuePage />} />
            <Route path="orders/shipping-queue" element={<AdminShippingQueuePage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id/edit" element={<ProductFormPage />} />
            <Route path="collections" element={<AdminCollectionsPage />} />
            <Route path="locations" element={<AdminLocationsPage />} />
            <Route path="import" element={<AdminImportPage />} />
            <Route path="inventory" element={<AdminInventoryPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="catering" element={<AdminCateringPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="settings/variant-presets" element={<AdminVariantPresetsPage />} />
          </Route>
          
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </AnimatePresence>

        {/* Footer - Hidden when printing and on admin pages */}
        {!isAdminPage && (
        <footer className="bg-warm-50 border-t border-warm-100 decorative-border-footer print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
              {/* Brand */}
              <div className="sm:col-span-2 md:col-span-1">
                <img 
                  src="/images/three-squares-logo.svg" 
                  alt="Three Squares" 
                  className="block h-8 w-auto object-contain"
                />
                <p className="text-[11px] uppercase tracking-wide text-warm-500 mt-2">by B&amp;G Pacific</p>
                <p className="text-warm-500 text-sm mt-4 leading-relaxed">
                  Good Food, Good Mood, Good Service<br />
                  Guam-style comfort food & catering
                </p>
                <div className="flex space-x-4 mt-4">
                  <a 
                    href="https://www.facebook.com/threesquaresguam" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-warm-400 hover:text-warm-600 transition p-1.5 -m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Facebook"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
                    </svg>
                  </a>
                  <a 
                    href="https://www.instagram.com/threesquaresguam" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-warm-400 hover:text-warm-600 transition p-1.5 -m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Instagram"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                </div>
              </div>

              {/* Footer Navigation */}
              <div>
                <h4 className="font-medium text-warm-900 mb-4">Menu</h4>
                <ul className="space-y-2">
                  <li>
                    <Link to="/products" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      Full Menu
                    </Link>
                  </li>
                  <li>
                    <Link to="/products?category=breakfast" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      Breakfast
                    </Link>
                  </li>
                  <li>
                    <Link to="/products?category=mains" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      Main Dishes
                    </Link>
                  </li>
                  <li>
                    <Link to="/catering" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      Catering
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-warm-900 mb-4">Info</h4>
                <ul className="space-y-2">
                  <li>
                    <Link to="/about" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      About Us
                    </Link>
                  </li>
                  <li>
                    <Link to="/contact" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link to="/locations" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      Locations
                    </Link>
                  </li>
                  <li>
                    <a href="https://wa.me/16718646656" className="text-warm-500 hover:text-warm-900 transition text-sm">
                      WhatsApp Orders
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-warm-900 mb-4">Main Location</h4>
                <address className="text-warm-500 text-sm not-italic">
                  416 Chalan San Antonio<br />
                  Tamuning, GU 96913<br />
                  <br />
                  <a href="tel:+16716462652" className="hover:text-warm-900 transition">
                    (671) 646-2652
                  </a><br />
                  <a href="https://wa.me/16718646656" className="hover:text-warm-900 transition">
                    WhatsApp: (671) 864-6656
                  </a>
                </address>
              </div>
            </div>

            <div className="border-t border-warm-200 mt-12 pt-8">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-warm-400 text-sm text-center sm:text-left">
                  &copy; 2026 Three Squares / B&G Pacific LLC. All rights reserved.
                </p>
                <div className="flex gap-6 text-sm">
                  <Link to="/privacy" className="text-warm-400 hover:text-warm-600 transition">
                    Privacy Policy
                  </Link>
                  <Link to="/terms" className="text-warm-400 hover:text-warm-600 transition">
                    Terms of Service
                  </Link>
                </div>
              </div>
            </div>
            {/* Shimizu Technology attribution */}
            <div className="mt-10 pt-6 border-t border-warm-200 flex justify-center">
              <a
                href="https://shimizu-technology.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-warm-400 hover:text-warm-600 transition-colors duration-200"
              >
                Built by{" "}
                <span className="font-medium">Shimizu Technology</span>
              </a>
            </div>
          </div>
        </footer>
        )}
      </div>
      </SmoothScroll>
    </>
  );
}

// Main App component (wraps AppContent with BrowserRouter)
function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
