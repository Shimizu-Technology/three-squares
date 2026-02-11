import { useRef, useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ProductFull, ProductVariant } from '../services/api';
import { productsApi, formatPrice } from '../services/api';
import { useCartStore } from '../store/cartStore';
import Breadcrumbs from '../components/Breadcrumbs';
import PlaceholderImage from '../components/ui/PlaceholderImage';
import OptimizedImage from '../components/ui/OptimizedImage';
import useLockBodyScroll from '../hooks/useLockBodyScroll';

// ── Color swatch mapping ────────────────────────────────────────────────────
const CSS_COLOR_MAP: Record<string, string> = {
  red: '#DC2626', blue: '#2563EB', green: '#16A34A', black: '#000000',
  white: '#FFFFFF', yellow: '#EAB308', orange: '#EA580C', purple: '#9333EA',
  pink: '#EC4899', gray: '#6B7280', grey: '#6B7280', brown: '#92400E',
  navy: '#1E3A5A', teal: '#0D9488', maroon: '#7F1D1D', coral: '#F97316',
  gold: '#CA8A04', silver: '#9CA3AF', beige: '#D4C5A9', ivory: '#FFFFF0',
  charcoal: '#374151', cream: '#FFFDD0', tan: '#D2B48C', olive: '#65A30D',
  burgundy: '#800020', lavender: '#A78BFA', turquoise: '#06B6D4',
  salmon: '#FA8072', khaki: '#BDB76B', mint: '#A7F3D0', rose: '#F43F5E',
  slate: '#64748B', indigo: '#4F46E5', cyan: '#06B6D4', magenta: '#D946EF',
  lime: '#84CC16', aqua: '#22D3EE',
};

/** True when the option-type key represents a colour dimension */
const isColorOptionType = (key: string): boolean => /colou?r/i.test(key);

/** "size" → "Size", "shirt_color" → "Shirt color" */
const formatOptionLabel = (key: string): string =>
  key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

/** Resolve a human colour name to a hex string, or null */
const getColorCSS = (colorName: string): string | null => {
  const n = colorName.toLowerCase().trim();
  if (CSS_COLOR_MAP[n]) return CSS_COLOR_MAP[n];
  for (const [key, value] of Object.entries(CSS_COLOR_MAP)) {
    if (n.includes(key)) return value;
  }
  return null;
};

