import { useLocationStore } from '../store/locationStore';
import { useOrderingAvailability } from '../hooks/useOrderingAvailability';
import useAppConfig from '../hooks/useAppConfig';
import { useEffect, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import type { CartItem } from '../types/cart';
import Dialog from './ui/Dialog';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { ArrowLeft, LockKeyhole, Trash2, Minus, Plus, X } from 'lucide-react';
import PlaceholderImage from './ui/PlaceholderImage';
import OptimizedImage from './ui/OptimizedImage';

export default function CartDrawer() {
  const navigate = useNavigate();
  const location = useLocationStore((state) => state.selectedLocation);
  const config = useAppConfig();
  const { blocked: orderingBlocked, message: orderingMessage } = useOrderingAvailability('checkout');
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

  const titleId = useId();

  // Fetch cart when component mounts or when cart opens
  useEffect(() => {
    if (isOpen) {
      fetchCart();
    }
  }, [isOpen, fetchCart]);

  const handleQuantityChange = async (cartItemId: number, newQuantity: number) => {
    const item = cart?.items.find((entry) => entry.id === cartItemId);
    if (isLoading || newQuantity < 1 || !item ||
      (item.product.inventory_level !== 'none' && newQuantity > item.availability.available_quantity)) return;
    try {
      await updateQuantity(cartItemId, newQuantity);
    } catch (error) {
      console.error('Failed to update quantity', error);
    }
  };

  const handleRemoveItem = async (cartItemId: number) => {
    if (isLoading) return;
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeCart(); }} labelledBy={titleId}
      className="cart-drawer m-0 ml-auto h-dvh max-h-dvh w-full max-w-full sm:w-[420px] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="cart-drawer-header shrink-0 bg-tsPrimary px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <h2 id={titleId} className="text-lg font-bold text-white">Shopping Cart</h2>
                <p className="text-white/80 text-sm" aria-live="polite">{cart?.item_count || 0} {(cart?.item_count || 0) === 1 ? 'item' : 'items'}</p>
              </div>
            </div>
            <IconButton onClick={closeCart} variant="secondary" aria-label="Close cart"><X /></IconButton>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 min-h-32 overflow-y-auto overscroll-contain p-5 bg-warm-50" aria-busy={isLoading}>
          {isLoading && !cart ? (
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
                Browse the menu and choose a meal for pickup.
              </p>
              <Button onClick={() => { closeCart(); navigate('/products'); }} className="mt-6">Browse Menu</Button>
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
                    <div className="relative shrink-0">
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
                      <h3 className="text-sm font-semibold text-warm-900 line-clamp-2 break-words">
                        <Link to={`/products/${item.product.slug}`} onClick={closeCart} className="underline-offset-2 hover:underline">{item.product.name}</Link>
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
                    {item.pricing?.purchasable !== false && <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-warm-900">
                        {`$${(item.subtotal_cents / 100).toFixed(2)}`}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-xs text-warm-400">
                          ${(item.product_variant.price_cents / 100).toFixed(2)} each
                        </p>
                      )}
                    </div>}
                  </div>
                  {item.pricing?.purchasable === false && <p className="mt-3 text-sm font-medium text-warm-900">{item.pricing.reason || 'Contact us for a price before ordering'}</p>}

                  {/* Bottom Row: Quantity Controls + Remove */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-warm-100">
                    {/* Quantity Controls */}
                    <div role="group" aria-label={`Quantity of ${item.product.name}`} className="flex items-center gap-1">
                      <IconButton
                        aria-label={`Decrease quantity of ${item.product.name}`}
                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1 || isLoading}
                        variant="secondary"
                      ><Minus /></IconButton>
                      <output aria-label={`Quantity of ${item.product.name}`} className="w-10 text-center text-sm font-semibold text-warm-900 tabular-nums" aria-live="polite">
                        {item.quantity}
                      </output>
                      <IconButton
                        aria-label={`Increase quantity of ${item.product.name}`}
                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                        disabled={isLoading || (item.product.inventory_level !== 'none' && item.quantity >= item.availability.available_quantity)}
                        variant="secondary"
                      ><Plus /></IconButton>
                    </div>
                    <Button
                      aria-label={`Remove ${item.product.name} from cart`}
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={isLoading} variant="ghost" icon={<Trash2 />}
                    >Remove</Button>
                  </div>
                </div>
              ))}

              {/* Clear Cart Button */}
              {cart.items.length > 1 && (
                <Button onClick={handleClearCart} className="w-full" disabled={isLoading} variant="ghost" icon={<Trash2 />}>Clear all items</Button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart && cart.items.length > 0 && (
          <div className="cart-drawer-footer shrink-0 border-t border-warm-200 bg-white p-5 space-y-4">
            {/* Subtotal */}
            <div className="flex justify-between items-center">
              <span className="text-warm-600">Subtotal</span>
              <span className="text-2xl font-bold text-warm-900">
                ${subtotal().toFixed(2)}
              </span>
            </div>

            {/* Shipping note */}
            <p className="text-xs text-warm-500 text-center bg-warm-50 py-2 px-3 rounded-lg">
              {config?.enable_storefront_latte_stone === true && cart.items.every((item) => item.product.allow_shipping) ? 'Choose pickup or shipping at checkout' : `Pickup at ${location?.name || 'your selected location'}`}
            </p>

            {cart.items.some((item) => item.pricing?.purchasable === false) && <p role="alert" className="text-sm text-warm-700">Remove inquiry-only items before checking out. <a href="/catering" className="underline">Start a catering inquiry</a>.</p>}
            {orderingBlocked && <p id="cart-ordering-status" role="status" className="mb-3 text-sm text-warm-700">{orderingMessage}</p>}
            {/* Checkout Button */}
            <Button
              onClick={() => {
                if (orderingBlocked) return;
                closeCart();
                navigate('/checkout');
              }}
              size="lg" className="w-full" icon={<LockKeyhole />}
              aria-describedby={orderingBlocked ? "cart-ordering-status" : undefined}
              disabled={orderingBlocked || isLoading || cart.items.some((item) => item.pricing?.purchasable === false)}
            >Secure Checkout</Button>

            {/* Continue Shopping */}
            <Button onClick={closeCart} className="w-full" variant="ghost" icon={<ArrowLeft />}>Continue shopping</Button>

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
    </Dialog>
  );
}

