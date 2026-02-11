import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Save } from 'lucide-react';
import { authPost } from '../../services/authApi';
import toast from 'react-hot-toast';

interface ProductFormData {
  name: string;
  slug: string;
  description: string;
  base_price_cents: number;
  inventory_level: 'none' | 'product' | 'variant';
  product_stock_quantity: number | undefined;
  featured: boolean;
  published: boolean;
}

interface CreatedFundraiserProductResponse {
  product: {
    id: number;
  };
}

export default function AdminFundraiserProductFormPage() {
  const { fundraiserId } = useParams<{ fundraiserId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    slug: '',
    description: '',
    base_price_cents: 0,
    inventory_level: 'none',
    product_stock_quantity: undefined,
    featured: false,
    published: true,
  });

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      // Auto-generate slug if user hasn't manually edited it
      slug: prev.slug === '' || prev.slug === generateSlug(prev.name) 
        ? generateSlug(name) 
        : prev.slug,
    }));
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }

    setSaving(true);
    try {
      // Build the product payload
      const payload: Record<string, unknown> = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description,
        base_price_cents: formData.base_price_cents,
        inventory_level: formData.inventory_level,
        featured: formData.featured,
        published: formData.published,
      };

      // Only include product_stock_quantity if inventory is tracked at product level
      if (formData.inventory_level === 'product') {
        payload.product_stock_quantity = formData.product_stock_quantity || 0;
      }

      await authPost<CreatedFundraiserProductResponse>(
        `/admin/fundraisers/${fundraiserId}/products`,
        { product: payload },
        getToken
      );

      toast.success('Product created successfully');
      navigate(`/admin/fundraisers/${fundraiserId}?tab=products`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { errors?: string[] } } };
      toast.error(err.response?.data?.errors?.[0] || 'Failed to create product');
    } finally {
      setSaving(false);
    }
  };

  const priceInDollars = (formData.base_price_cents / 100).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to={`/admin/fundraisers/${fundraiserId}`}
          className="btn-icon hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Create Fundraiser Product</h1>
          <p className="text-sm text-gray-600 mt-1">
            Add a new product to this fundraiser
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow">
        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Basic Information</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                placeholder="e.g., Fundraiser T-Shirt"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Slug
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                placeholder="auto-generated-from-name"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank to auto-generate from name
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                placeholder="Describe this product..."
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Pricing</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Price
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceInDollars}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    base_price_cents: Math.round(parseFloat(e.target.value || '0') * 100) 
                  })}
                  className="w-full pl-8 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                />
              </div>
            </div>
          </div>

          {/* Inventory */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Inventory</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inventory Tracking
              </label>
              <select
                value={formData.inventory_level}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  inventory_level: e.target.value as 'none' | 'product' | 'variant',
                  product_stock_quantity: e.target.value === 'product' ? (formData.product_stock_quantity || 0) : undefined
                })}
                className="w-full max-w-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
              >
                <option value="none">Don't track inventory</option>
                <option value="product">Track at product level</option>
                <option value="variant">Track at variant level</option>
              </select>
            </div>

            {formData.inventory_level === 'product' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.product_stock_quantity || 0}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    product_stock_quantity: parseInt(e.target.value) || 0 
                  })}
                  className="w-full max-w-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                />
              </div>
            )}
          </div>

          {/* Visibility */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Visibility</h3>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.published}
                  onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-tsPrimary focus:ring-tsPrimary"
                />
                <div>
                  <span className="font-medium text-gray-900">Published</span>
                  <p className="text-xs text-gray-500">Product is visible on the fundraiser page</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-tsPrimary focus:ring-tsPrimary"
                />
                <div>
                  <span className="font-medium text-gray-900">Featured</span>
                  <p className="text-xs text-gray-500">Highlight this product</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t rounded-b-lg flex justify-end gap-3">
          <Link
            to={`/admin/fundraisers/${fundraiserId}`}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Creating...' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
