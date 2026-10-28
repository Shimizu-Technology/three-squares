import { IconButton } from './ui/IconButton';
import { Switch } from './ui/Switch';
import { StatusBadge } from './ui/StatusBadge';
import { Pencil, Trash2, X } from 'lucide-react';
import { CheckField } from './ui/CheckField';
import { Disclosure } from './ui/Disclosure';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import AdminModal from './admin/AdminModal';
import variantPresetsService from '../services/variantPresets';
import type { VariantPreset, PresetValue } from '../services/variantPresets';

import { API_BASE_URL } from '../config';

// Types
interface Variant {
  id: number;
  options: Record<string, string>;
  size: string | null;
  color: string | null;
  sku: string;
  variant_name: string;
  display_name: string;
  price_cents: number;
  stock_quantity: number;
  low_stock_threshold: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  low_stock: boolean;
  available: boolean;
  actually_available: boolean;
}

interface OptionTypeValue {
  name: string;
  price_adjustment_cents: number;
}

interface OptionType {
  name: string;
  values: OptionTypeValue[];
}

interface VariantManagerProps {
  productId: number;
  basePriceCents: number;
  inventoryLevel: 'none' | 'product' | 'variant';
  canManageStock: boolean;
}

export default function VariantManager({ productId, basePriceCents, inventoryLevel, canManageStock }: VariantManagerProps) {
  const { getToken } = useAuth();

  // Option types state (flexible system)
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);
  const [newOptionTypeName, setNewOptionTypeName] = useState('');
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  // Presets from API
  const [presets, setPresets] = useState<VariantPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);

  // Variants state
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // Edit modal state
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editLowStockThreshold, setEditLowStockThreshold] = useState('');
  const [editAvailable, setEditAvailable] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const editReturnFocusRef = useRef<HTMLElement | null>(null);
  const editSavingRef = useRef(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Load variants and presets on mount
  useEffect(() => {
    fetchVariants();
    fetchPresets();
  }, [productId]);

  const fetchVariants = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/variants`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let fetchedVariants = response.data.data || response.data;
      if (!Array.isArray(fetchedVariants)) {
        fetchedVariants = [];
      }

      setVariants(fetchedVariants);

      // Extract option types from existing variants
      extractOptionTypesFromVariants(fetchedVariants);
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      console.error('Failed to fetch variants:', err);
      if (error.response?.status !== 404) {
        toast.error('Failed to load variants');
      }
      setVariants([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      setPresetsLoading(true);
      const response = await variantPresetsService.getAll(getToken);
      if (response.success) {
        setPresets(response.data.presets);
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
    } finally {
      setPresetsLoading(false);
    }
  };

  // Extract option types from existing variants for editing
  const extractOptionTypesFromVariants = (variantsList: Variant[]) => {
    if (variantsList.length === 0) return;

    const optionTypesMap: Record<string, Set<string>> = {};

    variantsList.forEach(variant => {
      // Use options field if available, fall back to size/color
      const options = { ...variant.options };

      // Check legacy fields
      if (variant.size && !options['Size']) {
        options['Size'] = variant.size;
      }
      if (variant.color && !options['Color']) {
        options['Color'] = variant.color;
      }

      Object.entries(options).forEach(([type, value]) => {
        if (!optionTypesMap[type]) {
          optionTypesMap[type] = new Set();
        }
        optionTypesMap[type].add(value);
      });
    });

    // Convert to our state format
    const extractedTypes: OptionType[] = Object.entries(optionTypesMap).map(([name, valuesSet]) => ({
      name,
      values: Array.from(valuesSet).map(v => ({ name: v, price_adjustment_cents: 0 }))
    }));

    setOptionTypes(extractedTypes);
  };

  // ============================================
  // Option Type Management
  // ============================================

  const addOptionType = () => {
    const name = newOptionTypeName.trim();
    if (!name) {
      toast.error('Enter an option type name');
      return;
    }
    if (optionTypes.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Option type already exists');
      return;
    }
    setOptionTypes([...optionTypes, { name, values: [] }]);
    setNewOptionTypeName('');
  };

  const removeOptionType = (index: number) => {
    setOptionTypes(optionTypes.filter((_, i) => i !== index));
  };

  const addValueToOptionType = (typeIndex: number, valueName: string, priceAdjustment: number = 0) => {
    if (!valueName.trim()) return;

    const updatedTypes = [...optionTypes];
    const existingValues = updatedTypes[typeIndex].values;

    if (existingValues.some(v => v.name.toLowerCase() === valueName.trim().toLowerCase())) {
      toast.error('Value already exists');
      return;
    }

    updatedTypes[typeIndex].values.push({
      name: valueName.trim(),
      price_adjustment_cents: priceAdjustment
    });
    setOptionTypes(updatedTypes);
  };

  const removeValueFromOptionType = (typeIndex: number, valueIndex: number) => {
    const updatedTypes = [...optionTypes];
    updatedTypes[typeIndex].values = updatedTypes[typeIndex].values.filter((_, i) => i !== valueIndex);
    setOptionTypes(updatedTypes);
  };

  // Note: updateValuePrice is available for future use in inline price editing
  // Currently prices are set when applying presets or can be edited via the preset manager
  const _updateValuePrice = (typeIndex: number, valueIndex: number, priceCents: number) => {
    const updatedTypes = [...optionTypes];
    updatedTypes[typeIndex].values[valueIndex].price_adjustment_cents = priceCents;
    setOptionTypes(updatedTypes);
  };
  void _updateValuePrice; // Suppress unused warning

  const applyPreset = (typeIndex: number, preset: VariantPreset) => {
    const updatedTypes = [...optionTypes];
    const existingNames = new Set(updatedTypes[typeIndex].values.map(v => v.name.toLowerCase()));

    // Add values from preset that don't already exist
    const newValues = preset.values.filter(v => !existingNames.has(v.name.toLowerCase()));

    if (newValues.length === 0) {
      toast('All values from this preset already exist', { icon: 'ℹ️' });
      return;
    }

    updatedTypes[typeIndex].values.push(...newValues);
    setOptionTypes(updatedTypes);
    toast.success(`Added ${newValues.length} value(s) from "${preset.name}"`);
  };

  // ============================================
  // Variant Generation
  // ============================================

  const calculateTotalVariants = () => {
    if (optionTypes.length === 0) return 0;
    if (optionTypes.some(t => t.values.length === 0)) return 0;
    return optionTypes.reduce((total, type) => total * type.values.length, 1);
  };

  const generateVariants = async () => {
    if (optionTypes.length === 0) {
      toast.error('Add at least one option type');
      return;
    }

    if (optionTypes.some(t => t.values.length === 0)) {
      toast.error('Each option type must have at least one value');
      return;
    }

    if (basePriceCents <= 0) {
      toast.error('Set a base price before generating variants');
      return;
    }

    const totalNew = calculateTotalVariants();
    const basePriceLabel = formatPrice(basePriceCents);

    const confirmMsg = variants.length > 0
      ? `You have ${variants.length} existing variants. This will add up to ${totalNew} new combinations (duplicates will be skipped).\n\nAll new variants will start at ${basePriceLabel} (plus any adjustments).\n\nContinue?`
      : `All new variants will start at ${basePriceLabel} (plus any adjustments).\n\nContinue?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setGenerating(true);
      const token = await getToken();

      // Build option_types object for API
      const optionTypesPayload: Record<string, PresetValue[]> = {};
      optionTypes.forEach(type => {
        optionTypesPayload[type.name] = type.values;
      });

      const response = await axios.post(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/variants/generate`,
        { option_types: optionTypesPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const result = response.data.data;
      toast.success(response.data.message || `Generated ${result.created} variants`);

      await fetchVariants();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      console.error('Failed to generate variants:', err);
      toast.error(error.response?.data?.error || 'Failed to generate variants');
    } finally {
      setGenerating(false);
    }
  };

  // ============================================
  // Variant CRUD
  // ============================================

  const startEdit = (variant: Variant, opener?: HTMLElement) => {
    editReturnFocusRef.current = opener ||
      (typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setEditError('');
    setEditingVariant(variant);
    setEditPrice((variant.price_cents / 100).toFixed(2));
    setEditStock(variant.stock_quantity.toString());
    setEditLowStockThreshold(variant.low_stock_threshold.toString());
    setEditAvailable(variant.available);
    setShowEditModal(true);
  };

  const cancelEdit = () => {
    if (editSavingRef.current) return;
    setShowEditModal(false);
    setEditingVariant(null);
  };

  const saveEdit = async () => {
    if (!editingVariant || editSavingRef.current) return;
    editSavingRef.current = true;
    setEditSaving(true);
    setEditError('');
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(new Error('Save timed out. Your changes are still here. Check the variant before retrying.'));
      }, 20_000);
    });

    try {
      const priceCents = Math.round(parseFloat(editPrice) * 100);
      const stockQty = parseInt(editStock);
      const lowStockThreshold = parseInt(editLowStockThreshold);

      if (isNaN(priceCents) || priceCents < 0) {
        toast.error('Invalid price');
        return;
      }
      if (isNaN(stockQty) || stockQty < 0) {
        toast.error('Invalid stock quantity');
        return;
      }
      if (isNaN(lowStockThreshold) || lowStockThreshold < 0) {
        toast.error('Invalid low stock threshold');
        return;
      }

      const request = async () => {
        const token = await getToken();
        // Authentication is part of the deadline; never send a late request after timeout.
        controller.signal.throwIfAborted();
        return axios.patch<{ data: Variant }>(
          `${API_BASE_URL}/api/v1/admin/products/${productId}/variants/${editingVariant.id}`,
          {
            product_variant: {
              price_cents: priceCents,
              ...(canManageStock ? { stock_quantity: stockQty, low_stock_threshold: lowStockThreshold } : {}),
              available: editAvailable,
            },
          },
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, timeout: 20_000 }
        );
      };
      const response = await Promise.race([request(), expired]);

      setVariants(current => current.map(variant => variant.id === editingVariant.id ? response.data.data : variant));

      toast.success('Variant updated!');
      setShowEditModal(false);
      setEditingVariant(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      console.error('Failed to update variant:', err);
      const message = controller.signal.aborted
        ? 'Save timed out. Your changes are still here. Check the variant before retrying.'
        : error.response?.data?.error || 'Failed to update variant';
      setEditError(message);
      toast.error(message);
    } finally {
      clearTimeout(deadline);
      editSavingRef.current = false;
      setEditSaving(false);
    }
  };

  const toggleAvailability = async (variantId: number, currentStatus: boolean) => {
    try {
      const token = await getToken();
      await axios.patch(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/variants/${variantId}`,
        { product_variant: { available: !currentStatus } },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setVariants(variants.map(v =>
        v.id === variantId ? { ...v, available: !currentStatus } : v
      ));

      toast.success(currentStatus ? 'Variant disabled' : 'Variant enabled');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      console.error('Failed to toggle availability:', err);
      toast.error(error.response?.data?.error || 'Failed to toggle availability');
    }
  };

  const autoDetectOptions = async () => {
    try {
      setAutoDetecting(true);
      const token = await getToken();
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/variants/auto_detect_options`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = response.data?.data?.updated ?? 0;
      toast.success(`Updated ${updated} variant${updated === 1 ? '' : 's'}`);
      await fetchVariants();
    } catch (err: unknown) {
      console.error('Failed to auto-detect options:', err);
      toast.error('Failed to auto-detect options');
    } finally {
      setAutoDetecting(false);
    }
  };

  const deleteVariant = async (variantId: number, variantName: string) => {
    if (!window.confirm(`Delete variant "${variantName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const token = await getToken();
      await axios.delete(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/variants/${variantId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setVariants(variants.filter(v => v.id !== variantId));
      toast.success('Variant deleted');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      console.error('Failed to delete variant:', err);
      toast.error(error.response?.data?.error || 'Failed to delete variant');
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Get presets for a specific option type
  const getPresetsForType = (typeName: string) => {
    return presets.filter(p => p.option_type.toLowerCase() === typeName.toLowerCase());
  };

  if (loading) {
    return <div className="text-gray-600">Loading variants...</div>;
  }

  const totalVariants = calculateTotalVariants();
  const hasMissingOptions = variants.length > 0 && optionTypes.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Portions, boxes &amp; flavors</h2>
        <p className="text-sm text-gray-600 mt-1">Offer choices such as a lunch portion, a box of 6 cookies or a flavor. Existing variants save separately from the main form.</p>
      </div>
      {/* Variants Table */}
      {variants.length > 0 && (
        <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Variants ({variants.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Variant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Price</th>
                  {inventoryLevel === 'variant' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Stock</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {variants.map((variant) => (
                  <tr key={variant.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm text-gray-900 font-medium">
                      {variant.display_name || variant.variant_name}
                      <Disclosure title={<>SKU</>}>
                        <code className="break-all">{variant.sku}</code>
                      </Disclosure>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className="text-gray-900 font-semibold">{formatPrice(variant.price_cents)}</span>
                      {variant.price_cents !== basePriceCents && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({variant.price_cents > basePriceCents ? '+' : ''}{formatPrice(variant.price_cents - basePriceCents)})
                      </span>
                      )}
                    </td>
                    {inventoryLevel === 'variant' && (
                      <td className="px-4 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={
                            variant.stock_status === 'out_of_stock'
                              ? 'text-red-600 font-semibold'
                              : variant.stock_status === 'low_stock'
                              ? 'text-amber-600 font-semibold'
                              : 'text-gray-900'
                          }>
                            {variant.stock_quantity}
                          </span>
                          {variant.stock_status === 'low_stock' && (
                            <StatusBadge tone="attention">Low</StatusBadge>
                          )}
                          {variant.stock_status === 'out_of_stock' && (
                            <StatusBadge tone="danger">Out</StatusBadge>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Switch aria-label={`Available: ${variant.display_name || variant.variant_name}`} aria-checked={variant.available}
                          onClick={() => toggleAvailability(variant.id, variant.available)} />
                        <StatusBadge tone={(variant.actually_available ?? variant.available) ? 'success' : 'inactive'}>
                          {(variant.actually_available ?? variant.available) ? 'Available' : inventoryLevel === 'variant' && variant.stock_quantity === 0 ? 'Out of stock' : 'Disabled'}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <IconButton variant="secondary" aria-label={`Edit ${variant.display_name || variant.variant_name}`} onClick={event => startEdit(variant, event.currentTarget)}><Pencil /></IconButton>
                        <IconButton variant="destructive" aria-label={`Delete ${variant.display_name || variant.variant_name}`} onClick={() => deleteVariant(variant.id, variant.display_name || variant.variant_name)}><Trash2 /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {variants.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No additional choices yet</p>
          <p className="text-sm">For an item sold one way, no extra choices are needed. Open the options below to add portions, cookie boxes or flavors.</p>
        </div>
      )}

      <Disclosure title={<>Add portion, box size or flavor options (advanced)</>}>
        <div className="mt-4 space-y-4">
          {hasMissingOptions && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">Variant options are missing</p>
                <p className="text-sm text-amber-800">
                  These variants were imported without option labels. You can auto-detect sizes from SKU or variant title.
                </p>
              </div>
              <Button variant="primary"
                type="button"
                onClick={autoDetectOptions}
                disabled={autoDetecting}
              >
                {autoDetecting ? 'Detecting...' : 'Auto-detect sizes'}
              </Button>
            </div>
          )}
          {/* Option Types Builder */}
          <div className="border-2 border-gray-200 rounded-lg p-6 bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
              Variant Options
            </h3>
              {!presetsLoading && presets.length > 0 && (
                <span className="text-sm text-gray-500">
                  {presets.length} presets available
                </span>
              )}
            </div>

            {/* Existing Option Types */}
            {optionTypes.map((optionType, typeIndex) => (
              <div key={typeIndex} className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="font-medium text-gray-900">{optionType.name}</h4>
                  <div className="flex items-center gap-2">
                    {/* Preset dropdown */}
                    {getPresetsForType(optionType.name).length > 0 && (
                <Field label={`Preset for ${optionType.name}`}><Select
                  onChange={(e) => {
                          const preset = presets.find(p => p.id === parseInt(e.target.value));
                          if (preset) applyPreset(typeIndex, preset);
                          e.target.value = '';
                        }}
                      >
                        <option value="">Apply preset...</option>
                        {getPresetsForType(optionType.name).map(preset => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name} ({preset.values_count} values)
                          </option>
                        ))}
                </Select></Field>
                    )}
                    <IconButton variant="ghost" aria-label={`Remove ${optionType.name} option type`} onClick={() => removeOptionType(typeIndex)}><Trash2 /></IconButton>
              </div>
            </div>

                {/* Values */}
              <div className="flex flex-wrap gap-2 mb-3">
                  {optionType.values.map((value, valueIndex) => (
                  <span
                      key={valueIndex}
                      className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium"
                    >
                      {value.name}
                      {value.price_adjustment_cents !== 0 && (
                        <span className="text-green-600 text-xs">
                          +${(value.price_adjustment_cents / 100).toFixed(2)}
                        </span>
                      )}
                      <IconButton variant="ghost" aria-label={`Remove ${value.name} from ${optionType.name}`} onClick={() => removeValueFromOptionType(typeIndex, valueIndex)}><X /></IconButton>
                  </span>
                ))}
              </div>

                <div className="flex flex-wrap items-end gap-2">
                  <Field label={`New ${optionType.name} value`} className="flex-1">
                    <Input type="text" aria-label={`New ${optionType.name} value`} value={newValues[optionType.name] || ''}
                      onChange={event => setNewValues(values => ({...values, [optionType.name]: event.target.value}))}
                      placeholder={`Add ${optionType.name.toLowerCase()} value…`}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault(); addValueToOptionType(typeIndex, newValues[optionType.name] || '');
                          setNewValues(values => ({...values, [optionType.name]: ''}));
                        }
                      }} />
                  </Field>
                  <Button variant="secondary" aria-label={`Add ${optionType.name} value`} onClick={() => {
                    addValueToOptionType(typeIndex, newValues[optionType.name] || '');
                    setNewValues(values => ({...values, [optionType.name]: ''}));
                  }}>Add</Button>
                </div>
              </div>
            ))}

            {/* Add New Option Type */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-white">
              <Field label="New option type" className="flex-1"><Input
                type="text"
                value={newOptionTypeName}
                onChange={(e) => setNewOptionTypeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addOptionType(); }
                }}
                aria-label="New option type"
                placeholder="New option type (e.g., Portion, Box size, Flavor)"
                list="common-option-types"
              /></Field>
              <datalist id="common-option-types">
                <option value="Portion" />
                <option value="Box size" />
                <option value="Flavor" />
              </datalist>
              <Button icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>} variant="primary"
                type="button"
                onClick={addOptionType}
              >

                Add Option Type
              </Button>
            </div>

            {/* Variant Preview */}
            {optionTypes.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-blue-800">
                    {totalVariants > 0 ? (
                      <>
                        Will generate <strong>{totalVariants}</strong> variants
                        {optionTypes.length > 1 && (
                          <span className="text-blue-600 ml-1">
                            ({optionTypes.map(t => t.values.length).join(' × ')})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-blue-600">Add values to each option type to generate variants</span>
                    )}
                  </span>
                  {totalVariants > 50 && (
                    <span className="text-amber-600 text-sm">Large number of variants</span>
                  )}
                </div>
              </div>
            )}

            {/* Generate Button */}
            <Button variant="primary"
              type="button"
              onClick={generateVariants}
              disabled={generating || totalVariants === 0}
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Generating...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Generate Variants
                </>
              )}
            </Button>

            {variants.length > 0 && (
              <p className="text-xs text-gray-600 mt-2 text-center">
                Existing combinations will be skipped. Only new variants will be created.
              </p>
            )}
          </div>

        </div>
      </Disclosure>

      {/* Edit Modal */}
      <AdminModal
        open={showEditModal && !!editingVariant}
        onClose={cancelEdit}
        title={`Edit Variant: ${editingVariant?.display_name || editingVariant?.variant_name || ''}`}
        maxWidth="max-w-md"
        dismissible={!editSaving}
        returnFocusRef={editReturnFocusRef}
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" type="button" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
            <Button variant="primary" type="button" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        )}
      >
        {editError && <p role="alert" className="mb-4 text-sm text-red-700">{editError}</p>}
        <fieldset disabled={editSaving} className="space-y-4 min-w-0">
          <div>
            <Field label="Price ($)">
            <Input
              id="variant-edit-price"
              type="number"
              step="0.01"
              min="0"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
            /></Field>
          </div>

          {inventoryLevel === 'variant' && (
            <>
              <div>
                <Field label="Stock Quantity">
                <Input
                  id="variant-edit-stock"
                  type="number"
                  min="0"
                  disabled={!canManageStock}
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value)}
                /></Field>
              </div>

              <div>
                <Field label="Low Stock Threshold">
                <Input
                  id="variant-edit-threshold"
                  type="number"
                  min="0"
                  disabled={!canManageStock}
                  value={editLowStockThreshold}
                  onChange={(e) => setEditLowStockThreshold(e.target.value)}
                /></Field>
              </div>
            </>
          )}

          <CheckField type="checkbox" id="edit-available" checked={editAvailable} onChange={(e) => setEditAvailable(e.target.checked)}>
              Available for purchase
            </CheckField>
        </fieldset>
      </AdminModal>
    </div>
  );
}
