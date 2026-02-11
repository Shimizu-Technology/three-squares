import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Package, Minus, Plus, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import fundraiserPublicService, {
  type FundraiserProduct,
  type Fundraiser,
} from '../../services/fundraiserPublicService';
import { FundraiserCartProvider, useFundraiserCart } from '../../contexts/FundraiserCartContext';
import FundraiserSupportingBanner from '../../components/fundraiser/FundraiserSupportingBanner';

function FundraiserProductPageContent() {
  const { slug, productSlug } = useParams<{ slug: string; productSlug: string }>();

  const [fundraiser, setFundraiser] = useState<Fundraiser | null>(null);
  const [product, setProduct] = useState<FundraiserProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Product selection state
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { state, setFundraiser: setCartFundraiser, addItem, itemCount, subtotal } =
    useFundraiserCart();

  useEffect(() => {
    if (slug && productSlug) {
      loadData();
    }
  }, [slug, productSlug]);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fundraiserPublicService.getFundraiser(slug!);
      setFundraiser(response.fundraiser);
      setCartFundraiser(response.fundraiser.slug, response.fundraiser.id);

      const foundProduct = response.products.find((p) => p.slug === productSlug);
      if (!foundProduct) {
        setError('Product not found');
        return;
      }

      setProduct(foundProduct);

      // Auto-select variant if only one option
      if (foundProduct.variants.length === 1) {
        setSelectedVariantId(foundProduct.variants[0].id);
      }

      // Set initial quantity to min_quantity
      setQuantity(foundProduct.min_quantity || 1);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleQuantityChange = (delta: number) => {
    if (!product) return;
    const newQty = quantity + delta;
    if (newQty < (product.min_quantity || 1)) return;
    if (product.max_quantity && newQty > product.max_quantity) return;
    setQuantity(newQty);
  };

  const handleAddToCart = () => {
    if (!product || !selectedVariantId) return;

    const variant = product.variants.find((v) => v.id === selectedVariantId);
    if (!variant) return;

    if (!variant.in_stock) {
      toast.error('This variant is out of stock');
      return;
    }

    addItem({
      fundraiserProductId: product.id,
      variantId: selectedVariantId,
      quantity,
      name: product.name,
      variantName: variant.display_name,
      priceCents: product.price_cents,
      imageUrl: product.image_url,
      minQuantity: product.min_quantity || 1,
      maxQuantity: product.max_quantity,
    });

    toast.success('Added to cart!');
  };

  // Reserved for potential future use (e.g., showing selected variant details)
  const _selectedVariant = product?.variants.find((v) => v.id === selectedVariantId);
  void _selectedVariant;

  // Build image array
  const images = product?.images?.length
    ? product.images.map((img) => img.url)
    : product?.image_url
    ? [product.image_url]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !product || !fundraiser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-warm-900 mb-2">Product Not Found</h1>
        <p className="text-warm-600 mb-4">{error}</p>
        <Link to={`/f/${slug}`} className="text-tsPrimary hover:underline">
          Back to Fundraiser
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-warm-100">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-warm-600">
            <Link to={`/f/${slug}`} className="hover:text-tsPrimary transition">
              {fundraiser.name}
            </Link>
            <span>/</span>
            <span className="text-warm-900">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Supporting Banner */}
        {state.participantName && (
          <div className="mb-6">
            <FundraiserSupportingBanner participantName={state.participantName} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="aspect-square bg-white rounded-lg overflow-hidden relative">
              {images.length > 0 ? (
                <>
                  <img
                    src={images[currentImageIndex]}
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() =>
                          setCurrentImageIndex((prev) =>
                            prev === 0 ? images.length - 1 : prev - 1
                          )
                        }
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full shadow hover:bg-white transition"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() =>
                          setCurrentImageIndex((prev) =>
                            prev === images.length - 1 ? 0 : prev + 1
                          )
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full shadow hover:bg-white transition"
                        aria-label="Next image"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-warm-400">
                  <Package className="w-24 h-24" />
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-20 h-20 rounded-lg overflow-hidden shrink-0 border-2 transition ${
                      idx === currentImageIndex
                        ? 'border-tsPrimary'
                        : 'border-transparent hover:border-warm-300'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${product.name} ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-warm-900">{product.name}</h1>
              <p className="text-3xl font-bold text-tsPrimary mt-2">
                {formatPrice(product.price_cents)}
              </p>
            </div>

            {product.description && (
              <p className="text-warm-700 whitespace-pre-wrap">{product.description}</p>
            )}

            {/* Variant Selection */}
            {product.variants.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  Select Option
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariantId(variant.id)}
                      disabled={!variant.in_stock}
                      className={`px-4 py-3 rounded-lg border text-sm font-medium transition ${
                        selectedVariantId === variant.id
                          ? 'border-tsPrimary bg-tsPrimary/5 text-tsPrimary'
                          : variant.in_stock
                          ? 'border-warm-200 hover:border-warm-400 text-warm-700'
                          : 'border-warm-200 bg-warm-100 text-warm-400 cursor-not-allowed'
                      }`}
                    >
                      {variant.display_name}
                      {!variant.in_stock && (
                        <span className="block text-xs opacity-75">Out of Stock</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Quantity
                {product.min_quantity > 1 && (
                  <span className="text-warm-500 ml-1">(Min: {product.min_quantity})</span>
                )}
                {product.max_quantity && (
                  <span className="text-warm-500 ml-1">(Max: {product.max_quantity})</span>
                )}
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= (product.min_quantity || 1)}
                  className="p-3 border rounded-lg hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="w-12 text-center text-xl font-medium">{quantity}</span>
                <button
                  onClick={() => handleQuantityChange(1)}
                  disabled={!!product.max_quantity && quantity >= product.max_quantity}
                  className="p-3 border rounded-lg hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Add to Cart Button */}
            <button
              onClick={handleAddToCart}
              disabled={!fundraiser.can_order || !product.in_stock || !selectedVariantId}
              className="w-full py-4 bg-tsPrimary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:bg-warm-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-5 h-5" />
              {!fundraiser.can_order
                ? 'Fundraiser Ended'
                : !product.in_stock
                ? 'Out of Stock'
                : !selectedVariantId
                ? 'Select an Option'
                : 'Add to Cart'}
            </button>

            {/* Back Link */}
            <Link
              to={`/f/${slug}`}
              className="inline-flex items-center gap-2 text-warm-600 hover:text-tsPrimary transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Fundraiser
            </Link>
          </div>
        </div>
      </div>

      {/* Floating Cart Button */}
      {itemCount > 0 && (
        <Link
          to={`/f/${slug}/cart`}
          className="fixed bottom-6 right-6 bg-tsPrimary text-white px-6 py-4 rounded-full shadow-lg hover:bg-primary-dark transition flex items-center gap-3 z-40"
        >
          <ShoppingCart className="w-6 h-6" />
          <span className="font-semibold">{itemCount} items</span>
          <span className="font-bold">{formatPrice(subtotal)}</span>
        </Link>
      )}
    </div>
  );
}

// Wrapper with provider
export default function FundraiserProductPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <FundraiserCartProvider fundraiserSlug={slug}>
      <FundraiserProductPageContent />
    </FundraiserCartProvider>
  );
}
