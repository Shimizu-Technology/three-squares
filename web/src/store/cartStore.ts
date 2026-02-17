import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../services/api';
import type { Cart, CartValidation } from '../types/cart';
import toast from 'react-hot-toast';

interface CartStore {
  // State
  cart: Cart | null;
  isLoading: boolean;
  isOpen: boolean; // For cart drawer
  sessionId: string | null;
  
  // Actions
  fetchCart: () => Promise<void>;
  addItem: (variantId: number | null, quantity: number, productId?: number) => Promise<void>;
  updateQuantity: (cartItemId: number, quantity: number) => Promise<void>;
  removeItem: (cartItemId: number) => Promise<void>;
  clearCart: () => Promise<void>;
  validateCart: () => Promise<CartValidation>;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  
  // Computed
  itemCount: () => number;
  subtotal: () => number;
}

// Generate or get session ID for guest carts
const getSessionId = (): string => {
  let sessionId = localStorage.getItem('cart_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('cart_session_id', sessionId);
  }
  return sessionId;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      // Initial State
      cart: null,
      isLoading: false,
      isOpen: false,
      sessionId: getSessionId(),
      
      // Fetch cart from API
      fetchCart: async () => {
        set({ isLoading: true });
        try {
          const sessionId = get().sessionId;
          const response = await api.get('/cart', {
            headers: {
              'X-Session-ID': sessionId,
            },
          });
          set({ cart: response.data, isLoading: false });
        } catch (error) {
          console.error('Failed to fetch cart:', error);
          set({ isLoading: false });
        }
      },
      
      // Add item to cart
      addItem: async (variantId: number | null, quantity: number = 1, productId?: number) => {
        set({ isLoading: true });
        try {
          const sessionId = get().sessionId;
          const payload: { product_variant_id?: number; product_id?: number; quantity: number } = { quantity };

          if (variantId) {
            payload.product_variant_id = variantId;
          } else if (productId) {
            payload.product_id = productId;
          } else {
            throw new Error('Missing product identifier for cart add');
          }

          await api.post(
            '/cart/items',
            payload,
            {
              headers: {
                'X-Session-ID': sessionId,
              },
            }
          );
          
          // Refresh cart after adding
          await get().fetchCart();
          
          set({ isLoading: false, isOpen: true }); // Open cart drawer
        } catch (error) {
          console.error('Failed to add item to cart:', error);
          set({ isLoading: false });
          
          // Handle error (show toast)
          const errorMessage = error.response?.data?.error || 'Failed to add item to cart';
          toast.error(errorMessage);
          throw error;
        }
      },
      
      // Update item quantity
      updateQuantity: async (cartItemId: number, quantity: number) => {
        set({ isLoading: true });
        try {
          const sessionId = get().sessionId;
          await api.put(
            `/cart/items/${cartItemId}`,
            { quantity },
            {
              headers: {
                'X-Session-ID': sessionId,
              },
            }
          );
          
          // Refresh cart
          await get().fetchCart();
          set({ isLoading: false });
        } catch (error) {
          console.error('Failed to update quantity:', error);
          set({ isLoading: false });
          
          const errorMessage = error.response?.data?.error || 'Failed to update quantity';
          toast.error(errorMessage);
          throw error;
        }
      },
      
      // Remove item from cart
      removeItem: async (cartItemId: number) => {
        set({ isLoading: true });
        try {
          const sessionId = get().sessionId;
          await api.delete(`/cart/items/${cartItemId}`, {
            headers: {
              'X-Session-ID': sessionId,
            },
          });
          
          // Refresh cart
          await get().fetchCart();
          set({ isLoading: false });
        } catch (error) {
          console.error('Failed to remove item:', error);
          set({ isLoading: false });
          throw error;
        }
      },
      
      // Clear entire cart
      clearCart: async () => {
        set({ isLoading: true });
        try {
          const sessionId = get().sessionId;
          await api.delete('/cart', {
            headers: {
              'X-Session-ID': sessionId,
            },
          });
          
          set({ cart: null, isLoading: false });
        } catch (error) {
          console.error('Failed to clear cart:', error);
          set({ isLoading: false });
          throw error;
        }
      },
      
      // Validate cart (check for stock issues) - RACE CONDITION PREVENTION
      validateCart: async () => {
        try {
          const sessionId = get().sessionId;
          const response = await api.post('/cart/validate', {}, {
            headers: {
              'X-Session-ID': sessionId,
            },
          });
          
          return response.data as CartValidation;
        } catch (error) {
          console.error('Failed to validate cart:', error);
          throw error;
        }
      },
      
      // Toggle cart drawer
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      
      // Open cart drawer
      openCart: () => set({ isOpen: true }),
      
      // Close cart drawer
      closeCart: () => set({ isOpen: false }),
      
      // Computed: Get total item count
      itemCount: () => {
        const cart = get().cart;
        return cart?.item_count || 0;
      },
      
      // Computed: Get subtotal in dollars
      subtotal: () => {
        const cart = get().cart;
        return (cart?.subtotal_cents || 0) / 100;
      },
    }),
    {
      name: 'three-squares-cart', // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        sessionId: state.sessionId,
        // Don't persist cart data - always fetch from server
      }),
    }
  )
);

