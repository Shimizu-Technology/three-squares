import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import type { CartItem } from '../types/cart';
import useLockBodyScroll from '../hooks/useLockBodyScroll';
import PlaceholderImage from './ui/PlaceholderImage';
import OptimizedImage from './ui/OptimizedImage';

export default function CartDrawer() {
  const navigate = useNavigate();
  const {
    cart,
    isOpen,
    isLoading,
    closeCart,
    fetchCart,
    updateQuantity,
    removeItem,
    clearCart,
    subtotal,
  } = useCartStore();

  useLockBodyScroll(isOpen);

  // Fetch cart when component mounts or when cart opens
  useEffect(() => {
    if (isOpen) {
      fetchCart();
    }
  }, [isOpen, fetchCart]);

  if (!isOpen) return null;

  const handleQuantityChange = async (cartItemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    try {
      await updateQuantity(cartItemId, newQuantity);
    } catch (error) {
      console.error('Failed to update quantity', error);
    }
  };

  const handleRemoveItem = async (cartItemId: number) => {
    try {
      await removeItem(cartItemId);
    } catch (error) {
      console.error('Failed to remove item', error);
    }
  };

  const handleClearCart = async () => {
    if (window.confirm('Are you sure you want to clear your cart?')) {
      try {
        await clearCart();
      } catch (error) {
        console.error('Failed to clear cart', error);
      }
    }
  };

  return (
    <>
      {/* Overlay - semi-transparent with blur */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header with gradient */}
        <div className="bg-linear-to-r from-tsPrimary to-tsPrimary/90 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Shopping Cart</h2>
                <p className="text-white/80 text-sm">{cart?.item_count || 0} items</p>
              </div>
            </div>
            <button
              onClick={closeCart}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
              aria-label="Close cart"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-5 bg-warm-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-tsPrimary mx-auto mb-3"></div>
                <p className="text-sm text-warm-500">Loading cart...</p>
              </div>
            </div>
          ) : !cart || cart.items.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-10 h-10 text-warm-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-warm-900">Your cart is empty</h3>
              <p className="mt-2 text-warm-500 max-w-xs mx-auto">
                Discover our collection of authentic Chamorro pride merchandise!
              </p>
              <button
                onClick={closeCart}
                className="mt-6 btn-primary"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.items.map((item: CartItem) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-sm border border-warm-100 p-4 hover:shadow-md transition"
                >
                  <div className="flex gap-4">
                    {/* Product Image */}
                    <div className="relative">
                      <div className="w-20 h-20 rounded-lg overflow-hidden">
                        {item.product.primary_image_url ? (
                          <OptimizedImage
                            src={item.product.primary_image_url}
                            alt={item.product.name}
                            context="cart"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <PlaceholderImage variant="thumbnail" />
                        )}
                      </div>
                      {/* Availability Badge */}
                      {item.product.inventory_level !== 'none' && !item.availability.available && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          Out
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-warm-900 line-clamp-2">
                        {item.product.name}
                      </h3>
                      <p className="text-xs text-warm-500 mt-0.5">
                        {item.product_variant.display_name}
                      </p>
                      
                      {/* Availability Warning - Only show for tracked inventory */}
                      {item.product.inventory_level !== 'none' && item.availability.quantity_exceeds_stock && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          Only {item.availability.available_quantity} left
                        </p>
                      )}
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <p className="text-base font-bold text-warm-900">
                        ${((item.product_variant.price_cents * item.quantity) / 100).toFixed(2)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-xs text-warm-400">
                          ${(item.product_variant.price_cents / 100).toFixed(2)} each
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom Row: Quantity Controls + Remove */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-warm-100">
                    {/* Quantity Controls */}
                    <div className="flex items-center bg-warm-100 rounded-full">
                      <button
                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                        className="w-11 h-11 flex items-center justify-center text-warm-600 hover:text-tsPrimary hover:bg-warm-200 rounded-full transition disabled:opacity-50"
                        disabled={item.quantity <= 1 || isLoading}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <span className="w-10 text-center text-sm font-semibold text-warm-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                        className="w-11 h-11 flex items-center justify-center text-warm-600 hover:text-tsPrimary hover:bg-warm-200 rounded-full transition disabled:opacity-50"
                        disabled={
                          isLoading ||
                          (item.product.inventory_level !== 'none' && 
                           item.quantity >= item.availability.available_quantity)
                        }
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-xs font-medium text-warm-400 hover:text-red-600 transition flex items-center gap-1"
                      disabled={isLoading}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {/* Clear Cart Button */}
              {cart.items.length > 1 && (
                <button
                  onClick={handleClearCart}
                  className="w-full text-sm text-warm-500 hover:text-red-600 transition py-3 flex items-center justify-center gap-2"
                  disabled={isLoading}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear All Items
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart && cart.items.length > 0 && (
          <div className="border-t border-warm-200 bg-white p-5 space-y-4">
            {/* Subtotal */}
            <div className="flex justify-between items-center">
              <span className="text-warm-600">Subtotal</span>
              <span className="text-2xl font-bold text-warm-900">
                ${subtotal().toFixed(2)}
              </span>
            </div>

            {/* Shipping note */}
            <p className="text-xs text-warm-500 text-center bg-warm-50 py-2 px-3 rounded-lg">
              Shipping calculated at checkout
            </p>

            {/* Checkout Button */}
            <button
              onClick={() => {
                closeCart();
                navigate('/checkout');
              }}
              className="w-full bg-tsPrimary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition shadow-lg shadow-tsPrimary/25 flex items-center justify-center gap-2"
              disabled={isLoading}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secure Checkout
            </button>

            {/* Continue Shopping */}
            <button
              onClick={closeCart}
              className="w-full text-sm font-medium text-warm-500 hover:text-tsPrimary transition py-2"
            >
              ← Continue Shopping
            </button>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 pt-2 border-t border-warm-100">
              <div className="flex items-center gap-1 text-xs text-warm-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure
              </div>
              <div className="flex items-center gap-1 text-xs text-warm-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Cards Accepted
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

