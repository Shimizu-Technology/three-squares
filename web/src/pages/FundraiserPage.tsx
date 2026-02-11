import { useRef, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Package, Calendar, MapPin, Phone, Mail, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';
import useLockBodyScroll from '../hooks/useLockBodyScroll';
import api from '../services/api';
import toast from 'react-hot-toast';
import OptimizedImage from '../components/ui/OptimizedImage';

interface Fundraiser {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  public_message: string | null;
  start_date: string | null;
  end_date: string | null;
  image_url: string | null;
  goal_amount_cents: number | null;
  raised_amount_cents: number | null;
  progress_percentage: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  pickup_location: string | null;
  pickup_instructions: string | null;
  allow_shipping: boolean;
  can_order: boolean;
}

interface FundraiserProduct {
  id: number;
  product_id: number;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  min_quantity: number;
  max_quantity: number | null;
  image_url: string | null;
  variants: Variant[];
  in_stock: boolean;
}

interface Variant {
  id: number;
  display_name: string;
  size: string;
  color: string;
  in_stock: boolean;
}

interface Participant {
  id: number;
  name: string;
  participant_number: string | null;
  display_name: string;
}

interface CartItem {
  fundraiser_product_id: number;
  variant_id: number;
  quantity: number;
  name: string;
  variant_name: string;
  price_cents: number;
}

export default function FundraiserPage() {
  const { slug } = useParams<{ slug: string }>();
  const [fundraiser, setFundraiser] = useState<Fundraiser | null>(null);
  const [products, setProducts] = useState<FundraiserProduct[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<number | null>(null);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    if (slug) loadFundraiser();
  }, [slug]);

  const loadFundraiser = async () => {
    try {
      const response = await api.get(`/fundraisers/${slug}`);
      setFundraiser(response.data.fundraiser);
      setProducts(response.data.products);
      setParticipants(response.data.participants);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fundraiser not found');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: FundraiserProduct, variantId: number) => {
    const variant = product.variants.find(v => v.id === variantId);
    if (!variant) return;

    setCart(prev => {
      const existing = prev.find(
        item => item.fundraiser_product_id === product.id && item.variant_id === variantId
      );

      if (existing) {
        // Check max quantity
        if (product.max_quantity && existing.quantity >= product.max_quantity) {
          toast.error(`Maximum ${product.max_quantity} allowed`);
          return prev;
        }
        return prev.map(item =>
          item.fundraiser_product_id === product.id && item.variant_id === variantId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, {
        fundraiser_product_id: product.id,
        variant_id: variantId,
        quantity: product.min_quantity || 1,
        name: product.name,
        variant_name: variant.display_name,
        price_cents: product.price_cents
      }];
    });

    toast.success('Added to cart');
  };

  const updateQuantity = (fpId: number, variantId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.fundraiser_product_id === fpId && item.variant_id === variantId) {
        const product = products.find(p => p.id === fpId);
        const newQty = item.quantity + delta;
        
        if (newQty < (product?.min_quantity || 1)) return item;
        if (product?.max_quantity && newQty > product.max_quantity) return item;
        
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (fpId: number, variantId: number) => {
    setCart(prev => prev.filter(
      item => !(item.fundraiser_product_id === fpId && item.variant_id === variantId)
    ));
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const cartTotal = cart.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !fundraiser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-warm-900 mb-2">Fundraiser Not Found</h1>
        <p className="text-warm-600 mb-4">{error}</p>
        <Link to="/" className="text-tsPrimary hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Hero */}
      <div 
        className="relative bg-cover bg-center h-64 md:h-80"
        style={{ 
          backgroundImage: fundraiser.image_url 
            ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url('${fundraiser.image_url}')`
            : 'linear-gradient(135deg, #C1191F 0%, #991B1B 100%)'
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white px-4">
            <h1 className="text-3xl md:text-5xl font-bold mb-2">{fundraiser.name}</h1>
            {!fundraiser.can_order && (
              <span className="inline-block px-4 py-2 bg-warm-800/80 rounded-full text-sm">
                This fundraiser has ended
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            {fundraiser.description && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">About This Fundraiser</h2>
                <p className="text-warm-700 whitespace-pre-wrap">{fundraiser.description}</p>
              </div>
            )}

            {/* Public Message */}
            {fundraiser.public_message && (
              <div className="bg-tsGold/10 border border-tsGold rounded-lg p-6">
                <p className="text-warm-800">{fundraiser.public_message}</p>
              </div>
            )}

            {/* Products */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Products</h2>
              {products.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-warm-500">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No products available</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={addToCart}
                      canOrder={fundraiser.can_order}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress */}
            {fundraiser.goal_amount_cents && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Fundraising Progress</h3>
                <div className="text-3xl font-bold text-tsPrimary mb-1">
                  {formatPrice(fundraiser.raised_amount_cents || 0)}
                </div>
                <p className="text-sm text-warm-600 mb-3">
                  raised of {formatPrice(fundraiser.goal_amount_cents)} goal
                </p>
                <div className="h-3 bg-warm-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-tsGold rounded-full transition-all"
                    style={{ width: `${Math.min(fundraiser.progress_percentage, 100)}%` }}
                  />
                </div>
                <p className="text-sm text-warm-600 mt-2">{fundraiser.progress_percentage.toFixed(0)}%</p>
              </div>
            )}

            {/* Dates */}
            {(fundraiser.start_date || fundraiser.end_date) && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-2 text-warm-700">
                  <Calendar className="w-5 h-5" />
                  <span>
                    {fundraiser.start_date} {fundraiser.end_date && `- ${fundraiser.end_date}`}
                  </span>
                </div>
              </div>
            )}

            {/* Pickup Info */}
            {fundraiser.pickup_location && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Pickup Information</h3>
                <div className="flex items-start gap-2 text-warm-700 mb-2">
                  <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
                  <span>{fundraiser.pickup_location}</span>
                </div>
                {fundraiser.pickup_instructions && (
                  <p className="text-sm text-warm-600 pl-7">{fundraiser.pickup_instructions}</p>
                )}
              </div>
            )}

            {/* Contact */}
            {(fundraiser.contact_name || fundraiser.contact_email || fundraiser.contact_phone) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Contact</h3>
                {fundraiser.contact_name && (
                  <p className="text-warm-700 mb-2">{fundraiser.contact_name}</p>
                )}
                {fundraiser.contact_email && (
                  <a href={`mailto:${fundraiser.contact_email}`} className="flex items-center gap-2 text-tsPrimary hover:underline mb-2">
                    <Mail className="w-4 h-4" />
                    {fundraiser.contact_email}
                  </a>
                )}
                {fundraiser.contact_phone && (
                  <a href={`tel:${fundraiser.contact_phone}`} className="flex items-center gap-2 text-tsPrimary hover:underline">
                    <Phone className="w-4 h-4" />
                    {fundraiser.contact_phone}
                  </a>
                )}
              </div>
            )}

            {/* Select Participant */}
            {participants.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Support a Participant
                </h3>
                <select
                  value={selectedParticipant || ''}
                  onChange={(e) => setSelectedParticipant(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                >
                  <option value="">Select a participant (optional)</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-6 bg-tsPrimary text-white px-6 py-4 rounded-full shadow-lg hover:bg-primary-dark transition flex items-center gap-3 z-40"
        >
          <ShoppingCart className="w-6 h-6" />
          <span className="font-semibold">{cartCount} items</span>
          <span className="font-bold">{formatPrice(cartTotal)}</span>
        </button>
      )}

      {/* Cart Modal */}
      {showCart && (
        <CartModal
          cart={cart}
          fundraiser={fundraiser}
          selectedParticipant={selectedParticipant}
          participants={participants}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onClose={() => setShowCart(false)}
          onCheckout={() => {
            // Navigate to checkout or handle inline
            toast.success('Checkout coming soon!');
          }}
        />
      )}
    </div>
  );
}

// Product Card Component
function ProductCard({
  product,
  onAddToCart,
  canOrder
}: {
  product: FundraiserProduct;
  onAddToCart: (product: FundraiserProduct, variantId: number) => void;
  canOrder: boolean;
}) {
  const [selectedVariant, setSelectedVariant] = useState<number | null>(
    product.variants.length === 1 ? product.variants[0].id : null
  );

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="w-full sm:w-40 h-40 bg-warm-100 shrink-0">
          {product.image_url ? (
            <OptimizedImage
              src={product.image_url}
              alt={product.name}
              context="fundraiser"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-warm-400">
              <Package className="w-12 h-12" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-lg">{product.name}</h3>
              <p className="text-2xl font-bold text-tsPrimary mt-1">
                {formatPrice(product.price_cents)}
              </p>
            </div>
          </div>

          {product.description && (
            <p className="text-warm-600 text-sm mt-2 line-clamp-2">{product.description}</p>
          )}

          {/* Variant Selection */}
          {product.variants.length > 1 && (
            <div className="mt-3">
              <select
                value={selectedVariant || ''}
                onChange={(e) => setSelectedVariant(Number(e.target.value))}
                className="w-full sm:w-auto px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              >
                <option value="">Select Size/Color</option>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={!v.in_stock}>
                    {v.display_name} {!v.in_stock && '(Out of Stock)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Add to Cart */}
          {canOrder && (
            <button
              onClick={() => selectedVariant && onAddToCart(product, selectedVariant)}
              disabled={!selectedVariant || !product.in_stock}
              className="mt-3 w-full sm:w-auto px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:bg-warm-300 disabled:cursor-not-allowed transition"
            >
              {!product.in_stock ? 'Out of Stock' : 'Add to Cart'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Cart Modal Component
function CartModal({
  cart,
  fundraiser: _fundraiser,
  selectedParticipant,
  participants,
  onUpdateQuantity,
  onRemove,
  onClose,
  onCheckout
}: {
  cart: CartItem[];
  fundraiser: Fundraiser;
  selectedParticipant: number | null;
  participants: Participant[];
  onUpdateQuantity: (fpId: number, variantId: number, delta: number) => void;
  onRemove: (fpId: number, variantId: number) => void;
  onClose: () => void;
  onCheckout: () => void;
}) {
  useLockBodyScroll(true);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const total = cart.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
  const participant = participants.find(p => p.id === selectedParticipant);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg sm:rounded-b-lg rounded-t-2xl max-h-[80dvh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Your Order</h2>
          <button onClick={onClose} className="p-2.5 hover:bg-warm-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">✕</button>
        </div>

        <div
          ref={modalContentRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 overscroll-contain"
          onWheel={(event) => {
            if (modalContentRef.current) {
              modalContentRef.current.scrollTop += event.deltaY;
            }
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          {participant && (
            <div className="bg-tsGold/10 border border-tsGold rounded-lg p-3">
              <p className="text-sm text-warm-700">
                Supporting: <span className="font-semibold">{participant.display_name}</span>
              </p>
            </div>
          )}

          {cart.map((item) => (
            <div key={`${item.fundraiser_product_id}-${item.variant_id}`} className="flex items-center gap-4 border-b pb-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{item.name}</h4>
                <p className="text-sm text-warm-600">{item.variant_name}</p>
                <p className="font-semibold text-tsPrimary">{formatPrice(item.price_cents)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateQuantity(item.fundraiser_product_id, item.variant_id, -1)}
                  className="p-2.5 border rounded-lg hover:bg-warm-100 transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-medium">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQuantity(item.fundraiser_product_id, item.variant_id, 1)}
                  className="p-2.5 border rounded-lg hover:bg-warm-100 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => onRemove(item.fundraiser_product_id, item.variant_id)}
                className="p-2.5 text-warm-400 hover:text-red-600"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t space-y-4">
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-tsPrimary">{formatPrice(total)}</span>
          </div>
          <button
            onClick={onCheckout}
            className="w-full py-3 bg-tsPrimary text-white rounded-lg font-semibold hover:bg-primary-dark transition"
          >
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
