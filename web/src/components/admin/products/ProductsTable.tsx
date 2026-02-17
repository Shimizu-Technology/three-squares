import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Edit, MoreVertical, Archive, ArchiveRestore, Copy, Globe, GlobeLock, ArrowUpDown, AlertTriangle } from 'lucide-react';
import type { Product } from './productUtils';
import { formatCurrency, getStockDisplay } from './productUtils';
import PlaceholderImage from '../../ui/PlaceholderImage';

interface ProductsTableProps {
  products: Product[];
  currentPage: number;
  totalPages: number;
  totalFiltered: number;
  itemsPerPage: number;
  sortBy: 'name' | 'price' | 'stock' | 'created';
  sortDir: 'asc' | 'desc';
  onSort: (column: 'name' | 'price' | 'stock' | 'created') => void;
  onPageChange: (page: number) => void;
  onView: (product: Product) => void;
  onTogglePublished: (product: Product) => void;
  onArchive: (product: Product) => void;
  onUnarchive: (product: Product) => void;
  onDuplicate: (product: Product) => void;
}

export default function ProductsTable({
  products,
  currentPage,
  totalPages,
  totalFiltered,
  itemsPerPage,
  sortBy,
  sortDir: _sortDir, // eslint-disable-line @typescript-eslint/no-unused-vars
  onSort,
  onPageChange,
  onView,
  onTogglePublished,
  onArchive,
  onUnarchive,
  onDuplicate,
}: ProductsTableProps) {
  const navigate = useNavigate();
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

  const ActionMenu = ({ product }: { product: Product }) => (
    <div className="relative">
      <button
        onClick={() => setActionMenuOpen(actionMenuOpen === product.id ? null : product.id)}
        className="min-w-[44px] min-h-[44px] p-2.5 text-gray-400 hover:text-gray-600 rounded btn-icon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {actionMenuOpen === product.id && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setActionMenuOpen(null)} />
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border z-20">
            <button
              onClick={() => { onTogglePublished(product); setActionMenuOpen(null); }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              {product.published ? <><GlobeLock className="w-4 h-4" /> Unpublish</> : <><Globe className="w-4 h-4" /> Publish</>}
            </button>
            <button
              onClick={() => { onDuplicate(product); setActionMenuOpen(null); }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              <Copy className="w-4 h-4" /> Duplicate
            </button>
            {product.archived ? (
              <button
                onClick={() => { onUnarchive(product); setActionMenuOpen(null); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
              >
                <ArchiveRestore className="w-4 h-4" /> Restore
              </button>
            ) : (
              <button
                onClick={() => { onArchive(product); setActionMenuOpen(null); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
              >
                <Archive className="w-4 h-4" /> Archive
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const StatusBadge = ({ product }: { product: Product }) => (
    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
      product.archived ? 'bg-orange-100 text-orange-800' :
      product.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
    }`}>
      {product.archived ? 'Archived' : product.published ? 'Published' : 'Draft'}
    </span>
  );

  const ProductImage = ({ product, size = 'w-12 h-12' }: { product: Product; size?: string }) => (
    product.primary_image_url ? (
      <img src={product.primary_image_url} alt={product.name} className={`${size} object-cover rounded`} />
    ) : (
      <div className={`${size} border border-gray-300 rounded overflow-hidden`}>
        <PlaceholderImage variant="thumbnail" className="bg-gray-100" />
      </div>
    )
  );

  const StockCell = ({ product }: { product: Product }) => {
    const stockDisplay = getStockDisplay(product);
    return (
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${stockDisplay.color}`} title={stockDisplay.tooltip}>
          {stockDisplay.value}
        </span>
        {stockDisplay.outOfStock && (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">Out</span>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => onSort('name')}>
                <div className="flex items-center gap-1">Product {sortBy === 'name' && <ArrowUpDown className="w-3 h-3" />}</div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => onSort('price')}>
                <div className="flex items-center gap-1">Price {sortBy === 'price' && <ArrowUpDown className="w-3 h-3" />}</div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variants</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => onSort('stock')}>
                <div className="flex items-center gap-1">Stock {sortBy === 'stock' && <ArrowUpDown className="w-3 h-3" />}</div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <ProductImage product={product} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-gray-900">{product.name}</p>
                        {product.needs_attention && (
                          <span title={product.import_notes || 'Needs attention'} className="inline-flex items-center">
                            <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
                            <span className="sr-only">{product.import_notes || 'Needs attention'}</span>
                          </span>
                        )}
                      </div>
                      {product.featured && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Featured</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(product.base_price_cents)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.variant_count}</td>
                <td className="px-6 py-4 whitespace-nowrap"><StockCell product={product} /></td>
                <td className="px-6 py-4 whitespace-nowrap"><StatusBadge product={product} /></td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onView(product)} className="text-tsPrimary hover:text-red-700 font-medium inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 rounded">
                      <Eye className="w-4 h-4 mr-1" /> View
                    </button>
                    <button onClick={() => navigate(`/admin/products/${product.id}/edit`)} className="text-blue-600 hover:text-blue-900 font-medium inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 rounded">
                      <Edit className="w-4 h-4 mr-1" /> Edit
                    </button>
                    <ActionMenu product={product} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex gap-3 mb-3">
              <ProductImage product={product} size="w-16 h-16" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-gray-900">{product.name}</p>
                  {product.needs_attention && (
                    <span title={product.import_notes || 'Needs attention'} className="inline-flex items-center">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                      <span className="sr-only">{product.import_notes || 'Needs attention'}</span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{formatCurrency(product.base_price_cents)}</p>
              </div>
              <StatusBadge product={product} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <span className="text-gray-600">Variants:</span>
                <span className="ml-1 font-medium">{product.variant_count}</span>
              </div>
              <div>
                <span className="text-gray-600">Stock:</span>
                <span className="ml-1"><StockCell product={product} /></span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onView(product)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-center inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
                <Eye className="w-4 h-4 mr-1" /> View
              </button>
              <button onClick={() => navigate(`/admin/products/${product.id}/edit`)} className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2">
                <Edit className="w-4 h-4 mr-1" /> Edit
              </button>
              <ActionMenu product={product} />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white px-6 py-4 rounded-lg shadow">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalFiltered)}</span>{' '}
            of <span className="font-medium">{totalFiltered}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              Previous
            </button>
            <div className="flex gap-1">
              {[...Array(totalPages)].map((_, i) => {
                const page = i + 1;
                if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                  return (
                    <button
                      key={page}
                      onClick={() => onPageChange(page)}
                      className={`px-3 py-2 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 ${
                        currentPage === page ? 'bg-tsPrimary text-white' : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="px-2 py-2">...</span>;
                }
                return null;
              })}
            </div>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
