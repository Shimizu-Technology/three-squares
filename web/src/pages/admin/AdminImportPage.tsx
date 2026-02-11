import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';
import { authGet, authPost } from '../../services/authApi';

// Collapsible section for import log
function ImportLogSection({ warnings }: { warnings: string[] }) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);

  // Categorize warnings
  const created = warnings.filter(w => w.startsWith('✅ Created:'));
  const critical = warnings.filter(w => w.includes('CRITICAL') || w.includes('NO variants'));
  const skippedVariants = warnings.filter(w => w.includes('missing SKU') && !w.includes('CRITICAL'));
  const skippedProducts = warnings.filter(w => w.includes('already exists') || w.includes('Skipped product (missing SKUs)'));
  const other = warnings.filter(w => 
    !w.startsWith('✅ Created:') && 
    !w.includes('CRITICAL') && 
    !w.includes('NO variants') && 
    !w.includes('missing SKU') && 
    !w.includes('already exists') &&
    w.trim() !== ''
  );

  const groupWarningsByProduct = (items: string[]) => {
    const groups = new Map<string, string[]>();
    const getProductKey = (text: string) => {
      if (text.startsWith('Product already exists: ')) {
        return text.replace('Product already exists: ', '').trim();
      }
      if (text.startsWith('Skipped product (missing SKUs): ')) {
        return text.replace('Skipped product (missing SKUs): ', '').trim();
      }
      const match = text.match(/^(.+?):\s+/);
      if (match?.[1]) return match[1].trim();
      return 'Other';
    };

    items.forEach((item) => {
      const key = getProductKey(item);
      let cleaned = item
        .replace(/^(.+?):\s*/, '')
        .replace('missing SKU', 'missing product code');

      if (item.startsWith('Product already exists:')) {
        cleaned = 'Already exists';
      } else if (item.startsWith('Skipped product (missing SKUs):')) {
        cleaned = 'Missing product codes';
      } else if (!cleaned.trim()) {
        if (item.startsWith('Skipped product')) {
          cleaned = item.replace(`: ${key}`, '').trim();
        }
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(cleaned);
    });

    return Array.from(groups.entries());
  };

  const groupedVariantWarnings = groupWarningsByProduct(skippedVariants);
  const groupedProductWarnings = groupWarningsByProduct(skippedProducts);

  return (
    <div className="space-y-3">
      {/* Critical Issues - Always shown, expanded */}
      {critical.length > 0 && (
        <div className="border border-red-300 rounded-lg overflow-hidden">
          <div className="bg-red-100 px-4 py-3">
            <div className="flex items-center">
              <XCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="font-bold text-red-800">
                {critical.length} Critical Issue{critical.length > 1 ? 's' : ''} - Products Can’t Be Purchased
              </span>
            </div>
            <p className="text-sm text-red-700 mt-1">
              These products are missing size options because product codes weren’t provided in Shopify.
            </p>
          </div>
          <ul className="bg-red-50 divide-y divide-red-200">
            {critical.map((warning, index) => (
              <li key={index} className="px-4 py-2 text-sm text-red-800">
                {warning.replace('⚠️ CRITICAL: ', '').replace(' - product cannot be purchased!', '')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings - Collapsible, expanded by default */}
      {(skippedVariants.length > 0 || skippedProducts.length > 0) && (
        <div className="border border-orange-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowWarnings(!showWarnings)}
            className="w-full bg-orange-50 px-4 py-3 flex items-center justify-between hover:bg-orange-100 transition"
          >
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-orange-600 mr-2" />
              <span className="font-medium text-orange-800">
                {skippedVariants.length + skippedProducts.length} Warning{skippedVariants.length + skippedProducts.length > 1 ? 's' : ''}
              </span>
              <span className="text-sm text-orange-600 ml-2">
                (missing product codes or already imported)
              </span>
            </div>
            {showWarnings ? <ChevronUp className="w-5 h-5 text-orange-600" /> : <ChevronDown className="w-5 h-5 text-orange-600" />}
          </button>
          {showWarnings && (
            <div className="bg-white divide-y divide-orange-100">
              {groupedVariantWarnings.map(([productName, items]) => (
                <div key={`sv-${productName}`} className="px-4 py-3 text-sm text-orange-700">
                  <p className="font-semibold text-orange-800">{productName}</p>
                  <ul className="mt-1 space-y-1 text-orange-700">
                    {items.map((item, index) => (
                      <li key={`${productName}-sv-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {groupedProductWarnings.map(([productName, items]) => (
                <div key={`sp-${productName}`} className="px-4 py-3 text-sm text-yellow-700">
                  <p className="font-semibold text-yellow-800">{productName}</p>
                  <ul className="mt-1 space-y-1 text-yellow-700">
                    {items.map((item, index) => (
                      <li key={`${productName}-sp-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Success - Collapsible, collapsed by default */}
      {created.length > 0 && (
        <div className="border border-green-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSuccess(!showSuccess)}
            className="w-full bg-green-50 px-4 py-3 flex items-center justify-between hover:bg-green-100 transition"
          >
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              <span className="font-medium text-green-800">
                {created.length} Product{created.length > 1 ? 's' : ''} Created Successfully
              </span>
            </div>
            {showSuccess ? <ChevronUp className="w-5 h-5 text-green-600" /> : <ChevronDown className="w-5 h-5 text-green-600" />}
          </button>
          {showSuccess && (
            <ul className="bg-white divide-y divide-green-100 max-h-48 overflow-y-auto">
              {created.map((warning, index) => (
                <li key={index} className="px-4 py-2 text-sm text-green-700">
                  {warning.replace('✅ Created: ', '')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Other messages */}
      {other.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3">
            <span className="font-medium text-gray-700">Other Messages</span>
          </div>
          <ul className="bg-white divide-y divide-gray-100">
            {other.map((warning, index) => (
              <li key={index} className="px-4 py-2 text-sm text-gray-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface Import {
  id: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  inventory_filename?: string;
  products_count: number;
  variants_count: number;
  variants_skipped_count: number;
  images_count: number;
  collections_count: number;
  skipped_count: number;
  total_products: number;
  processed_products: number;
  progress_percent: number;
  current_step: string | null;
  eta_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  duration: number | null;
  created_at: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

interface ImportDetails extends Import {
  warnings: string[];
  error_messages: string | null;
}

interface AdminImportsListResponse {
  data: Import[];
}

interface AdminImportResponse {
  data: ImportDetails;
}

export default function AdminImportPage() {
  const { getToken } = useAuth();
  const [productsFile, setProductsFile] = useState<File | null>(null);
  const [inventoryFile, setInventoryFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentImport, setCurrentImport] = useState<Import | null>(null);
  const [imports, setImports] = useState<Import[]>([]);
  const [selectedImport, setSelectedImport] = useState<ImportDetails | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  const formatEta = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return 'Calculating...';
    if (seconds < 60) return `About ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `About ${minutes}m ${remaining.toString().padStart(2, '0')}s`;
  };

  useEffect(() => {
    fetchImports();
  }, []);

  useLockBodyScroll(!!selectedImport);

  // Poll for current import status
  useEffect(() => {
    if (!currentImport || !['pending', 'processing'].includes(currentImport.status)) {
      return;
    }

    const interval = setInterval(() => {
      fetchImportStatus(currentImport.id);
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [currentImport]);

  const fetchImports = async () => {
    try {
      const response = await authGet<AdminImportsListResponse>('/admin/imports', getToken);
      const importsData = response.data.data;
      setImports(importsData);

      const inProgress = importsData.find(
        (imp: Import) => ['pending', 'processing'].includes(imp.status)
      );
      setCurrentImport(inProgress || null);
    } catch (error) {
      console.error('Failed to fetch imports:', error);
    }
  };

  const fetchImportStatus = async (importId: number) => {
    try {
      const response = await authGet<AdminImportResponse>(`/admin/imports/${importId}`, getToken);
      const importData = response.data.data;
      setCurrentImport(importData);
      
      // Update in list
      setImports(prev => prev.map(imp => imp.id === importId ? importData : imp));
      
      // If completed or failed, stop polling
      if (['completed', 'failed'].includes(importData.status)) {
        setCurrentImport(null);
        fetchImports(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to fetch import status:', error);
    }
  };

  const handleProductsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProductsFile(e.target.files[0]);
    }
  };

  // Currently unused - will be enabled when inventory import is ready
  const _handleInventoryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInventoryFile(e.target.files[0]);
    }
  };
  void _handleInventoryFileChange;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'products' | 'inventory') => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (type === 'products') {
        setProductsFile(e.dataTransfer.files[0]);
      } else {
        setInventoryFile(e.dataTransfer.files[0]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productsFile) {
      alert('Please select a products CSV file');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('products_file', productsFile);
      if (inventoryFile) {
        formData.append('inventory_file', inventoryFile);
      }

      const response = await authPost<AdminImportResponse>(
        '/admin/imports',
        formData,
        getToken,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setCurrentImport(response.data.data);
      setProductsFile(null);
      setInventoryFile(null);
      fetchImports();
    } catch (error: any) {
      console.error('Failed to start import:', error);
      alert(error.response?.data?.error || 'Failed to start import');
    } finally {
      setIsUploading(false);
    }
  };

  const viewImportDetails = async (importId: number) => {
    try {
      const response = await authGet<AdminImportResponse>(`/admin/imports/${importId}`, getToken);
      setSelectedImport(response.data.data);
    } catch (error) {
      console.error('Failed to fetch import details:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-500" />;
      case 'processing':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    };
    return badges[status] || badges.pending;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Import Products</h1>
          <p className="mt-2 text-gray-600">
            Upload Shopify product exports to quickly populate your store.
          </p>
        </div>

        {/* Upload Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Upload className="w-6 h-6 mr-2 text-tsPrimary" />
            Upload Files
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Products File */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Products CSV <span className="text-red-600">*</span>
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
                  isDragging ? 'border-tsPrimary bg-red-50' : 'border-gray-300 hover:border-tsPrimary'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'products')}
                onClick={() => document.getElementById('products-file')?.click()}
              >
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                {productsFile ? (
                  <div>
                    <p className="text-green-600 font-medium">{productsFile.name}</p>
                    <p className="text-sm text-gray-500">{(productsFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-700">Drop your products CSV here, or click to browse</p>
                    <p className="text-sm text-gray-500 mt-1">Shopify product export format</p>
                  </div>
                )}
                <input
                  id="products-file"
                  type="file"
                  accept=".csv"
                  onChange={handleProductsFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Helpful guidance */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900">Before you upload</p>
                <ul className="mt-2 text-sm text-gray-700 space-y-1">
                  <li>• Export from Shopify: Products → Export</li>
                  <li>• Make sure each size has a product code</li>
                  <li>• CSV should include product images</li>
                </ul>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-900">Common issues</p>
                <ul className="mt-2 text-sm text-amber-800 space-y-1">
                  <li>• Missing product codes means sizes get skipped</li>
                  <li>• Products with no sizes can’t be purchased</li>
                  <li>• Re-import after fixing the CSV</li>
                </ul>
              </div>
            </div>

            {/* Inventory File - DISABLED UNTIL WE GET REAL DATA FROM HAFALOHA */}
            {/* 
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inventory CSV <span className="text-gray-500">(Optional)</span>
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
                  isDragging ? 'border-tsPrimary bg-red-50' : 'border-gray-300 hover:border-tsPrimary'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'inventory')}
                onClick={() => document.getElementById('inventory-file')?.click()}
              >
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                {inventoryFile ? (
                  <div>
                    <p className="text-green-600 font-medium">{inventoryFile.name}</p>
                    <p className="text-sm text-gray-500">{(inventoryFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-700">Drop your inventory CSV here, or click to browse</p>
                    <p className="text-sm text-gray-500 mt-1">SKU and quantity data</p>
                  </div>
                )}
                <input
                  id="inventory-file"
                  type="file"
                  accept=".csv"
                  onChange={handleInventoryFileChange}
                  className="hidden"
                />
              </div>
            </div>
            */}

            {/* Note about inventory */}
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Inventory CSV upload will be enabled once we receive Hafaloha's inventory export format and test the implementation.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!productsFile || isUploading}
              className="btn-primary w-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Start Import
                </>
              )}
            </button>
          </form>
        </div>

        {/* Current Import Progress */}
        {currentImport && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Import in Progress</h2>
            <div className="p-4 bg-blue-50 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-4"></div>
                  <div>
                    <p className="font-medium text-gray-900">{currentImport.filename}</p>
                    <p className="text-sm text-gray-600 capitalize">{currentImport.status}...</p>
                    {currentImport.current_step && (
                      <p className="text-xs text-gray-500 mt-1">{currentImport.current_step}</p>
                    )}
                  </div>
                </div>
                {currentImport.status === 'processing' && (
                  <div className="text-right">
                    <p className="text-sm text-gray-600">You can leave this page - import will continue in the background</p>
                    <p className="text-xs text-gray-500 mt-1">ETA: {formatEta(currentImport.eta_seconds)}</p>
                  </div>
                )}
              </div>

              {currentImport.total_products > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                    <span>
                      {currentImport.processed_products}/{currentImport.total_products} products processed
                    </span>
                    <span>{currentImport.progress_percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${currentImport.progress_percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import History */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Import History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skipped</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Images</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {imports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No imports yet. Upload your first CSV file above.
                    </td>
                  </tr>
                ) : (
                  imports.map((imp) => (
                    <tr key={imp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(imp.status)}
                          <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(imp.status)}`}>
                            {imp.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{imp.filename}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {imp.products_count > 0 ? (
                          <span className="text-green-600 font-medium">
                            {imp.products_count} created
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {imp.skipped_count > 0 ? (
                          <span className="text-orange-600 font-medium">
                            {imp.skipped_count} skipped
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{imp.images_count || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(imp.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                        <br />
                        <span className="text-xs text-gray-400">
                          {new Date(imp.created_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => viewImportDetails(imp.id)}
                          className="link-primary"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Import Details Modal */}
        {selectedImport && (
          <div 
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setSelectedImport(null)}
          >
            <div
              className="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col min-h-0 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - fixed at top */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Import Details</h3>
                  <button
                    onClick={() => setSelectedImport(null)}
                    className="btn-icon text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Content - scrollable */}
              <div
                ref={modalContentRef}
                className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 overscroll-contain"
                onWheel={(event) => {
                  // Force wheel/trackpad scrolling to target this container
                  if (modalContentRef.current) {
                    modalContentRef.current.scrollTop += event.deltaY;
                  }
                  event.stopPropagation();
                  event.preventDefault();
                }}
              >
                  {/* Status */}
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <div className="flex items-center mt-1">
                      {getStatusIcon(selectedImport.status)}
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(selectedImport.status)}`}>
                        {selectedImport.status}
                      </span>
                    </div>
                  </div>

                  {/* Progress (for pending/processing imports) */}
                  {['pending', 'processing'].includes(selectedImport.status) && selectedImport.total_products > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Progress</label>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                          <span>
                            {selectedImport.processed_products}/{selectedImport.total_products} products processed
                          </span>
                          <span>{selectedImport.progress_percent}%</span>
                        </div>
                        <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${selectedImport.progress_percent}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          ETA: {formatEta(selectedImport.eta_seconds)}
                        </div>
                        {selectedImport.current_step && (
                          <div className="mt-1 text-xs text-gray-500">{selectedImport.current_step}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Files */}
                  <div>
                    <label className="text-sm font-medium text-gray-500">File</label>
                    <p className="mt-1 text-gray-900">{selectedImport.filename}</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Products</label>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{selectedImport.products_count}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Variants</label>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">
                        {selectedImport.variants_count}
                        {selectedImport.variants_skipped_count > 0 && (
                          <span className="text-sm text-orange-600 font-normal ml-2">
                            ({selectedImport.variants_skipped_count} skipped)
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Images</label>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{selectedImport.images_count}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Collections</label>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{selectedImport.collections_count}</p>
                    </div>
                  </div>

                  {/* Critical issues banner */}
                  {selectedImport.warnings?.some(w => w.includes('CRITICAL')) && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                      <p className="text-sm font-bold text-red-800 flex items-center">
                        <XCircle className="w-4 h-4 mr-2" />
                        Action Needed
                      </p>
                      <p className="text-sm text-red-700 mt-1">
                        Some products can’t be purchased because they have no sizes/options.
                      </p>
                    </div>
                  )}

                  {/* Skipped variants warning */}
                  {selectedImport.variants_skipped_count > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-orange-800">
                        {selectedImport.variants_skipped_count} size option{selectedImport.variants_skipped_count > 1 ? 's' : ''} skipped because product codes were missing
                      </p>
                      <p className="text-xs text-orange-700 mt-1">
                        Add product codes in Shopify, then re-export and re-import.
                      </p>
                    </div>
                  )}

                  {selectedImport.skipped_count > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-yellow-800">
                        {selectedImport.skipped_count} product{selectedImport.skipped_count > 1 ? 's' : ''} skipped (already exists or missing SKUs)
                      </p>
                    </div>
                  )}

                  {/* Next steps */}
                  {(selectedImport.variants_skipped_count > 0 || selectedImport.warnings?.some(w => w.includes('CRITICAL'))) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-800">Next steps</p>
                      <ul className="mt-2 text-sm text-blue-700 space-y-1">
                        <li>• Add missing product codes in Shopify</li>
                        <li>• Re-export the CSV and re-import</li>
                        <li>• Or manually add sizes/options in the admin</li>
                      </ul>
                    </div>
                  )}

                  {/* Import Log - Organized by type */}
                  {selectedImport.warnings && selectedImport.warnings.length > 0 && (
                    <ImportLogSection warnings={selectedImport.warnings} />
                  )}

                  {/* Errors */}
                  {selectedImport.error_messages && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 flex items-center">
                        <XCircle className="w-4 h-4 mr-1 text-red-600" />
                        Errors
                      </label>
                      <p className="mt-2 text-sm text-red-700 bg-red-50 p-3 rounded">{selectedImport.error_messages}</p>
                    </div>
                  )}

                  {/* Timing */}
                  {selectedImport.duration && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Duration</label>
                      <p className="mt-1 text-gray-900">{selectedImport.duration.toFixed(2)} seconds</p>
                    </div>
                  )}

                  {/* User */}
                  <div>
                    <label className="text-sm font-medium text-gray-500">Imported By</label>
                    <p className="mt-1 text-gray-900">{selectedImport.user.name} ({selectedImport.user.email})</p>
                  </div>
                </div>

              {/* Footer - fixed at bottom */}
              <div className="p-6 border-t border-gray-200">
                <button
                  onClick={() => setSelectedImport(null)}
                  className="btn-secondary w-full"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

