import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, Upload } from 'lucide-react';
import type { Product, DetailedProduct } from '../../components/admin/products';
import {
  ProductFilters,
  ProductsTable,
  ProductDetailModal,
} from '../../components/admin/products';
import AdminRequestState from '../../components/admin/AdminRequestState';
import { useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import LocalAvailabilityToggle from '../../components/admin/LocalAvailabilityToggle';
import { readMenuImportReceipt } from '../../components/admin/import/menuImportReceipt';
import { SkeletonListPage } from '../../components/admin';

import { parseProductQuery, productListPath, clampProductPage, productScrollKey, readProductScroll, writeProductScroll } from '../../components/admin/products/productQueryState';

import { authGet, authPatch, authPost } from '../../services/authApi';

interface ProductListResponse {
  data: Product[];
}

interface ProductDetailResponse {
  data: DetailedProduct;
}

export default function AdminProductsPage() {
  const { getToken, userId } = useAuth();
  const access = useStaffAccess();
  const availabilityLocations = access.user?.authorized_locations || [];
  const [availabilityLocationId, setAvailabilityLocationId] = useState<number | null>(availabilityLocations[0]?.id || null);
  const availabilityLocation = availabilityLocations.find(location => location.id === availabilityLocationId);
  const saveLocalAvailability = (productId: number, locationId: number, available: boolean) => {
    if (!active.current) return;
    setProducts(current => current.map(product => {
      if (product.id !== productId) return product;
      const locations = product.location_ids || [];
      return { ...product, location_ids: available ? [...new Set([...locations, locationId])] : locations.filter(id => id !== locationId) };
    }));
  };
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
  const detailActivationRef = useRef<HTMLElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);

  // URL is the only source of list state; POP navigation never syncs from stale local state.
  const query = parseProductQuery(location.search);
  const { page: requestedPage, q: searchQuery, published: filterPublished, type: filterType, sort: sortBy, dir: sortDir } = query;
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const itemsPerPage = 25;
  const listPath = productListPath(query);
  const batchReceipt = query.batch ? readMenuImportReceipt(userId || '', query.batch) : null;
  const batchProductIds = new Set(batchReceipt?.result.created.map(row => row.product_id) || []);
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

  const openImport = () => {
    writeProductScroll(scrollKey, window.scrollY);
    navigate(`/admin/import?${new URLSearchParams({ returnTo: listPath })}`, {
      state: { productListReturn: { path: listPath, entryKey, index: window.history.state?.idx } },
    });
  };

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
    // Capture the actual row control before authentication/network work can move focus.
    // Retry preserves the original opener, rather than returning to a removed retry button.
    if (detailTarget?.slug !== product.slug) {
      detailReturnFocusRef.current = detailActivationRef.current ||
        (typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
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

  const handleSort = (column: 'name' | 'price' | 'stock' | 'created') => {
    changeQuery({ sort: column, dir: sortBy === column && sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
  };

  // ── Filter + Sort + Paginate ───────────────────────────
  const filteredProducts = products.filter((product) => {
    if (query.batch && !batchProductIds.has(product.id)) return false;
    if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPublished === 'archived') {
      if (!product.archived) return false;
    } else if (filterPublished === 'pickup_locations') {
      if (!product.needs_pickup_locations) return false;
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

  useLayoutEffect(() => {
    if (!hasLoaded || loading) return;
    const save = () => {
      // Route removal can clamp the page before passive effect cleanup. Never
      // let that editor/filter scroll overwrite the departing list's position.
      if (window.location.pathname !== '/admin/products' ||
          productListPath(parseProductQuery(window.location.search)) !== listPath) return;
      writeProductScroll(scrollKey, window.scrollY);
    };
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('scroll', save);
      window.removeEventListener('pagehide', save);
    };
  }, [hasLoaded, loading, scrollKey, listPath]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-6" onClickCapture={(event) => {
      detailActivationRef.current = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, a[href], [tabindex]') : null;
    }} onBlurCapture={() => { searchEditing.current = false; }}>
      {/* Header */}
      <AdminPageHeader title="Products"
        subtitle={hasLoaded ? <>Showing <span className="font-semibold text-gray-700">{filteredProducts.length}</span> of {products.length} products{(loading || loadError) && ' (last loaded)'}</> : 'Browse and manage your products'}
        actions={<>
          <IconButton onClick={fetchProducts} loading={loading} aria-label="Refresh products" title="Refresh products"><RefreshCw /></IconButton>
          <Button onClick={openImport} variant="secondary" icon={<Upload />}>Menu CSV</Button>
          <Button onClick={() => openEditor()} icon={<Plus />}>Add Product</Button>
        </>}
      />

      {query.batch && <section role="status" className="mb-4 rounded-xl border border-gray-300 bg-white p-4 [overflow-wrap:anywhere]">
        <p className="font-semibold text-gray-900">{batchReceipt ? `Reviewing ${batchReceipt.filename}` : 'This batch receipt is unavailable in this tab'}</p>
        <p className="mt-1 text-sm text-gray-700">{batchReceipt ? `${batchReceipt.result.created.length} products from this import. Batch results are stored for this account in this tab.` : 'It may be from another tab or account, or browser storage was cleared. Use Needs pickup locations to find unfinished drafts.'}</p>
        <button type="button" className="btn-secondary mt-3 min-h-11" onClick={() => changeQuery({ batch: undefined, page: 1 })}>Clear batch filter</button>
      </section>}

      {/* Filters */}
      {access.can('availability.manage') && availabilityLocations.length > 0 && <section className="mb-4 rounded-xl border border-gray-300 bg-white p-4">
        <label className="block text-sm font-semibold text-gray-800">Pickup availability location
          <select aria-label="Pickup availability location" value={availabilityLocationId || ''} disabled={access.user?.operational_scope === 'specific'} onChange={event => setAvailabilityLocationId(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base sm:max-w-sm">
            {availabilityLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <p className="mt-2 text-sm text-gray-600">Mark a meal sold out or restore it at this counter.</p>
      </section>}

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
        !loading && !loadError && (!query.batch || batchReceipt) && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
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
          renderAvailability={availabilityLocation && access.can('availability.manage') ? product => product.needs_pickup_locations ? <p className="text-sm text-amber-900">Edit this draft to assign pickup locations before publishing.</p> : product.allow_pickup ? <LocalAvailabilityToggle key={`${product.id}:${availabilityLocation.id}`} productId={product.id} productName={product.name} locationId={availabilityLocation.id} locationName={availabilityLocation.name} available={(product.location_ids || []).includes(availabilityLocation.id)} disabled={loading || loadError} onSaved={saveLocalAvailability} /> : <p className="text-sm text-gray-600">Pickup not offered</p> : undefined}
        />
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          loading={loadingDetails}
          returnFocusRef={detailReturnFocusRef}
          onClose={closeProductDetails}
          onEdit={openEditor}
        />
      )}

    </div>
  );
}
