import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useLockBodyScroll from '../hooks/useLockBodyScroll';
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
}

export default function VariantManager({ productId, basePriceCents, inventoryLevel }: VariantManagerProps) {
  const { getToken } = useAuth();
  
  // Option types state (flexible system)
  const [optionTypes, setOptionTypes] = useState<OptionType[]>([]);
  const [newOptionTypeName, setNewOptionTypeName] = useState('');
  
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
  const editModalContentRef = useRef<HTMLDivElement | null>(null);

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
      const options = variant.options || {};
      
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

  const startEdit = (variant: Variant) => {
    setEditingVariant(variant);
    setEditPrice((variant.price_cents / 100).toFixed(2));
    setEditStock(variant.stock_quantity.toString());
    setEditLowStockThreshold(variant.low_stock_threshold.toString());
    setEditAvailable(variant.available);
    setShowEditModal(true);
  };

  const cancelEdit = () => {
    setShowEditModal(false);
    setEditingVariant(null);
  };

  const saveEdit = async () => {
    if (!editingVariant) return;
    
    try {
      const token = await getToken();
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

      await axios.patch(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/variants/${editingVariant.id}`,
        {
          product_variant: {
            price_cents: priceCents,
            stock_quantity: stockQty,
            low_stock_threshold: lowStockThreshold,
            available: editAvailable,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setVariants(variants.map(v => 
        v.id === editingVariant.id 
          ? { 
              ...v, 
              price_cents: priceCents, 
              stock_quantity: stockQty, 
              low_stock_threshold: lowStockThreshold,
              available: editAvailable,
              stock_status: stockQty <= 0 ? 'out_of_stock' : stockQty <= lowStockThreshold ? 'low_stock' : 'in_stock',
              low_stock: stockQty > 0 && stockQty <= lowStockThreshold
            }
          : v
      ));
      
      toast.success('Variant updated!');
      cancelEdit();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      console.error('Failed to update variant:', err);
      toast.error(error.response?.data?.error || 'Failed to update variant');
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

  useLockBodyScroll(showEditModal);

  if (loading) {
    return <div className="text-gray-600">Loading variants...</div>;
  }

  const totalVariants = calculateTotalVariants();
  const hasMissingOptions = variants.length > 0 && optionTypes.length === 0;

  return (
    <div className="space-y-6">
      {hasMissingOptions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Variant options are missing</p>
            <p className="text-sm text-amber-800">
              These variants were imported without option labels (size/color). You can auto-detect sizes from SKU or variant title.
            </p>
          </div>
          <button
            type="button"
            onClick={autoDetectOptions}
            disabled={autoDetecting}
            className={`px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition ${
              autoDetecting ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {autoDetecting ? 'Detecting...' : 'Auto-detect sizes'}
          </button>
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
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">{optionType.name}</h4>
              <div className="flex items-center gap-2">
                {/* Preset dropdown */}
                {getPresetsForType(optionType.name).length > 0 && (
            <select
              onChange={(e) => {
                      const preset = presets.find(p => p.id === parseInt(e.target.value));
                      if (preset) applyPreset(typeIndex, preset);
                      e.target.value = '';
                    }}
                    className="text-sm px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                  >
                    <option value="">Apply preset...</option>
                    {getPresetsForType(optionType.name).map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} ({preset.values_count} values)
                      </option>
                    ))}
            </select>
                )}
                <button
                  onClick={() => removeOptionType(typeIndex)}
                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                  title="Remove option type"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
            </button>
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
                  <button
                    onClick={() => removeValueFromOptionType(typeIndex, valueIndex)}
                    className="hover:bg-blue-200 rounded-full p-0.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
              </span>
            ))}
          </div>

            {/* Add Value Input */}
            <div className="flex items-center gap-2">
            <input
              type="text"
                placeholder={`Add ${optionType.name.toLowerCase()} value...`}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary text-sm"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    addValueToOptionType(typeIndex, (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
            />
            <button
                onClick={(e) => {
                  const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                  if (input) {
                    addValueToOptionType(typeIndex, input.value);
                    input.value = '';
                  }
                }}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Add
            </button>
            </div>
          </div>
        ))}

        {/* Add New Option Type */}
        <div className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-white">
          <input
            type="text"
            value={newOptionTypeName}
            onChange={(e) => setNewOptionTypeName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addOptionType()}
            placeholder="New option type (e.g., Size, Color, Material)"
            list="common-option-types"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
          />
          <datalist id="common-option-types">
            <option value="Size" />
            <option value="Color" />
            <option value="Material" />
            <option value="Style" />
            <option value="Flavor" />
            <option value="Length" />
          </datalist>
          <button
            onClick={addOptionType}
            className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Option Type
          </button>
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
        <button
          type="button"
          onClick={generateVariants}
          disabled={generating || totalVariants === 0}
          className={`w-full mt-4 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition ${
            generating || totalVariants === 0
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-tsPrimary hover:bg-primary-dark'
          }`}
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
        </button>

        {variants.length > 0 && (
          <p className="text-xs text-gray-600 mt-2 text-center">
            Existing combinations will be skipped. Only new variants will be created.
          </p>
        )}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
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
                    <td className="px-4 py-4 text-sm text-gray-900 font-mono">{variant.sku}</td>
                    <td className="px-4 py-4 text-sm text-gray-900 font-medium">{variant.display_name || variant.variant_name}</td>
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
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              Low
                            </span>
                          )}
                          {variant.stock_status === 'out_of_stock' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              Out
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-4 text-sm">
                      <button
                        onClick={() => toggleAvailability(variant.id, variant.available)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-pointer hover:opacity-80 ${
                          (variant.actually_available ?? variant.available ?? true)
                            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {(variant.actually_available ?? variant.available ?? true) ? '✓ Available' : (
                          inventoryLevel === 'variant' && variant.stock_quantity === 0 
                            ? 'Out of Stock' 
                            : '✗ Disabled'
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(variant)}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteVariant(variant.id, variant.display_name || variant.variant_name)}
                          className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white rounded hover:bg-primary-dark transition text-xs font-medium"
                        >
                          Delete
                        </button>
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
          <p className="text-lg mb-2">No variants yet</p>
          <p className="text-sm">Add option types above and click "Generate Variants" to create them.</p>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={cancelEdit} />
          
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl flex flex-col min-h-0 max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Variant: {editingVariant.display_name || editingVariant.variant_name}
              </h3>
            </div>
            
            <div
              ref={editModalContentRef}
              className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
              onWheel={(event) => {
                if (editModalContentRef.current) {
                  editModalContentRef.current.scrollTop += event.deltaY;
                }
                event.stopPropagation();
                event.preventDefault();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                />
              </div>

              {inventoryLevel === 'variant' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={editStock}
                      onChange={(e) => setEditStock(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                    <input
                      type="number"
                      min="0"
                      value={editLowStockThreshold}
                      onChange={(e) => setEditLowStockThreshold(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit-available"
                  checked={editAvailable}
                  onChange={(e) => setEditAvailable(e.target.checked)}
                  className="h-4 w-4 text-tsPrimary focus:ring-tsPrimary border-gray-300 rounded"
                />
                <label htmlFor="edit-available" className="ml-2 block text-sm text-gray-700">
                  Available for purchase
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
