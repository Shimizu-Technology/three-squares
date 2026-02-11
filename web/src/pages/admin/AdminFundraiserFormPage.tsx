import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Save } from 'lucide-react';
import { authGet, authPatch, authPost } from '../../services/authApi';
import toast from 'react-hot-toast';

interface FundraiserForm {
  name: string;
  slug: string;
  organization_name: string; // HAF-119: Required field for the organization running the fundraiser
  description: string;
  status: string;
  start_date: string;
  end_date: string;
  goal_amount_cents: string;
  payout_percentage: string; // HAF-119: Percentage of sales that go to the organization
  image_url: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  pickup_location: string;
  pickup_instructions: string;
  allow_shipping: boolean;
  shipping_note: string;
  public_message: string;
  thank_you_message: string;
}

const defaultForm: FundraiserForm = {
  name: '',
  slug: '',
  organization_name: '', // HAF-119
  description: '',
  status: 'draft',
  start_date: '',
  end_date: '',
  goal_amount_cents: '',
  payout_percentage: '0', // HAF-119
  image_url: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  pickup_location: '',
  pickup_instructions: '',
  allow_shipping: false,
  shipping_note: '',
  public_message: '',
  thank_you_message: '',
};

interface FundraiserEntity {
  id: number;
  name?: string;
  slug?: string;
  organization_name?: string;
  description?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  goal_amount_cents?: number;
  payout_percentage?: number;
  image_url?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  pickup_location?: string;
  pickup_instructions?: string;
  allow_shipping?: boolean;
  shipping_note?: string;
  public_message?: string;
  thank_you_message?: string;
}

interface FundraiserResponse {
  fundraiser: FundraiserEntity;
}

export default function AdminFundraiserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const isEditing = Boolean(id);
  
  const [form, setForm] = useState<FundraiserForm>(defaultForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (isEditing && id) {
      loadFundraiser();
    }
  }, [id]);

  const loadFundraiser = async () => {
    try {
      const response = await authGet<FundraiserResponse>(`/admin/fundraisers/${id}`, getToken);
      const f = response.data.fundraiser;
      setForm({
        name: f.name || '',
        slug: f.slug || '',
        organization_name: f.organization_name || '', // HAF-119
        description: f.description || '',
        status: f.status || 'draft',
        start_date: f.start_date || '',
        end_date: f.end_date || '',
        goal_amount_cents: f.goal_amount_cents ? (f.goal_amount_cents / 100).toString() : '',
        payout_percentage: f.payout_percentage?.toString() || '0', // HAF-119
        image_url: f.image_url || '',
        contact_name: f.contact_name || '',
        contact_email: f.contact_email || '',
        contact_phone: f.contact_phone || '',
        pickup_location: f.pickup_location || '',
        pickup_instructions: f.pickup_instructions || '',
        allow_shipping: f.allow_shipping || false,
        shipping_note: f.shipping_note || '',
        public_message: f.public_message || '',
        thank_you_message: f.thank_you_message || '',
      });
      if (f.slug) setSlugManuallyEdited(true);
    } catch (error) {
      toast.error('Failed to load fundraiser');
      navigate('/admin/fundraisers');
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      ...(slugManuallyEdited ? {} : { slug: generateSlug(name) })
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors([]);

    try {
      const payload = {
        fundraiser: {
          name: form.name,
          slug: form.slug,
          organization_name: form.organization_name, // HAF-119: Required
          description: form.description || null,
          status: form.status,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          goal_amount_cents: form.goal_amount_cents ? Math.round(parseFloat(form.goal_amount_cents) * 100) : null,
          payout_percentage: form.payout_percentage ? parseFloat(form.payout_percentage) : 0, // HAF-119
          image_url: form.image_url || null,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          pickup_location: form.pickup_location || null,
          pickup_instructions: form.pickup_instructions || null,
          allow_shipping: form.allow_shipping,
          shipping_note: form.shipping_note || null,
          public_message: form.public_message || null,
          thank_you_message: form.thank_you_message || null,
        }
      };

      if (isEditing) {
        await authPatch(`/admin/fundraisers/${id}`, payload, getToken);
        toast.success('Fundraiser updated');
      } else {
        const response = await authPost<FundraiserResponse>('/admin/fundraisers', payload, getToken);
        toast.success('Fundraiser created');
        navigate(`/admin/fundraisers/${response.data.fundraiser.id}`);
        return;
      }
      
      navigate('/admin/fundraisers');
    } catch (error: any) {
      const errMessages = error.response?.data?.errors || ['Failed to save fundraiser'];
      setErrors(errMessages);
      toast.error(errMessages[0]);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/admin/fundraisers"
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Fundraiser' : 'New Fundraiser'}
        </h1>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <ul className="list-disc list-inside text-red-600 text-sm">
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="e.g., Soccer Team Spring Fundraiser"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
              <input
                type="text"
                required
                value={form.slug}
                onChange={(e) => { setSlugManuallyEdited(true); setForm({ ...form, slug: e.target.value }); }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="soccer-team-spring"
              />
              <p className="text-xs text-gray-500 mt-1">
                Public URL: /fundraisers/{form.slug || 'your-slug'}
              </p>
            </div>
            
            {/* HAF-119: Organization name - required field */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name *</label>
              <input
                type="text"
                required
                value={form.organization_name}
                onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="e.g., Hagåtña Tigers Soccer Club"
              />
              <p className="text-xs text-gray-500 mt-1">
                The organization or group running this fundraiser
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Goal Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.goal_amount_cents}
                onChange={(e) => setForm({ ...form, goal_amount_cents: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="1000.00"
              />
            </div>
            
            {/* HAF-119: Payout percentage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payout Percentage (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.payout_percentage}
                onChange={(e) => setForm({ ...form, payout_percentage: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="10"
              />
              <p className="text-xs text-gray-500 mt-1">
                Percentage of sales that go to the organization
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="https://..."
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="Tell supporters about this fundraiser..."
              />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Contact Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
              />
            </div>
          </div>
        </div>

        {/* Pickup & Shipping */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Pickup & Shipping</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Location</label>
              <input
                type="text"
                value={form.pickup_location}
                onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="e.g., Hafaloha Store, 123 Main St"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Instructions</label>
              <textarea
                value={form.pickup_instructions}
                onChange={(e) => setForm({ ...form, pickup_instructions: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="e.g., Available for pickup starting March 15th..."
              />
            </div>
            
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allow_shipping"
                checked={form.allow_shipping}
                onChange={(e) => setForm({ ...form, allow_shipping: e.target.checked })}
                className="w-4 h-4 text-tsPrimary rounded focus:ring-tsPrimary"
              />
              <label htmlFor="allow_shipping" className="text-sm font-medium text-gray-700">
                Allow shipping (in addition to pickup)
              </label>
            </div>
            
            {form.allow_shipping && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Note</label>
                <input
                  type="text"
                  value={form.shipping_note}
                  onChange={(e) => setForm({ ...form, shipping_note: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                  placeholder="e.g., Shipping rates calculated at checkout"
                />
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Messages</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Public Message</label>
              <textarea
                value={form.public_message}
                onChange={(e) => setForm({ ...form, public_message: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="Displayed on the public fundraiser page..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thank You Message</label>
              <textarea
                value={form.thank_you_message}
                onChange={(e) => setForm({ ...form, thank_you_message: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary"
                placeholder="Shown after order is placed..."
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Link
            to="/admin/fundraisers"
            className="px-6 py-3 border rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 transition"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Fundraiser')}
          </button>
        </div>
      </form>
    </div>
  );
}
