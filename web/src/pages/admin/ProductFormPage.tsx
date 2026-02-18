import axios from 'axios';
import { useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { ArrowLeft, Save, X, Archive, AlertTriangle, History } from 'lucide-react';
import ImageUpload from '../../components/ImageUpload';
import VariantManager from '../../components/VariantManager';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { authDelete, authGet, authPost, authPut } from '../../services/authApi';

interface InventoryAudit {
  id: number;
  audit_type: string;
  quantity_change: number;
  formatted_change: string;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  created_at: string;
  display_name: string;
  user: string;
  variant?: {
    id: number;
    sku: string;
    display_name: string;
  };
}

interface ProductImage {
  id: number;
  url: string;
  alt_text?: string;
  position: number;
  primary: boolean;
}

interface Collection {
  id: number;
  name: string;
  slug: string;
  product_count?: number;
}

interface LocationOption {
  id: number;
  name: string;
  slug: string;
  active: boolean;
}

interface ProductFormData {
  name: string;
  description: string;
  product_type: string;
  vendor: string;
  base_price_cents: number;
  weight_oz: number;
  published: boolean;
  featured: boolean;
  meta_title: string;
  meta_description: string;
  inventory_level: 'none' | 'product' | 'variant';
  product_stock_quantity?: number;
  product_low_stock_threshold?: number;
  allow_pickup: boolean;
  allow_shipping: boolean;
  location_ids: number[];
  collection_ids: number[];
  needs_attention?: boolean;
  import_notes?: string;
}

interface ProductDetailsResponse {
  data: {
    id: number;
    name?: string;
    description?: string;
    product_type?: string;
    vendor?: string;
    base_price_cents?: number;
    weight_oz?: number;
    published?: boolean;
    featured?: boolean;
    meta_title?: string;
    meta_description?: string;
    inventory_level?: 'none' | 'product' | 'variant';
    product_stock_quantity?: number;
    product_low_stock_threshold?: number;
    allow_pickup?: boolean;
    allow_shipping?: boolean;
    location_ids?: number[];
    collection_ids?: number[];
    needs_attention?: boolean;
    import_notes?: string;
    archived?: boolean;
    images?: ProductImage[];
  };
}

interface CollectionsResponse {
  data: Collection[];
}

interface LocationsResponse {
  data: LocationOption[];
}

interface InventoryAuditsResponse {
  audits: InventoryAudit[];
}

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [images, setImages] = useState<ProductImage[]>([]);
  const deleteModalContentRef = useRef<HTMLDivElement | null>(null);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [allLocations, setAllLocations] = useState<LocationOption[]>([]);
  
  // Inventory History Modal state
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryAudits, setInventoryAudits] = useState<InventoryAudit[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const inventoryModalContentRef = useRef<HTMLDivElement | null>(null);
  const collectionsScrollRef = useRef<HTMLDivElement | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    product_type: 'apparel',
    vendor: 'Three Squares',
    base_price_cents: 0,
    weight_oz: 0,
    published: false,
    featured: false,
    meta_title: '',
    meta_description: '',
    inventory_level: 'none',
    product_stock_quantity: undefined,
    product_low_stock_threshold: 5,
    allow_pickup: true,
    allow_shipping: false,
    location_ids: [],
    collection_ids: [],
  });

  useEffect(() => {
    fetchCollections();
    fetchLocations();
    if (isEditMode) {
      fetchProduct();
    }
  }, [id]);

  const fetchCollections = async () => {
    try {
      // Fetch ALL collections (including unpublished) for admin use
      const response = await authGet<CollectionsResponse>('/admin/collections', getToken);
      setAllCollections(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await authGet<LocationsResponse>('/admin/locations', getToken);
      setAllLocations(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
  };

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const response = await authGet<ProductDetailsResponse>(`/admin/products/${id}`, getToken);
      
      // Backend wraps response in { success: true, data: {...} }
      const product = response.data.data || response.data;
      
      setIsArchived(product.archived || false);
      
      setFormData({
        name: product.name || '',
        description: product.description || '',
        product_type: product.product_type || 'apparel',
        vendor: product.vendor || 'Three Squares',
        base_price_cents: product.base_price_cents || 0,
        weight_oz: product.weight_oz || 0,
        published: product.published || false,
        featured: product.featured || false,
        meta_title: product.meta_title || '',
        meta_description: product.meta_description || '',
        inventory_level: product.inventory_level || 'none',
        product_stock_quantity: product.product_stock_quantity,
        product_low_stock_threshold: product.product_low_stock_threshold || 5,
        allow_pickup: product.allow_pickup ?? true,
        allow_shipping: product.allow_shipping ?? false,
        location_ids: product.location_ids || [],
        collection_ids: product.collection_ids || [],
        needs_attention: product.needs_attention || false,
        import_notes: product.import_notes || '',
      });
      
      // Load images
      setImages(product.images || []);
    } catch (err) {
      console.error('Failed to fetch product:', err);
      toast.error('Failed to load product');
      navigate('/admin/products');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === 'base_price_cents' || name === 'weight_oz') {
      // Convert dollars to cents for price
      const numValue = name === 'base_price_cents' 
        ? Math.round(parseFloat(value || '0') * 100)
        : parseFloat(value || '0');
      setFormData(prev => ({
        ...prev,
        [name]: numValue,
      }));
    } else if (name === 'product_stock_quantity' || name === 'product_low_stock_threshold') {
      // Handle inventory numbers
      const numValue = parseInt(value || '0');
      setFormData(prev => ({
        ...prev,
        [name]: isNaN(numValue) ? undefined : numValue,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const fetchInventoryAudits = async () => {
    if (!id) return;
    
    setLoadingAudits(true);
    try {
      const response = await authGet<InventoryAuditsResponse>(`/admin/products/${id}/inventory_audits`, getToken);
      setInventoryAudits(response.data.audits || []);
    } catch (err) {
      console.error('Failed to fetch inventory audits:', err);
      toast.error('Failed to load inventory history');
    } finally {
      setLoadingAudits(false);
    }
  };

  const handleOpenInventoryModal = () => {
    setShowInventoryModal(true);
    fetchInventoryAudits();
  };

  const handleCollectionToggle = (collectionId: number) => {
    setFormData(prev => {
      const currentIds = prev.collection_ids || [];
      const newIds = currentIds.includes(collectionId)
        ? currentIds.filter(id => id !== collectionId)
        : [...currentIds, collectionId];
      return { ...prev, collection_ids: newIds };
    });
  };

  const handleLocationToggle = (locationId: number) => {
    setFormData(prev => {
      const currentIds = prev.location_ids || [];
      const newIds = currentIds.includes(locationId)
        ? currentIds.filter(id => id !== locationId)
        : [...currentIds, locationId];
      return { ...prev, location_ids: newIds };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (formData.base_price_cents <= 0) {
      toast.error('Price must be greater than 0');
      return;
    }
    if (!formData.allow_pickup && !formData.allow_shipping) {
      toast.error('Select at least one fulfillment type (pickup or shipping).');
      return;
    }
    if (formData.allow_pickup && formData.location_ids.length === 0) {
      toast.error('Select at least one pickup location.');
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        product: formData,
      };

      if (isEditMode) {
        const response = await authPut<ProductDetailsResponse>(`/admin/products/${id}`, payload, getToken);
        
        // Update form data with latest from server (in case anything changed)
        const updatedProduct = response.data.data || response.data;
        setFormData({
          name: updatedProduct.name || '',
          description: updatedProduct.description || '',
          product_type: updatedProduct.product_type || 'apparel',
          vendor: updatedProduct.vendor || 'Three Squares',
          base_price_cents: updatedProduct.base_price_cents || 0,
          weight_oz: updatedProduct.weight_oz || 0,
          published: updatedProduct.published || false,
          featured: updatedProduct.featured || false,
          meta_title: updatedProduct.meta_title || '',
          meta_description: updatedProduct.meta_description || '',
          inventory_level: updatedProduct.inventory_level || 'none',
          product_stock_quantity: updatedProduct.product_stock_quantity,
          product_low_stock_threshold: updatedProduct.product_low_stock_threshold || 5,
          allow_pickup: updatedProduct.allow_pickup ?? true,
          allow_shipping: updatedProduct.allow_shipping ?? false,
          location_ids: updatedProduct.location_ids || [],
          collection_ids: updatedProduct.collection_ids || [],
          needs_attention: updatedProduct.needs_attention || false,
          import_notes: updatedProduct.import_notes || '',
        });
        
        toast.success('Product updated successfully!', {
          duration: 3000,
          position: 'top-right',
        });
      } else {
        const response = await authPost<ProductDetailsResponse>('/admin/products', payload, getToken);
        
        toast.success('Product created successfully!', {
          duration: 3000,
          position: 'top-right',
        });
        
        // For new products, redirect to edit page so they can continue adding images/variants
        const newProduct = response.data.data || response.data;
        navigate(`/admin/products/${newProduct.id}/edit`);
      }
    } catch (err) {
      console.error('Failed to save product:', err);
      const errorMessage = axios.isAxiosError(err) ? err.response?.data?.error || err.response?.data?.message || 'Failed to save product' : 'Failed to save product';
      toast.error(errorMessage, {
        duration: 4000,
        position: 'top-right',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      setDeleting(true);
      await authDelete(`/admin/products/${id}`, getToken);
      
      toast.success('Product archived successfully!', {
        duration: 3000,
        position: 'top-right',
      });
      
      // Redirect to products list
      navigate('/admin/products');
    } catch (err) {
      console.error('Failed to archive product:', err);
      const errorMessage = axios.isAxiosError(err) ? err.response?.data?.error || err.response?.data?.message || 'Failed to archive product.' : 'Failed to archive product.';
      toast.error(errorMessage, {
        duration: 5000,
        position: 'top-right',
      });
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };
  
  const handleUnarchive = async () => {
    if (!id) return;
    
    try {
      setDeleting(true);
      await authPost(`/admin/products/${id}/unarchive`, {}, getToken);
      
      toast.success('Product unarchived successfully!', {
        duration: 3000,
        position: 'top-right',
      });
      
      // Refresh product data
      setIsArchived(false);
      await fetchProduct();
    } catch (err) {
      console.error('Failed to unarchive product:', err);
      const errorMessage = axios.isAxiosError(err) ? err.response?.data?.error || err.response?.data?.message || 'Failed to unarchive product.' : 'Failed to unarchive product.';
      toast.error(errorMessage, {
        duration: 5000,
        position: 'top-right',
      });
    } finally {
      setDeleting(false);
    }
  };

  useLockBodyScroll(showDeleteModal || showInventoryModal);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/products')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Products
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Product' : 'Add New Product'}
          </h1>
          {isEditMode && (
            <button
              type="button"
              onClick={handleOpenInventoryModal}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <History className="w-4 h-4" />
              View Inventory History
            </button>
          )}
        </div>
      </div>

      {/* Archived Banner */}
      {isArchived && (
        <div className="mb-6 bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 mr-3 shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-orange-800">This Product is Archived</h3>
                <p className="text-sm text-orange-700 mt-1">
                  This product is hidden from customers and won't appear in the store. You can unarchive it to make it available again.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={deleting}
              className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Unarchiving...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Unarchive Product
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Needs Attention Banner */}
      {id && formData.needs_attention && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-800">This product needs attention</p>
            {formData.import_notes && (
              <p className="text-sm text-amber-700 mt-1">{formData.import_notes}</p>
            )}
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, needs_attention: false, import_notes: '' }))}
              className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-800 underline"
            >
              Mark as resolved
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 pb-24">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic Information</h2>
          
          <div className="space-y-4">
            {/* Product Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                placeholder="e.g., Three Squares Fried Chicken"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                placeholder="Describe your product..."
              />
            </div>

            {/* Product Type */}
            <div>
              <label htmlFor="product_type" className="block text-sm font-medium text-gray-700 mb-1">
                Product Type
              </label>
              <select
                id="product_type"
                name="product_type"
                value={formData.product_type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
              >
                <option value="apparel">Apparel</option>
                <option value="accessories">Accessories</option>
                <option value="hats">Hats</option>
                <option value="bags">Bags</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Price & Weight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="base_price_cents" className="block text-sm font-medium text-gray-700 mb-1">
                  Base Price * ($)
                </label>
                <input
                  type="number"
                  id="base_price_cents"
                  name="base_price_cents"
                  value={(formData.base_price_cents / 100).toFixed(2)}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="29.99"
                />
              </div>

              <div>
                <label htmlFor="weight_oz" className="block text-sm font-medium text-gray-700 mb-1">
                  Weight * (oz)
                </label>
                <input
                  type="number"
                  id="weight_oz"
                  name="weight_oz"
                  value={formData.weight_oz}
                  onChange={handleChange}
                  step="0.1"
                  min="0.1"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="8.0"
                />
                <p className="text-xs text-gray-500 mt-1">Required for shipping calculations</p>
              </div>
            </div>

            {/* Visibility Settings */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="published"
                  name="published"
                  checked={formData.published}
                  onChange={handleChange}
                  className="w-4 h-4 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                />
                <label htmlFor="published" className="ml-2 text-sm font-medium text-gray-700">
                  Published (visible in store)
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="featured"
                  name="featured"
                  checked={formData.featured}
                  onChange={handleChange}
                  className="w-4 h-4 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                />
                <label htmlFor="featured" className="ml-2 text-sm font-medium text-gray-700">
                  Featured (show on homepage)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Fulfillment & Pickup Locations */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Fulfillment</h2>
          <p className="text-sm text-gray-600 mb-4">
            Choose whether this product supports pickup, shipping, or both.
          </p>

          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="allow_pickup"
                name="allow_pickup"
                checked={formData.allow_pickup}
                onChange={handleChange}
                className="w-4 h-4 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
              />
              <label htmlFor="allow_pickup" className="ml-2 text-sm font-medium text-gray-700">
                Allow Pickup
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="allow_shipping"
                name="allow_shipping"
                checked={formData.allow_shipping}
                onChange={handleChange}
                className="w-4 h-4 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
              />
              <label htmlFor="allow_shipping" className="ml-2 text-sm font-medium text-gray-700">
                Allow Shipping
              </label>
            </div>

            {formData.allow_pickup && (
              <div className="pt-2">
                <p className="text-sm font-medium text-gray-700 mb-2">Pickup Locations</p>
                {allLocations.length === 0 ? (
                  <p className="text-sm text-gray-500">No locations available.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-gray-300 rounded-lg p-4 bg-gray-50">
                    {allLocations.map((location) => (
                      <div key={location.id} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`location_${location.id}`}
                          checked={formData.location_ids.includes(location.id)}
                          onChange={() => handleLocationToggle(location.id)}
                          className="w-4 h-4 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                        />
                        <label htmlFor={`location_${location.id}`} className="ml-2 text-sm text-gray-700 cursor-pointer select-none">
                          {location.name}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Inventory Tracking */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Inventory Tracking</h2>
          <p className="text-sm text-gray-600 mb-4">
            Choose how to track inventory for this product
          </p>
          
          <div className="space-y-4">
            {/* Inventory Level Radio Buttons */}
            <div className="space-y-3">
              <div className="flex items-start">
                <input
                  type="radio"
                  id="inventory_none"
                  name="inventory_level"
                  value="none"
                  checked={formData.inventory_level === 'none'}
                  onChange={handleChange}
                  className="mt-1 w-4 h-4 text-tsPrimary border-gray-300 focus:ring-tsPrimary"
                />
                <label htmlFor="inventory_none" className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">
                    No Tracking
                  </span>
                  <span className="block text-xs text-gray-600">
                    Product is always available (digital products, services, unlimited items)
                  </span>
                </label>
              </div>

              <div className="flex items-start">
                <input
                  type="radio"
                  id="inventory_product"
                  name="inventory_level"
                  value="product"
                  checked={formData.inventory_level === 'product'}
                  onChange={handleChange}
                  className="mt-1 w-4 h-4 text-tsPrimary border-gray-300 focus:ring-tsPrimary"
                />
                <label htmlFor="inventory_product" className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">
                    Product Level
                  </span>
                  <span className="block text-xs text-gray-600">
                    Track one total quantity (e.g., "50 hats total" - variants optional for selection)
                  </span>
                </label>
              </div>

              <div className="flex items-start">
                <input
                  type="radio"
                  id="inventory_variant"
                  name="inventory_level"
                  value="variant"
                  checked={formData.inventory_level === 'variant'}
                  onChange={handleChange}
                  className="mt-1 w-4 h-4 text-tsPrimary border-gray-300 focus:ring-tsPrimary"
                />
                <label htmlFor="inventory_variant" className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">
                    Variant Level
                  </span>
                  <span className="block text-xs text-gray-600">
                    Track stock per size/color combination (e.g., "10 Red/Small, 5 Blue/Large")
                  </span>
                </label>
              </div>
            </div>

            {/* Product-Level Inventory Fields */}
            {formData.inventory_level === 'product' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="product_stock_quantity" className="block text-sm font-medium text-gray-700 mb-1">
                      Stock Quantity
                    </label>
                    <input
                      type="number"
                      id="product_stock_quantity"
                      name="product_stock_quantity"
                      value={formData.product_stock_quantity || ''}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label htmlFor="product_low_stock_threshold" className="block text-sm font-medium text-gray-700 mb-1">
                      Low Stock Threshold
                    </label>
                    <input
                      type="number"
                      id="product_low_stock_threshold"
                      name="product_low_stock_threshold"
                      value={formData.product_low_stock_threshold || 5}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                      placeholder="5"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get a warning when stock falls to or below this number
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Variant-Level Helper Text */}
            {formData.inventory_level === 'variant' && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Variant-level tracking:</strong> After saving this product, you can configure variants and set stock quantity for each size/color combination in the Variants section below.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Collections */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Collections</h2>
          <p className="text-sm text-gray-600 mb-4">
            Assign this product to one or more collections (categories)
          </p>
          
          {allCollections.length === 0 ? (
            <p className="text-gray-500 italic">No collections available. Create collections first.</p>
          ) : (
            <div>
              <div
                ref={collectionsScrollRef}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border border-gray-300 rounded-lg p-4 bg-gray-50 max-h-60 overflow-y-auto overscroll-contain touch-pan-y"
                onWheel={(event) => {
                  const container = collectionsScrollRef.current;
                  if (!container) return;
                  if (container.scrollHeight <= container.clientHeight) return;
                  container.scrollTop += event.deltaY;
                  event.stopPropagation();
                }}
              >
                {allCollections.map((collection) => (
                  <div key={collection.id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`collection_${collection.id}`}
                      checked={(formData.collection_ids || []).includes(collection.id)}
                      onChange={() => handleCollectionToggle(collection.id)}
                      className="w-4 h-4 text-tsPrimary border-gray-300 rounded focus:ring-tsPrimary"
                    />
                    <label htmlFor={`collection_${collection.id}`} className="ml-2 text-sm text-gray-700 cursor-pointer select-none">
                      {collection.name}
                      {collection.product_count !== undefined && (
                        <span className="text-xs text-gray-500 ml-1">({collection.product_count})</span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
              {allCollections.length > 18 && (
                <p className="text-xs text-gray-500 mt-2 italic flex items-center gap-1">
                  <span>↕️</span>
                  <span>Scroll to see more collections</span>
                </p>
              )}
              <p className="text-xs text-gray-600 mt-3 font-medium">
                {(formData.collection_ids || []).length} collection{(formData.collection_ids || []).length !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}
        </div>

        {/* Images & Variants - Only available after product creation */}
        {!isEditMode && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-800 font-medium mb-2">
              Images & Variants
            </p>
            <p className="text-blue-700 text-sm">
              Save this product first, then you can add images and configure variants on the edit page.
            </p>
          </div>
        )}

        {/* Image Upload - Only show in edit mode */}
        {isEditMode && id && (
          <ImageUpload
            productId={parseInt(id)}
            images={images}
            onImagesChange={setImages}
          />
        )}

        {/* Variant Manager - Only show in edit mode */}
        {isEditMode && id && (
          <VariantManager
            productId={parseInt(id)}
            basePriceCents={formData.base_price_cents}
            inventoryLevel={formData.inventory_level}
          />
        )}

        {/* Form Actions - Sticky Footer */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-5 mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 px-4 sm:px-6 py-3 sm:py-4">
            {/* Archive Button - Full width on mobile, left side on desktop */}
            {isEditMode && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className={`w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 rounded-lg transition flex items-center justify-center ${
                  isArchived
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={saving || deleting}
              >
                <Archive className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                <span className="text-sm sm:text-base">{isArchived ? 'Unarchive' : 'Archive'}</span>
              </button>
            )}
            
            {/* Right side buttons - Stack on mobile, row on desktop */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:ml-auto w-full sm:w-auto">
              <button
                type="button"
                onClick={() => navigate('/admin/products')}
                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center justify-center"
                disabled={saving || deleting}
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                <span className="text-sm sm:text-base">Cancel</span>
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                disabled={saving || deleting}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white mr-2"></div>
                    <span className="text-sm sm:text-base">Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    <span className="text-sm sm:text-base">{isEditMode ? 'Update Product' : 'Create Product'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/30" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[85vh] flex flex-col min-h-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center p-6 border-b border-gray-200 shrink-0">
              <div className="shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Archive Product</h3>
                <p className="text-sm text-gray-500">Product will be hidden from customers</p>
              </div>
            </div>

            {/* Body */}
            <div
              ref={deleteModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain"
              onWheel={(event) => {
                if (deleteModalContentRef.current) {
                  deleteModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <p className="text-gray-700 mb-2">
                Are you sure you want to archive <strong>{formData.name}</strong>?
              </p>
              <p className="text-sm text-gray-600">
                Archived products are:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>Hidden from customers and search</li>
                <li>Preserved with all data intact</li>
                <li>Can be unarchived anytime</li>
                <li>Will still show in order history</li>
              </ul>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> Archiving is safer than deleting. You can restore archived products later.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-primary-dark transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={deleting}
              >
                <Archive className="w-4 h-4 mr-2" />
                {deleting ? 'Archiving...' : 'Archive Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory History Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/30" onClick={() => setShowInventoryModal(false)}>
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[85vh] flex flex-col min-h-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <History className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Inventory History</h3>
                  <p className="text-sm text-gray-500">{formData.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowInventoryModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div
              ref={inventoryModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain"
              onWheel={(event) => {
                if (inventoryModalContentRef.current) {
                  inventoryModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              {loadingAudits ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tsPrimary"></div>
                </div>
              ) : inventoryAudits.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No inventory changes recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-600">Date</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-600">User</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-600">Action</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-600">Variant</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-600">Change</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-600">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryAudits.map((audit) => (
                        <tr key={audit.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 text-gray-700 whitespace-nowrap">
                            {new Date(audit.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-3 px-2 text-gray-600">{audit.user}</td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              audit.audit_type === 'order_placed' ? 'bg-orange-100 text-orange-700' :
                              audit.audit_type === 'order_cancelled' ? 'bg-red-100 text-red-700' :
                              audit.audit_type === 'restock' ? 'bg-green-100 text-green-700' :
                              audit.audit_type === 'manual_adjustment' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {audit.audit_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-gray-600">
                            {audit.variant?.display_name || '-'}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`font-medium ${
                              audit.quantity_change > 0 ? 'text-green-600' :
                              audit.quantity_change < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {audit.formatted_change}
                            </span>
                            <span className="text-gray-400 text-xs ml-1">
                              ({audit.previous_quantity} → {audit.new_quantity})
                            </span>
                          </td>
                          <td className="py-3 px-2 text-gray-600 max-w-xs truncate" title={audit.reason}>
                            {audit.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setShowInventoryModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

