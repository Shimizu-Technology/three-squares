import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, X, AlertCircle, CheckCircle, Download } from 'lucide-react';
import type { Product, DetailedProduct } from '../../components/admin/products';
import {
  ProductFilters,
  ProductsTable,
  ProductDetailModal,
} from '../../components/admin/products';
import { SkeletonListPage } from '../../components/admin';

import { authGet, authPatch, authPost } from '../../services/authApi';

interface ProductListResponse {
  data: Product[];
}

interface ProductDetailResponse {
  data: DetailedProduct;
}

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: { row: number; name?: string; error: string }[];
}

interface ImportResultResponse {
  data: ImportResult;
}

const CSV_TEMPLATE = `name,description,price,category_name,active
Beef Tapa,Marinated beef served with garlic rice and egg,12.99,Breakfast,true
Chicken Adobo,Classic Filipino chicken adobo with steamed rice,11.50,Lunch,true
Pancit Canton,Stir-fried noodles with vegetables and pork,9.99,Mains,true
Halo-Halo,Shaved ice dessert with mixed ingredients,7.50,Desserts,true
Bottled Water,Cold bottled water 500ml,1.50,Drinks,true
`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminProductsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<DetailedProduct | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Import CSV state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPublished, setFilterPublished] = useState<'all' | 'true' | 'false' | 'archived' | 'attention'>('all');
  const [filterType, setFilterType] = useState('all');
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock' | 'created'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const itemsPerPage = 25;

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = selectedProduct ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedProduct]);

  useEffect(() => { fetchProducts(); }, []);

  // Reset page on filter/sort change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterPublished, filterType, sortBy, sortDir]);

  // ── Fetch ──────────────────────────────────────────────
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await authGet<ProductListResponse>('/admin/products', getToken, {
        params: { show_archived: true },
      });
      const all = response.data.data;
      setProducts(all);
      setProductTypes([...new Set(all.map((p: Product) => p.product_type).filter(Boolean))] as string[]);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductDetails = async (slug: string) => {
    try {
      setLoadingDetails(true);
      const response = await authGet<ProductDetailResponse>(`/admin/products/${slug}`, getToken);
      setSelectedProduct(response.data.data);
    } catch (err) {
      console.error('Failed to fetch product details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // ── Actions ────────────────────────────────────────────
  const handleTogglePublished = async (product: Product) => {
    try {
      await authPatch(`/admin/products/${product.id}`, { product: { published: !product.published } }, getToken);
      toast.success(product.published ? 'Product unpublished' : 'Product published');
      fetchProducts();
    } catch { toast.error('Failed to update product'); }
  };

  const handleArchive = async (product: Product) => {
    try {
      await authPost(`/admin/products/${product.id}/archive`, {}, getToken);
      toast.success('Product archived');
      fetchProducts();
    } catch { toast.error('Failed to archive product'); }
  };

  const handleUnarchive = async (product: Product) => {
    try {
      await authPost(`/admin/products/${product.id}/unarchive`, {}, getToken);
      toast.success('Product restored');
      fetchProducts();
    } catch { toast.error('Failed to restore product'); }
  };

  const handleDuplicate = async (product: Product) => {
    try {
      await authPost(`/admin/products/${product.id}/duplicate`, {}, getToken);
      toast.success('Product duplicated');
      fetchProducts();
    } catch { toast.error('Failed to duplicate product'); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const response = await authPost<ImportResultResponse>(
        '/admin/products/import_csv',
        formData,
        getToken,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setImportResult(response.data.data);
      if (response.data.data.imported > 0) {
        fetchProducts();
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setImportError(axiosErr?.response?.data?.error || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSort = (column: 'name' | 'price' | 'stock' | 'created') => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  // ── Filter + Sort + Paginate ───────────────────────────
  const filteredProducts = products.filter((product) => {
    if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPublished === 'archived') {
      if (!product.archived) return false;
    } else if (filterPublished === 'attention') {
      if (!product.needs_attention) return false;
    } else if (filterPublished !== 'all') {
      if (product.archived) return false;
      if (product.published.toString() !== filterPublished) return false;
    } else {
      if (product.archived) return false;
    }
    if (filterType !== 'all' && product.product_type !== filterType) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'price': cmp = a.base_price_cents - b.base_price_cents; break;
      case 'stock': {
        const sa = a.inventory_level === 'product' ? (a.product_stock_quantity || 0) : a.inventory_level === 'variant' ? (a.total_variant_stock || 0) : 0;
        const sb = b.inventory_level === 'product' ? (b.product_stock_quantity || 0) : b.inventory_level === 'variant' ? (b.total_variant_stock || 0) : 0;
        cmp = sa - sb;
        break;
      }
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">
            Showing <span className="font-semibold text-gray-700">{filteredProducts.length}</span> of {products.length} products
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowImportModal(true);
              setImportFile(null);
              setImportResult(null);
              setImportError(null);
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button onClick={() => navigate('/admin/products/new')} className="btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <ProductFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterPublished={filterPublished}
        onPublishedChange={setFilterPublished}
        filterType={filterType}
        onTypeChange={setFilterType}
        productTypes={productTypes}
        onClear={() => { setSearchQuery(''); setFilterPublished('all'); setFilterType('all'); }}
      />

      {/* Content */}
      {loading ? (
        <SkeletonListPage />
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <ProductsTable
          products={paginatedProducts}
          currentPage={currentPage}
          totalPages={totalPages}
          totalFiltered={sortedProducts.length}
          itemsPerPage={itemsPerPage}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          onPageChange={setCurrentPage}
          onView={(p) => fetchProductDetails(p.slug)}
          onTogglePublished={handleTogglePublished}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          loading={loadingDetails}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !isImporting && setShowImportModal(false)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Import Products from CSV</h3>
              {!isImporting && (
                <button onClick={() => setShowImportModal(false)} className="btn-icon text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {!importResult ? (
                <>
                  {/* Template download */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-medium">CSV Format</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Columns: <code>name, description, price, category_name, active</code>
                    </p>
                    <button
                      onClick={downloadTemplate}
                      className="mt-2 flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium"
                    >
                      <Download className="w-3 h-3" />
                      Download template
                    </button>
                  </div>

                  {/* File picker */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select CSV file
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                    />
                    {importFile && (
                      <p className="mt-1 text-xs text-gray-500">{importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</p>
                    )}
                  </div>

                  {importError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">{importError}</p>
                    </div>
                  )}
                </>
              ) : (
                /* Results */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-gray-900">Import Complete</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
                      <p className="text-xs text-green-600">Imported</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-orange-700">{importResult.skipped}</p>
                      <p className="text-xs text-orange-600">Skipped</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-gray-700">{importResult.total}</p>
                      <p className="text-xs text-gray-500">Total rows</p>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="border border-orange-200 rounded-lg overflow-hidden">
                      <div className="bg-orange-50 px-4 py-2">
                        <p className="text-sm font-medium text-orange-800">{importResult.errors.length} row{importResult.errors.length > 1 ? 's' : ''} with errors</p>
                      </div>
                      <ul className="divide-y divide-orange-100 max-h-40 overflow-y-auto">
                        {importResult.errors.map((err, i) => (
                          <li key={i} className="px-4 py-2 text-sm text-orange-700">
                            <span className="font-medium">Row {err.row}{err.name ? ` (${err.name})` : ''}:</span> {err.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-gray-200">
              {!importResult ? (
                <>
                  <button
                    onClick={() => setShowImportModal(false)}
                    disabled={isImporting}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!importFile || isImporting}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Import
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportResult(null);
                    setImportFile(null);
                  }}
                  className="btn-primary flex-1"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