// ── Component ───────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<ProductFull | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const sizeGuideContentRef = useRef<HTMLDivElement | null>(null);
  
  const { addItem } = useCartStore();
  
  // Extract size chart image URL from product description
  const getSizeChartUrl = (): string | null => {
    if (!product?.description) return null;
    const imgMatch = product.description.match(/<img[^>]+src=["']([^"']+)["']/i);
    return imgMatch ? imgMatch[1] : null;
  };
  
  const sizeChartUrl = getSizeChartUrl();

  useEffect(() => {
    if (slug) {
      fetchProduct(slug);
    }
  }, [slug]);
  
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showSizeGuide) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showSizeGuide]);

  // ── Flexible variant option selectors ───────────────────────────────────

  /** Do any variants carry the `options` JSONB field? */
  const hasFlexibleOptions = useMemo(() => {
    if (!product?.variants) return false;
    return product.variants.some(
      v => v.options && typeof v.options === 'object' && Object.keys(v.options).length > 0
    );
  }, [product]);

  const showVariantSelectors = (product?.variants?.length || 0) > 1;

  /** Map of optionKey → ordered unique values (e.g. "size" → ["S","M","L"]) */
  const optionTypes = useMemo(() => {
    if (!product || !hasFlexibleOptions) return new Map<string, string[]>();

    const typesMap = new Map<string, Set<string>>();
    const typeOrder: string[] = [];

    product.variants.forEach(v => {
      if (v.options && typeof v.options === 'object') {
        Object.entries(v.options).forEach(([key, value]) => {
          if (!typesMap.has(key)) {
            typesMap.set(key, new Set());
            typeOrder.push(key);
          }
          typesMap.get(key)!.add(value as string);
        });
      }
    });

    const result = new Map<string, string[]>();
    typeOrder.forEach(key => {
      result.set(key, Array.from(typesMap.get(key)!));
    });
    return result;
  }, [product, hasFlexibleOptions]);

  /**
   * Cross-filtering: for each option type, which values still lead to at
   * least one existing variant given the *other* currently-selected options?
   */
  const availableValuesByType = useMemo(() => {
    if (!product || !hasFlexibleOptions) return new Map<string, Set<string>>();

    const result = new Map<string, Set<string>>();

    for (const [optionKey] of optionTypes) {
      const available = new Set<string>();
      const otherSelections = Object.entries(selectedOptions).filter(([k]) => k !== optionKey);

      product.variants.forEach(v => {
        if (!v.options) return;
        const matchesOthers = otherSelections.every(([k, val]) => v.options![k] === val);
        if (matchesOthers && v.options[optionKey]) {
          available.add(v.options[optionKey]);
        }
      });

      result.set(optionKey, available);
    }
    return result;
  }, [product, hasFlexibleOptions, optionTypes, selectedOptions]);

  /** The single variant that matches every selected option (or null). */
  const matchedVariant = useMemo(() => {
    if (!product || !hasFlexibleOptions) return null;
    if (Object.keys(selectedOptions).length === 0) return null;

    const allKeys = Array.from(optionTypes.keys());
    if (!allKeys.every(k => selectedOptions[k])) return null; // partial selection

    return (
      product.variants.find(v =>
        v.options && allKeys.every(k => v.options![k] === selectedOptions[k])
      ) ?? null
    );
  }, [product, hasFlexibleOptions, selectedOptions, optionTypes]);

  // Auto-select options from the first available variant when product loads
  useEffect(() => {
    if (product && hasFlexibleOptions && product.variants.length > 0) {
      const first =
        product.variants.find(v => v.actually_available !== false) ?? product.variants[0];
      if (first.options && Object.keys(first.options).length > 0) {
        setSelectedOptions({ ...first.options });
      }
    }
  }, [product, hasFlexibleOptions]);

  // Keep selectedVariant in sync with option-based matching
  useEffect(() => {
    if (!hasFlexibleOptions) return;
    if (matchedVariant) {
      setSelectedVariant(matchedVariant);
      setQuantity(1);
    } else if (Object.keys(selectedOptions).length > 0) {
      setSelectedVariant(null);
    }
  }, [matchedVariant, hasFlexibleOptions, selectedOptions]);

  const handleOptionSelect = (optionKey: string, value: string) => {
    setSelectedOptions(prev => ({ ...prev, [optionKey]: value }));
  };

  /**
   * For a given option value + all other current selections, find the matching
   * variant (if all option types are selected).  Returns null when a partial
   * selection means we can't identify a unique variant.
   */
  const findVariantForOption = (optionKey: string, value: string): ProductVariant | null => {
    if (!product) return null;
    const testOptions = { ...selectedOptions, [optionKey]: value };
    const allKeys = Array.from(optionTypes.keys());
    if (!allKeys.every(k => testOptions[k])) return null;
    return (
      product.variants.find(v =>
        v.options && allKeys.every(k => v.options![k] === testOptions[k])
      ) ?? null
    );
  };

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchProduct = async (productSlug: string) => {
    try {
      setLoading(true);
      const data = await productsApi.getProduct(productSlug);
      setProduct(data);
      
      // For products with variants, select the first one
      // For products without variants (product-level inventory), we don't need a variant
      if (data.variants && data.variants.length > 0) {
        setSelectedVariant(data.variants[0]);
      } else {
        // No variants - product-level or no-tracking inventory
        setSelectedVariant(null);
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to load product');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useLockBodyScroll(showSizeGuide);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto mb-4"></div>
          <p className="text-warm-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Product not found'}</p>
          <Link to="/products" className="text-tsPrimary hover:underline">
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  const displayPrice = selectedVariant ? selectedVariant.price_cents : product.base_price_cents;
  const displayImages = product.images.length > 0 ? product.images : [{ id: 0, url: '', alt_text: product.name, position: 0, primary: true }];
  
  // Determine if product is actually available based on inventory level
  const isProductAvailable = product.actually_available !== false && product.in_stock;
  
  // Determine variant availability (only if variants exist)
  const hasVariants = product.variants && product.variants.length > 0;
  const isVariantAvailable = hasVariants && selectedVariant ? 
    (selectedVariant.actually_available !== false) : 
    true; // No variants needed = always "available" from variant perspective
  
  // Determine max quantity based on inventory level
  const getMaxQuantity = () => {
    if (!product.inventory_level || product.inventory_level === 'none') {
      return 999; // No limit for non-tracked inventory
    }
    if (product.inventory_level === 'product') {
      return product.product_stock_quantity || 0;
    }
    if (product.inventory_level === 'variant' && selectedVariant) {
      return selectedVariant.stock_quantity || 0;
    }
    return 0;
  };
  
  const maxQuantity = getMaxQuantity();
  
  // For products WITH variants: require selectedVariant
  // For products WITHOUT variants (product-level inventory): no variant needed
  const canAddToCart = hasVariants 
    ? (isProductAvailable && isVariantAvailable && selectedVariant && quantity > 0 && quantity <= maxQuantity)
    : (isProductAvailable && quantity > 0 && quantity <= maxQuantity);
  
  const handleAddToCart = async () => {
    if (!selectedVariant || !canAddToCart) {
      return;
    }
    
    if (isAdding) {
      return;
    }
    
    setIsAdding(true);
    try {
      await addItem(selectedVariant.id, quantity);
      // Reset quantity after successful add
      setQuantity(1);
    } catch (error) {
      // Error is handled in the store
      console.error('Add to cart error:', error);
    } finally {
      setIsAdding(false);
    }
  };
  
  const handleVariantChange = (variant: ProductVariant) => {
    setSelectedVariant(variant);
    // Reset quantity to 1 when switching variants
    setQuantity(1);
  };

  // ── Render helpers for flexible option selectors ────────────────────────

  /** Render a row of colour swatches for a "color"-type option. */
  const renderColorSelector = (optionKey: string, values: string[]) => {
    const availableValues = availableValuesByType.get(optionKey) ?? new Set<string>();

    return (
      <div className="flex flex-wrap gap-3">
        {values.map(value => {
          const isAvailable = availableValues.has(value);
          const isSelected = selectedOptions[optionKey] === value;
          const cssColor = getColorCSS(value);
          const variant = findVariantForOption(optionKey, value);
          const variantInStock = variant ? variant.actually_available !== false : isAvailable;

          return (
            <button
              key={value}
              onClick={() => handleOptionSelect(optionKey, value)}
              disabled={!isAvailable}
              title={value + (!variantInStock ? ' (Out of Stock)' : '')}
              className={`relative w-10 h-10 rounded-full border-2 transition-all ${
                isSelected
                  ? 'border-tsPrimary ring-2 ring-tsPrimary/30 scale-110'
                  : isAvailable && variantInStock
                    ? 'border-warm-300 hover:border-tsPrimary hover:scale-105'
                    : 'border-warm-200 opacity-40 cursor-not-allowed'
              }`}
            >
              {cssColor ? (
                <span
                  className="absolute inset-1 rounded-full"
                  style={{
                    backgroundColor: cssColor,
                    border: value.toLowerCase() === 'white' ? '1px solid #e5e7eb' : undefined,
                  }}
                />
              ) : (
                /* Unknown colour — show first letter on a neutral swatch */
                <span className="absolute inset-1 rounded-full bg-linear-to-br from-warm-200 to-warm-300 flex items-center justify-center text-xs font-bold text-warm-600">
                  {value.charAt(0).toUpperCase()}
                </span>
              )}
              {/* Diagonal strike-through for out-of-stock */}
              {!variantInStock && isAvailable && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="block w-full h-0.5 bg-warm-400 rotate-45" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  /** Render a row of text buttons for a non-colour option type. */
  const renderButtonSelector = (optionKey: string, values: string[]) => {
    const availableValues = availableValuesByType.get(optionKey) ?? new Set<string>();

    return (
      <div className="flex flex-wrap gap-2">
        {values.map(value => {
          const isAvailable = availableValues.has(value);
          const isSelected = selectedOptions[optionKey] === value;
          const variant = findVariantForOption(optionKey, value);
          const variantInStock = variant ? variant.actually_available !== false : isAvailable;
          const showStockWarning =
            variant &&
            product.inventory_level === 'variant' &&
            variant.stock_quantity !== undefined &&
            variant.stock_quantity > 0 &&
            variant.stock_quantity <= 5;

          // Price difference relative to base price
          const priceDiff =
            variant && variant.price_cents !== product.base_price_cents
              ? variant.price_cents - product.base_price_cents
              : null;

          return (
            <button
              key={value}
              onClick={() => handleOptionSelect(optionKey, value)}
              disabled={!isAvailable}
              className={`px-4 py-2.5 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'border-tsPrimary bg-red-50 text-tsPrimary font-semibold'
                  : isAvailable && variantInStock
                    ? 'border-warm-300 hover:border-tsPrimary text-warm-700'
                    : isAvailable && !variantInStock
                      ? 'border-warm-200 bg-warm-50 text-warm-400 cursor-not-allowed'
                      : 'border-warm-200 bg-warm-50 text-warm-300 cursor-not-allowed'
              }`}
            >
              <span className="text-sm font-medium">{value}</span>
              {priceDiff !== null && priceDiff !== 0 && (
                <span className={`block text-xs ${priceDiff > 0 ? 'text-warm-500' : 'text-green-600'}`}>
                  {priceDiff > 0 ? '+' : '−'}
                  {formatPrice(Math.abs(priceDiff))}
                </span>
              )}
              {!variantInStock && isAvailable && (
                <span className="block text-xs text-warm-400">Out of Stock</span>
              )}
              {variantInStock && showStockWarning && (
                <span className="block text-xs text-orange-600">
                  Only {variant!.stock_quantity} left
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-warm-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={
            product.collections && product.collections.length > 0
              ? [
                  { label: 'Shop', path: '/products' },
                  { label: product.collections[0].name, path: `/collections/${product.collections[0].slug}` },
                  { label: product.name }
                ]
              : [
                  { label: 'Shop', path: '/products' },
                  { label: product.name }
                ]
          }
        />

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-warm-100">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Images */}
            <div className="p-6 sm:p-8 lg:p-10 bg-warm-50/50">
              {/* Main Image */}
              <div className="bg-white rounded-xl overflow-hidden mb-4 shadow-sm border border-warm-100" style={{ aspectRatio: '1/1' }}>
                {displayImages[selectedImageIndex].url ? (
                  <OptimizedImage
                    src={displayImages[selectedImageIndex].url}
                    alt={displayImages[selectedImageIndex].alt_text}
                    context="detail"
                    priority={selectedImageIndex === 0}
                    fetchPriority={selectedImageIndex === 0 ? 'high' : 'auto'}
                    className="w-full h-full object-contain bg-white hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <PlaceholderImage variant="detail" />
                )}
              </div>

              {/* Thumbnail Gallery */}
              {product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {product.images.map((image, index) => (
                    <button
                      key={image.id}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`bg-white rounded-lg overflow-hidden border-2 transition-all hover:scale-105 shadow-sm ${
                        selectedImageIndex === index ? 'border-tsPrimary ring-2 ring-tsPrimary/20' : 'border-warm-200 hover:border-warm-300'
                      }`}
                      style={{ aspectRatio: '1/1' }}
                    >
                      <OptimizedImage
                        src={image.url}
                        alt={image.alt_text}
                        context="thumb"
                        className="w-full h-full object-contain bg-white"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="p-6 sm:p-8 lg:p-10 flex flex-col">
              {/* Collections */}
              {product.collections.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2">
                    {product.collections.map((collection) => (
                      <Link
                        key={collection.id}
                        to={`/collections/${collection.slug}`}
                        className="inline-flex items-center text-xs font-semibold bg-tsSurface text-warm-700 px-3 py-1 rounded-full hover:bg-tsGold/30 transition"
                      >
                        {collection.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Name & Price */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-warm-900 mb-3">{product.name}</h1>
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-3xl sm:text-4xl font-bold text-tsPrimary">
                  {formatPrice(displayPrice)}
                </span>
                {product.sale_price_cents && product.sale_price_cents < product.base_price_cents && (
                  <span className="text-xl text-warm-400 line-through">
                    {formatPrice(product.base_price_cents)}
                  </span>
                )}
              </div>

              {/* Description */}
              <div className="mb-8">
                <div 
                  className="prose prose-sm text-warm-700 mb-4"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
                
                {/* Size Guide Button */}
                {sizeChartUrl && (
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide(true)}
                    className="inline-flex items-center px-4 py-2 border-2 border-tsPrimary text-tsPrimary hover:bg-tsPrimary hover:text-white font-semibold rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Size Guide
                  </button>
                )}
              </div>

              {/* ── Variant / Option Selectors ────────────────────────── */}
              {showVariantSelectors &&
                (hasFlexibleOptions ? (
                  /* Grouped option selectors (Size, Color, Material, etc.) */
                  <div className="mb-8 space-y-5">
                    {Array.from(optionTypes.entries()).map(([optionKey, values]) => (
                      <div key={optionKey}>
                        <label className="block text-sm font-semibold text-warm-900 mb-2">
                          {formatOptionLabel(optionKey)}
                          {selectedOptions[optionKey] && (
                            <span className="ml-2 font-normal text-warm-600">
                              — {selectedOptions[optionKey]}
                            </span>
                          )}
                        </label>

                        {isColorOptionType(optionKey)
                          ? renderColorSelector(optionKey, values)
                          : renderButtonSelector(optionKey, values)}
                      </div>
                    ))}

                    {/* Warning when matched variant is out of stock */}
                    {matchedVariant && matchedVariant.actually_available === false && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600 font-medium">
                          This combination is currently out of stock.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Legacy flat variant grid (backward compatibility) */
                  product.variants.length > 0 && (
                    <div className="mb-8">
                      <label className="block text-sm font-semibold text-warm-900 mb-3">
                        Select Option:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {product.variants.map((variant) => {
                          const variantAvailable = variant.actually_available !== false;
                          const showStockWarning = product.inventory_level === 'variant' && 
                                                 variant.stock_quantity !== undefined && 
                                                 variant.stock_quantity > 0 && 
                                                 variant.stock_quantity <= 5;
                          
                          return (
                            <button
                              key={variant.id}
                              onClick={() => handleVariantChange(variant)}
                              disabled={!variantAvailable}
                              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                                selectedVariant?.id === variant.id
                                  ? 'border-tsPrimary bg-red-50 text-tsPrimary'
                                  : variantAvailable
                                  ? 'border-warm-300 hover:border-tsPrimary'
                                  : 'border-warm-200 bg-warm-50 text-warm-400 cursor-not-allowed'
                              }`}
                            >
                              <div className="text-sm font-medium">{variant.display_name}</div>
                              {!variantAvailable && (
                                <div className="text-xs">Out of Stock</div>
                              )}
                              {variantAvailable && showStockWarning && (
                                <div className="text-xs text-orange-600">Only {variant.stock_quantity} left</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                ))}

              {/* Quantity Selector */}
              {isVariantAvailable && selectedVariant && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-warm-900 mb-3">
                    Quantity:
                  </label>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-11 h-11 flex items-center justify-center border-2 border-warm-300 rounded-lg hover:border-tsPrimary transition"
                      disabled={quantity <= 1}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setQuantity(Math.min(Math.max(1, val), maxQuantity));
                      }}
                      className="w-16 h-11 text-center text-lg font-semibold border-2 border-warm-300 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={1}
                      max={maxQuantity}
                    />
                    <button
                      onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                      className="w-11 h-11 flex items-center justify-center border-2 border-warm-300 rounded-lg hover:border-tsPrimary transition"
                      disabled={quantity >= maxQuantity}
                    >
                      +
                    </button>
                    {product.inventory_level !== 'none' && maxQuantity > 0 && (
                      <span className="text-sm text-warm-600">
                        {maxQuantity} available
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Add to Cart Button */}
              <div className="mt-auto pt-6">
                <button
                  onClick={handleAddToCart}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 ${
                    canAddToCart && !isAdding
                      ? 'btn-primary shadow-lg hover:shadow-xl'
                      : 'bg-warm-200 text-warm-400 cursor-not-allowed'
                  }`}
                  disabled={!canAddToCart || isAdding}
                >
                  {isAdding ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Adding to Cart...
                    </>
                  ) : !product.in_stock || !selectedVariant?.in_stock ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Out of Stock
                    </>
                  ) : !selectedVariant ? (
                    'Select an Option'
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Add to Cart
                    </>
                  )}
                </button>

                {/* Trust Badges */}
                <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t border-warm-100">
                  <div className="flex items-center gap-2 text-sm text-warm-500">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Secure Checkout
                  </div>
                  <div className="flex items-center gap-2 text-sm text-warm-500">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    Fast Shipping
                  </div>
                </div>
              </div>

              {/* Product Details */}
              <div className="mt-8 pt-6 border-t border-warm-100">
                <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider mb-4">Product Details</h3>
                <dl className="space-y-3">
                  {product.vendor && (
                    <div className="flex items-center">
                      <dt className="text-warm-500 w-28 text-sm">Vendor</dt>
                      <dd className="text-warm-900 font-medium text-sm">{product.vendor}</dd>
                    </div>
                  )}
                  {selectedVariant && (
                    <>
                      <div className="flex items-center">
                        <dt className="text-warm-500 w-28 text-sm">SKU</dt>
                        <dd className="text-warm-900 font-mono text-sm bg-warm-50 px-2 py-0.5 rounded">{selectedVariant.sku}</dd>
                      </div>
                      {selectedVariant.weight_oz && (
                        <div className="flex items-center">
                          <dt className="text-warm-500 w-28 text-sm">Weight</dt>
                          <dd className="text-warm-900 text-sm">{selectedVariant.weight_oz} oz</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </div>
            </div>
          </div>
        </div>
        
        {/* Size Guide Modal */}
        {showSizeGuide && sizeChartUrl && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
            onClick={() => setShowSizeGuide(false)}
          >
            <div 
              className="relative bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col min-h-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-white border-b px-6 py-4 flex items-center justify-between z-10 shrink-0">
                <h3 className="text-xl font-bold text-warm-900">Size Guide</h3>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(false)}
                  className="text-warm-400 hover:text-warm-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Image Content */}
              <div
                ref={sizeGuideContentRef}
                className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain"
                onWheel={(event) => {
                  if (sizeGuideContentRef.current) {
                    sizeGuideContentRef.current.scrollTop += event.deltaY;
                  }
                  event.stopPropagation();
                  event.preventDefault();
                }}
              >
                <img
                  src={sizeChartUrl}
                  alt="Size Chart"
                  className="w-full h-auto"
                  style={{ maxHeight: '70vh', objectFit: 'contain' }}
                />
                <p className="text-sm text-warm-500 mt-4 text-center">
                  Click outside to close
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
