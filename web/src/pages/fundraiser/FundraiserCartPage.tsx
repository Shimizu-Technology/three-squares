import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowLeft } from 'lucide-react';
import fundraiserPublicService, { type Fundraiser } from '../../services/fundraiserPublicService';
import { FundraiserCartProvider, useFundraiserCart } from '../../contexts/FundraiserCartContext';
import FundraiserSupportingBanner from '../../components/fundraiser/FundraiserSupportingBanner';
import FundraiserCartItem from '../../components/fundraiser/FundraiserCartItem';

function FundraiserCartPageContent() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [fundraiser, setFundraiser] = useState<Fundraiser | null>(null);
  const [loading, setLoading] = useState(true);

  const { state, setFundraiser: setCartFundraiser, updateQuantity, removeItem, itemCount, subtotal } =
    useFundraiserCart();

  useEffect(() => {
    if (slug) {
      loadFundraiser();
    }
  }, [slug]);

  const loadFundraiser = async () => {
    try {
      const response = await fundraiserPublicService.getFundraiser(slug!);
      setFundraiser(response.fundraiser);
      setCartFundraiser(response.fundraiser.slug, response.fundraiser.id);
    } catch (err) {
      console.error('Failed to load fundraiser:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Header */}
      <div className="bg-white border-b border-warm-100">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to={`/f/${slug}`}
              className="p-2 hover:bg-warm-100 rounded-lg transition"
              aria-label="Back to fundraiser"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-warm-900">Your Cart</h1>
              {fundraiser && (
                <p className="text-sm text-warm-600">{fundraiser.name}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Supporting Banner */}
        {state.participantName && (
          <div className="mb-6">
            <FundraiserSupportingBanner participantName={state.participantName} />
          </div>
        )}

        {state.items.length === 0 ? (
          /* Empty Cart */
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto text-warm-300 mb-4" />
            <h2 className="text-xl font-semibold text-warm-900 mb-2">Your cart is empty</h2>
            <p className="text-warm-600 mb-6">Add some items to get started!</p>
            <Link
              to={`/f/${slug}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Continue Shopping
            </Link>
          </div>
        ) : (
          /* Cart with Items */
          <div className="space-y-6">
            {/* Cart Items */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">
                {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
              </h2>
              <div className="divide-y divide-warm-100">
                {state.items.map((item) => (
                  <FundraiserCartItem
                    key={`${item.fundraiserProductId}-${item.variantId}`}
                    item={item}
                    onUpdateQuantity={(qty) =>
                      updateQuantity(item.fundraiserProductId, item.variantId, qty)
                    }
                    onRemove={() => removeItem(item.fundraiserProductId, item.variantId)}
                  />
                ))}
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-warm-700">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-warm-600 text-sm">
                  <span>Shipping</span>
                  <span>Calculated at checkout</span>
                </div>
                <div className="border-t border-warm-200 pt-3 flex justify-between text-lg font-bold">
                  <span>Estimated Total</span>
                  <span className="text-tsPrimary">{formatPrice(subtotal)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to={`/f/${slug}`}
                className="flex-1 py-3 px-6 border border-warm-300 text-warm-700 rounded-lg hover:bg-warm-50 transition font-medium text-center"
              >
                Continue Shopping
              </Link>
              <button
                onClick={() => navigate(`/f/${slug}/checkout`)}
                disabled={!fundraiser?.can_order}
                className="flex-1 py-3 px-6 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:bg-warm-300 disabled:cursor-not-allowed transition font-semibold"
              >
                {fundraiser?.can_order ? 'Proceed to Checkout' : 'Fundraiser Ended'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper with provider
export default function FundraiserCartPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <FundraiserCartProvider fundraiserSlug={slug}>
      <FundraiserCartPageContent />
    </FundraiserCartProvider>
  );
}
