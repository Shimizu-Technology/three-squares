// src/pages/admin/AdminVariantPresetsPage.tsx
// Admin page for managing variant presets (reusable option templates)

import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'react-hot-toast';
import variantPresetsService, { 
  formatPriceAdjustment 
} from '../../services/variantPresets';
import type { VariantPreset, PresetValue } from '../../services/variantPresets';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';

interface PresetFormData {
  name: string;
  description: string;
  option_type: string;
  values: PresetValue[];
}

const emptyFormData: PresetFormData = {
  name: '',
  description: '',
  option_type: '',
  values: []
};

export default function AdminVariantPresetsPage() {
  const { getToken } = useAuth();
  
  // State
  const [groupedPresets, setGroupedPresets] = useState<Record<string, VariantPreset[]>>({});
  const [optionTypes, setOptionTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<VariantPreset | null>(null);
  const [formData, setFormData] = useState<PresetFormData>(emptyFormData);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  
  // New value input
  const [newValueName, setNewValueName] = useState('');
  const [newValuePrice, setNewValuePrice] = useState('0');

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      setLoading(true);
      const response = await variantPresetsService.getAll(getToken);
      if (response.success) {
        setGroupedPresets(response.data.grouped_by_type);
        setOptionTypes(response.data.option_types);
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
      toast.error('Failed to load variant presets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPreset(null);
    setFormData(emptyFormData);
    setNewValueName('');
    setNewValuePrice('0');
    setShowModal(true);
  };

  const handleEdit = (preset: VariantPreset) => {
    setEditingPreset(preset);
    setFormData({
      name: preset.name,
      description: preset.description || '',
      option_type: preset.option_type,
      values: [...preset.values]
    });
    setNewValueName('');
    setNewValuePrice('0');
    setShowModal(true);
  };

  const handleDuplicate = async (preset: VariantPreset) => {
    try {
      const response = await variantPresetsService.duplicate(preset.id, getToken);
      if (response.success) {
        toast.success(`Duplicated as "${response.data.name}"`);
        loadPresets();
      }
    } catch (error) {
      console.error('Failed to duplicate preset:', error);
      toast.error('Failed to duplicate preset');
    }
  };

  const handleDelete = async (preset: VariantPreset) => {
    if (!window.confirm(`Delete preset "${preset.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await variantPresetsService.remove(preset.id, getToken);
      toast.success('Preset deleted');
      loadPresets();
    } catch (error) {
      console.error('Failed to delete preset:', error);
      toast.error('Failed to delete preset');
    }
  };

  const handleSave = async () => {
    // Validation
    if (!formData.name.trim()) {
      toast.error('Preset name is required');
      return;
    }
    if (!formData.option_type.trim()) {
      toast.error('Option type is required');
      return;
    }
    if (formData.values.length === 0) {
      toast.error('Add at least one value');
      return;
    }

    try {
      setSaving(true);
      
      if (editingPreset) {
        await variantPresetsService.update(editingPreset.id, formData, getToken);
        toast.success('Preset updated');
      } else {
        await variantPresetsService.create(formData, getToken);
        toast.success('Preset created');
      }
      
      setShowModal(false);
      loadPresets();
    } catch (error: any) {
      console.error('Failed to save preset:', error);
      toast.error(error.response?.data?.error || 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const addValue = () => {
    if (!newValueName.trim()) {
      toast.error('Enter a value name');
      return;
    }
    
    // Check for duplicate
    if (formData.values.some(v => v.name.toLowerCase() === newValueName.trim().toLowerCase())) {
      toast.error('Value already exists');
      return;
    }
    
    const priceAdjustment = Math.round(parseFloat(newValuePrice || '0') * 100);
    
    setFormData(prev => ({
      ...prev,
      values: [...prev.values, { name: newValueName.trim(), price_adjustment_cents: priceAdjustment }]
    }));
    setNewValueName('');
    setNewValuePrice('0');
  };

  const removeValue = (index: number) => {
    setFormData(prev => ({
      ...prev,
      values: prev.values.filter((_, i) => i !== index)
    }));
  };

  const updateValuePrice = (index: number, priceStr: string) => {
    const priceAdjustment = Math.round(parseFloat(priceStr || '0') * 100);
    setFormData(prev => ({
      ...prev,
      values: prev.values.map((v, i) => 
        i === index ? { ...v, price_adjustment_cents: priceAdjustment } : v
      )
    }));
  };

  useLockBodyScroll(showModal);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Variant Presets</h1>
          <p className="text-gray-600 mt-1">
            Create reusable option templates for product variants
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="px-5 py-2.5 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Preset
        </button>
      </div>

      {/* Presets by Option Type */}
      {optionTypes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No presets yet</h3>
          <p className="text-gray-600 mb-6">
            Create your first preset to quickly add option groups to products
          </p>
          <button
            onClick={handleCreate}
            className="px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Create First Preset
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {optionTypes.map(optionType => (
            <div key={optionType} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {optionType} Presets
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {groupedPresets[optionType]?.map(preset => (
                  <div key={preset.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{preset.name}</h3>
                        {preset.description && (
                          <p className="text-sm text-gray-500 mt-1">{preset.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {preset.values.slice(0, 8).map((value, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              {value.name}
                              {value.price_adjustment_cents !== 0 && (
                                <span className="ml-1 text-green-600">
                                  {formatPriceAdjustment(value.price_adjustment_cents)}
                                </span>
                              )}
                            </span>
                          ))}
                          {preset.values.length > 8 && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                              +{preset.values.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleDuplicate(preset)}
                          className="btn-icon text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                          title="Duplicate"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEdit(preset)}
                          className="btn-icon text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(preset)}
                          className="btn-icon text-red-600 hover:text-red-800 hover:bg-red-50"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            onClick={() => setShowModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl flex flex-col min-h-0 max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-xl font-semibold text-gray-900">
                {editingPreset ? 'Edit Preset' : 'Create New Preset'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="btn-icon text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
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
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preset Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Adult Sizes Only"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Option Type *
                  </label>
                  <input
                    type="text"
                    value={formData.option_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, option_type: e.target.value }))}
                    placeholder="e.g., Size, Color, Material"
                    list="option-types-list"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                  />
                  <datalist id="option-types-list">
                    <option value="Size" />
                    <option value="Color" />
                    <option value="Material" />
                    <option value="Style" />
                    <option value="Flavor" />
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="When to use this preset"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                />
              </div>

              {/* Values */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Values ({formData.values.length})
                </label>
                
                {/* Existing values */}
                {formData.values.length > 0 && (
                  <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                    {formData.values.map((value, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="flex-1 font-medium text-gray-900">{value.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-sm">+$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={(value.price_adjustment_cents / 100).toFixed(2)}
                            onChange={(e) => updateValuePrice(index, e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                          />
                        </div>
                        <button
                          onClick={() => removeValue(index)}
                          className="btn-icon text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new value */}
                <div className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-300 rounded-lg">
                  <input
                    type="text"
                    value={newValueName}
                    onChange={(e) => setNewValueName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addValue()}
                    placeholder="Value name (e.g., XL)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-sm">+$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newValuePrice}
                      onChange={(e) => setNewValuePrice(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addValue()}
                      className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-tsPrimary focus:border-tsPrimary"
                    />
                  </div>
                  <button
                    onClick={addValue}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Saving...
                  </>
                ) : (
                  editingPreset ? 'Update Preset' : 'Create Preset'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
