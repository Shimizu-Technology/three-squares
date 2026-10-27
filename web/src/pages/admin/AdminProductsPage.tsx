import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, X, AlertCircle, CheckCircle, Download } from 'lucide-react';
import type { Product, DetailedProduct } from '../../components/admin/products';
import {
  ProductFilters,
  ProductsTable,
  ProductDetailModal,
} from '../../components/admin/products';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { SkeletonListPage } from '../../components/admin';

import { parseProductQuery, productListPath, clampProductPage, productScrollKey, readProductScroll, writeProductScroll } from '../../components/admin/products/productQueryState';

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
  notices?: { row: number; name?: string; message: string }[];
}

interface ImportResultResponse {
  data: ImportResult;
}

const CSV_TEMPLATE = `name,description,price,category_name,active,locations
Beef Tapa,Marinated beef served with garlic rice and egg,12.99,Breakfast,true,three-squares-main
Chicken Adobo,Classic Filipino chicken adobo with steamed rice,11.50,Lunch,true,three-squares-main;three-squares-donki
Pancit Canton,Stir-fried noodles with vegetables and pork,9.99,Mains,true,three-squares-main
Halo-Halo,Shaved ice dessert with mixed ingredients,7.50,Desserts,true,three-squares-donki
Bottled Water,Cold bottled water 500ml,1.50,Drinks,true,three-squares-main;three-squares-donki
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
  const { getToken, userId } = useAuth();
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);
  const active = useRef(false);
  const [selectedProduct, setSelectedProduct] = useState<DetailedProduct | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Product | null>(null);
  const detailRequestId = useRef(0);

  const importDialog = useRef<HTMLDivElement>(null);

  // Import CSV state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // URL is the only source of list state; POP navigation never syncs from stale local state.
  const query = parseProductQuery(location.search);
  const { page: requestedPage, q: searchQuery, published: filterPublished, type: filterType, sort: sortBy, dir: sortDir } = query;
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const itemsPerPage = 25;
  const listPath = productListPath(query);
  const returnEntry = location.state?.productScrollEntry;
  const entryKey = typeof returnEntry === 'string' && returnEntry.length <= 100 ? returnEntry : location.key;
  const scrollKey = productScrollKey(userId || '', entryKey, listPath);
  const searchEditing = useRef(false);
  useEffect(() => {
    if (navigationType === 'POP') searchEditing.current = false;
  }, [navigationType, location.key]);

  const changeQuery = (patch: Partial<typeof query>, replace = false) => {
    writeProductScroll(scrollKey, window.scrollY);
    const path = productListPath(parseProductQuery(productListPath({ ...query, ...patch }).split('?')[1] || ''));
    if (path !== listPath) navigate(path, { replace });
  };

  const openEditor = (product?: Product) => {
    writeProductScroll(scrollKey, window.scrollY);
    const path = product ? `/admin/products/${product.id}/edit` : '/admin/products/new';
    navigate(`${path}?${new URLSearchParams({ returnTo: listPath })}`, {
      state: { productListReturn: { path: listPath, entryKey, index: window.history.state?.idx } },
    });
  };

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = selectedProduct || showImportModal ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedProduct, showImportModal]);

  useEffect(() => {
    if (!showImportModal) return;
    const previous = document.activeElement as HTMLElement | null;
    importDialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [showImportModal]);

  // ── Fetch ──────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!active.current) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await authGet<ProductListResponse>('/admin/products', getToken, {
        params: { show_archived: true },
      });
      if (id !== requestId.current) return;
      const all = response.data.data;
      setProducts(all);
      setProductTypes([...new Set(all.map((p: Product) => p.product_type).filter(Boolean))] as string[]);
      setHasLoaded(true);
      setLoadError(false);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('Failed to fetch products:', err);
      setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    active.current = true;
    void fetchProducts();
    return () => { active.current = false; requestId.current += 1; detailRequestId.current += 1; };
  }, [fetchProducts]);

  const fetchProductDetails = async (product: Product) => {
    const id = ++detailRequestId.current;
    if (detailTarget?.slug !== product.slug) setDetailError(false);
    setDetailTarget(product);
    setSelectedProduct(null);
    setLoadingDetails(true);
    try {
      const response = await authGet<ProductDetailResponse>(`/admin/products/${product.slug}`, getToken);
      if (id !== detailRequestId.current) return;
      setSelectedProduct(response.data.data);
      setDetailError(false);
    } catch (err) {
      if (id !== detailRequestId.current) return;
      console.error('Failed to fetch product details:', err);
      setDetailError(true);
    } finally {
      if (id === detailRequestId.current) setLoadingDetails(false);
    }
  };

  const closeProductDetails = () => {
    detailRequestId.current += 1;
    setSelectedProduct(null);
    setDetailTarget(null);
    setLoadingDetails(false);
    setDetailError(false);
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
    importDialog.current?.focus();
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
    changeQuery({ sort: column, dir: sortBy === column && sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
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
      case 'created': {
        const created = (product: Product) => Date.parse((product as Product & { created_at?: string }).created_at || '') || 0;
        cmp = created(a) - created(b);
        break;
      }
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

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / itemsPerPage));
  const currentPage = clampProductPage(requestedPage, sortedProducts.length, itemsPerPage);
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Canonicalize/clamp with replace only after authoritative data arrives. Never reset page on POP.
  useEffect(() => {
    if (loading || loadError || !hasLoaded) return;
    const canonical = productListPath({ ...parseProductQuery(location.search), page: currentPage });
    if (location.pathname + location.search !== canonical) navigate(canonical, { replace: true, state: location.state });
  }, [loading, loadError, hasLoaded, currentPage, location.pathname, location.search, location.state, navigate]);

  // Restore only once per rendered history entry, after rows exist (including a reload).
  const restoredEntry = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!hasLoaded || loading || restoredEntry.current === scrollKey) return;
    restoredEntry.current = scrollKey;
    const y = readProductScroll(scrollKey);
    if (y !== null) window.scrollTo({ top: y, behavior: 'instant' });
  }, [hasLoaded, loading, scrollKey]);

  useEffect(() => {
    if (!hasLoaded || loading) return;
    const save = () => writeProductScroll(scrollKey, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('scroll', save);
      window.removeEventListener('pagehide', save);
    };
  }, [hasLoaded, loading, scrollKey]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-6" onBlurCapture={() => { searchEditing.current = false; }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">
            {hasLoaded ? <>Showing <span className="font-semibold text-gray-700">{filteredProducts.length}</span> of {products.length} products{(loading || loadError) && ' (last loaded)'}</> : 'Browse and manage your products'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={fetchProducts} disabled={loading} className="btn-secondary min-h-[44px] disabled:opacity-60">Refresh products</button>
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
          <button onClick={() => openEditor()} className="btn-primary flex items-center gap-2">
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
        onSearchChange={q => { changeQuery({ q, page: 1 }, searchEditing.current); searchEditing.current = true; }}
        filterPublished={filterPublished}
        onPublishedChange={published => changeQuery({ published, page: 1 })}
        filterType={filterType}
        onTypeChange={type => changeQuery({ type, page: 1 })}
        productTypes={filterType === 'all' || productTypes.includes(filterType) ? productTypes : [...productTypes, filterType]}
        onClear={() => changeQuery({ q: '', published: 'all', type: 'all', page: 1 })}
      />

      <AdminRequestState resource="Products" loading={loading} error={loadError} hasData={hasLoaded} onRetry={fetchProducts} />
      {detailTarget && (loadingDetails || detailError) && <div className="space-y-2">
        <AdminRequestState resource={`Details for ${detailTarget.name}`} loading={loadingDetails} error={detailError} hasData={false} onRetry={() => fetchProductDetails(detailTarget)} />
        <button type="button" onClick={closeProductDetails} className="btn-secondary min-h-[44px]">Dismiss product details</button>
      </div>}

      {/* Content */}
      {loading && !hasLoaded ? (
        <SkeletonListPage />
      ) : !hasLoaded ? null : filteredProducts.length === 0 ? (
        !loading && !loadError && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">{searchQuery || filterPublished !== 'all' || filterType !== 'all' ? 'No products match your filters' : 'No products found'}</h3>
          <p className="text-gray-500">{searchQuery || filterPublished !== 'all' || filterType !== 'all' ? 'Try adjusting your filters or search query.' : 'Add a product to get started.'}</p>
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
          onPageChange={page => changeQuery({ page })}
          onView={fetchProductDetails}
          onEdit={openEditor}
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
          onClose={closeProductDetails}
          onEdit={openEditor}
        />
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !isImporting && setShowImportModal(false)}
        >
          <div
            ref={importDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-title"
            tabIndex={-1}
            className="bg-white rounded-lg w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isImporting) setShowImportModal(false);
              if (event.key !== 'Tab') return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]'));
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
                event.preventDefault(); last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 id="csv-import-title" className="text-lg font-semibold text-gray-900">Import Products from CSV</h3>
              {!isImporting && (
                <button aria-label="Close CSV import" onClick={() => setShowImportModal(false)} className="btn-icon text-gray-400 hover:text-gray-600">
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
                      Required: <code>name, price</code>. Optional: <code>description, category_name, active, locations</code>. Prices use dollars with at most two decimal places; active defaults to true. List pickup locations by name or slug, separated by semicolons; rows without locations are imported as unpublished drafts. Maximum 2 MB / 2,000 rows. Imports create new pickup-only products; existing products are skipped.
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
                    <label htmlFor="csv-import-file" className="block text-sm font-medium text-gray-700 mb-2">
                      Select CSV file
                    </label>
                    <input
                      id="csv-import-file"
                      type="file"
                      disabled={isImporting}
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                    />
                    {importFile && (
                      <p className="mt-1 text-xs text-gray-500">{importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</p>
                    )}
                  </div>

                  {importError && (
                    <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">{importError}</p>
                    </div>
                  )}
                </>
              ) : (
                /* Results */
                <div role="status" className="space-y-3">
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
                  {importResult.notices && importResult.notices.length > 0 && (
                    <div className="border border-blue-200 rounded-lg overflow-hidden">
                      <div className="bg-blue-50 px-4 py-2">
                        <p className="text-sm font-medium text-blue-800">{importResult.notices.length} draft{importResult.notices.length > 1 ? 's' : ''} need pickup locations</p>
                      </div>
                      <ul tabIndex={0} aria-label="Imported drafts that need pickup locations" className="divide-y divide-blue-100 max-h-40 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        {importResult.notices.map((notice, i) => (
                          <li key={i} className="px-4 py-2 text-sm text-blue-800">
                            <span className="font-medium">Row {notice.row}{notice.name ? ` (${notice.name})` : ''}:</span> {notice.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="border border-orange-200 rounded-lg overflow-hidden">
                      <div className="bg-orange-50 px-4 py-2">
                        <p className="text-sm font-medium text-orange-800">{importResult.errors.length} row{importResult.errors.length > 1 ? 's' : ''} with errors</p>
                      </div>
                      <ul tabIndex={0} aria-label="Rows skipped with errors" className="divide-y divide-orange-100 max-h-40 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
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
