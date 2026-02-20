import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Product, DetailedProduct } from '../../components/admin/products';
import {
  ProductFilters,
  ProductsTable,
  ProductDetailModal,
} from '../../components/admin/products';
import { SkeletonListPage } from '../../components/admin';

import { authGet, authPatch, authPost } from '../../services/authApi';
import { useBusinessLineStore } from '../../store/businessLineStore';

interface ProductListResponse {
  data: Product[];
}

interface ProductDetailResponse {
  data: DetailedProduct;
}

export default function AdminProductsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<DetailedProduct | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  const handleSort = (column: 'name' | 'price' | 'stock' | 'created') => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  // ── Filter + Sort + Paginate ───────────────────────────
  const selectedBusinessLine = useBusinessLineStore((s) => s.selected);
  const filteredProducts = products.filter((product) => {
    // Business line filter from global admin context
    if (selectedBusinessLine !== 'all' && product.business_line !== selectedBusinessLine) return false;
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
        <button onClick={() => navigate('/admin/products/new')} className="btn-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </button>
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
    </div>
  );
}
