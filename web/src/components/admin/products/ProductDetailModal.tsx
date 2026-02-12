import { useRef, useState } from 'react';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import { useNavigate } from 'react-router-dom';
import { X, Edit, AlertTriangle } from 'lucide-react';
import type { DetailedProduct } from './productUtils';
import { formatCurrency, getVariantStatus } from './productUtils';
import PlaceholderImage from '../../ui/PlaceholderImage';

interface ProductDetailModalProps {
  product: DetailedProduct;
  loading: boolean;
  onClose: () => void;
}

export default function ProductDetailModal({ product, loading, onClose }: ProductDetailModalProps) {
  useLockBodyScroll(true);

  const navigate = useNavigate();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/10"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col min-h-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto" />
            <p className="mt-4 text-gray-600">Loading product details...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
              <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
              <button
                onClick={onClose}
                className="btn-icon min-w-[44px] min-h-[44px] p-2 text-gray-400 hover:text-gray-600 transition"
                aria-label="Close product details"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div
              ref={modalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 overscroll-contain"
              onWheel={(event) => {
                if (modalContentRef.current) {
                  modalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              {/* Needs Attention Banner */}
              {product.needs_attention && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Needs Attention</p>
                    {product.import_notes && (
                      <p className="text-sm text-amber-700 mt-1">{product.import_notes}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Product Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Images */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Product Images</h3>
                  {product.images && product.images.length > 0 ? (
                    <div className="space-y-3">
                      <div className="bg-white rounded-lg overflow-hidden border border-gray-200" style={{ aspectRatio: '1/1' }}>
                        {product.images[selectedImageIndex]?.url || product.images[0]?.url ? (
                          <img
                            src={product.images[selectedImageIndex]?.url || product.images[0]?.url}
                            alt={product.images[selectedImageIndex]?.alt_text || product.name}
                            className="w-full h-full"
                            style={{ objectFit: 'contain', backgroundColor: 'white' }}
                          />
                        ) : (
                          <PlaceholderImage variant="detail" className="bg-gray-100" />
                        )}
                      </div>
                      {product.images.length > 1 && (
                        <div className="grid grid-cols-4 gap-2">
                          {product.images.map((image, index) => (
                            <button
                              key={image.id}
                              onClick={() => setSelectedImageIndex(index)}
                              className={`bg-white rounded-lg overflow-hidden border-2 transition ${
                                selectedImageIndex === index ? 'border-tsPrimary' : 'border-gray-200 hover:border-gray-300'
                              }`}
                              style={{ aspectRatio: '1/1' }}
                            >
                              {image.url ? (
                                <img
                                  src={image.url}
                                  alt={image.alt_text || product.name}
                                  className="w-full h-full"
                                  style={{ objectFit: 'contain', backgroundColor: 'white' }}
                                />
                              ) : (
                                <PlaceholderImage variant="thumbnail" className="bg-gray-100" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
                      <PlaceholderImage variant="detail" className="bg-gray-100" />
                    </div>
                  )}
                </div>

                {/* Basic Info */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Product Details</h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-gray-600">Base Price:</dt>
                      <dd className="text-gray-900 font-semibold text-lg">{formatCurrency(product.base_price_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Status:</dt>
                      <dd>
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          product.archived ? 'bg-orange-100 text-orange-800' :
                          product.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {product.archived ? 'Archived' : product.published ? 'Published' : 'Draft'}
                        </span>
                        {product.featured && (
                          <span className="ml-2 px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Featured</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Type:</dt>
                      <dd className="text-gray-900">{product.product_type || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Vendor:</dt>
                      <dd className="text-gray-900">{product.vendor || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Weight:</dt>
                      <dd className="text-gray-900">{product.weight_oz} oz</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">In Stock:</dt>
                      <dd className={`font-semibold ${product.in_stock ? 'text-green-600' : 'text-red-600'}`}>
                        {product.in_stock ? 'Yes' : 'No'}
                        {product.inventory_level === 'product' && product.product_stock_quantity != null && (
                          <span className="ml-2 text-sm font-normal">({product.product_stock_quantity} available)</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Inventory Tracking:</dt>
                      <dd className="flex items-center gap-2">
                        {product.inventory_level === 'none' && (
                          <span className="text-sm px-2 py-1 bg-gray-100 text-gray-700 rounded">Not tracked</span>
                        )}
                        {product.inventory_level === 'product' && (
                          <>
                            <span className="text-sm px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium">Product Level</span>
                            <span className="text-sm text-gray-600">({product.product_stock_quantity || 0} total)</span>
                          </>
                        )}
                        {product.inventory_level === 'variant' && (
                          <>
                            <span className="text-sm px-2 py-1 bg-purple-100 text-purple-700 rounded font-medium">Variant Level</span>
                            <span className="text-sm text-gray-600">({product.total_variant_stock || 0} total across variants)</span>
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                {product.description ? (
                  <div className="text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: product.description }} />
                ) : (
                  <p className="text-gray-500 italic">No description available.</p>
                )}
              </div>

              {/* Collections */}
              {product.collections.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Collections</h3>
                  <div className="flex flex-wrap gap-2">
                    {product.collections.map((c) => (
                      <span key={c.id} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{c.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Variants */}
              {product.variants && product.variants.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Variants ({product.variants.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Option</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {product.variants.map((variant) => {
                          const status = getVariantStatus(variant, product.inventory_level);
                          return (
                            <tr key={variant.id}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{variant.sku}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{variant.display_name}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(variant.price_cents)}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                {product.inventory_level === 'variant' ? (
                                  <span className={`font-medium ${
                                    variant.stock_quantity > 10 ? 'text-green-600' :
                                    variant.stock_quantity > 0 ? 'text-amber-600' : 'text-red-600'
                                  }`}>
                                    {variant.stock_quantity}
                                    {variant.stock_quantity === 0 && (
                                      <span className="ml-1 text-xs px-1.5 py-0.5 bg-red-100 text-red-800 rounded">Out</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">--</span>
                                )}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${status.className}`}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => { onClose(); navigate(`/admin/products/${product.id}/edit`); }}
                className="btn-primary flex-1 inline-flex items-center justify-center"
              >
                <Edit className="w-5 h-5 mr-2" /> Edit Product
              </button>
              <button
                onClick={onClose}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
