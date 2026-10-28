import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { ActionMenu } from '../../ui/ActionMenu';
import { Pagination } from '../../ui/Pagination';
import { StatusBadge } from '../../ui/StatusBadge';
import { type ReactNode } from 'react';
import { Eye, Edit, Archive, ArchiveRestore, Copy, Globe, GlobeLock, ArrowUpDown, AlertTriangle } from 'lucide-react';
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
  onEdit: (product: Product) => void;
  onTogglePublished: (product: Product) => void;
  onArchive: (product: Product) => void;
  onUnarchive: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  renderAvailability?: (product: Product) => ReactNode;
}

export default function ProductsTable({
  products,
  currentPage,
  totalPages,
  totalFiltered,
  itemsPerPage,
  sortBy,
  sortDir,
  onSort,
  onPageChange,
  onView,
  onEdit,
  onTogglePublished,
  onArchive,
  onUnarchive,
  onDuplicate,
  renderAvailability,
}: ProductsTableProps) {
  const rowActions = (product: Product) => <ActionMenu label={`More actions for ${product.name}`}>
    <Button variant="ghost" icon={product.published ? <GlobeLock /> : <Globe />} onClick={() => onTogglePublished(product)}>{product.published ? 'Unpublish' : 'Publish'}</Button>
    <Button variant="ghost" icon={<Copy />} onClick={() => onDuplicate(product)}>Duplicate</Button>
    {product.archived
      ? <Button variant="ghost" icon={<ArchiveRestore />} onClick={() => onUnarchive(product)}>Restore</Button>
      : <Button variant="ghost" icon={<Archive />} onClick={() => onArchive(product)}>Archive</Button>}
  </ActionMenu>;

  const ProductStatus = ({ product }: { product: Product }) => (
    <div className="flex shrink-0 flex-col items-start gap-1">
    <StatusBadge tone={product.archived ? 'inactive' : product.published ? 'neutral' : 'inactive'}>
      {product.archived ? 'Archived' : product.published ? 'Published' : 'Draft'}
    </StatusBadge>
    {product.needs_pickup_locations && <span className="max-w-36 text-sm font-semibold text-amber-900">Needs pickup locations</span>}
    </div>
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
          <StatusBadge tone="attention">Out</StatusBadge>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden xl:block bg-white rounded-xl shadow-sm border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-2 text-left" aria-sort={sortBy === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <Button variant="ghost" aria-label="Sort by name" icon={<ArrowUpDown />} onClick={() => onSort('name')}>Product</Button>
              </th>
              <th className="px-6 py-2 text-left" aria-sort={sortBy === 'price' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <Button variant="ghost" aria-label="Sort by price" icon={<ArrowUpDown />} onClick={() => onSort('price')}>Price</Button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variants</th>
              <th className="px-6 py-2 text-left" aria-sort={sortBy === 'stock' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <Button variant="ghost" aria-label="Sort by stock" icon={<ArrowUpDown />} onClick={() => onSort('stock')}>Stock</Button>
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
                      {renderAvailability && <div className="mt-3">{renderAvailability(product)}</div>}
                      {product.featured && (
                        <StatusBadge tone="info">Featured</StatusBadge>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(product.base_price_cents)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.variant_count}</td>
                <td className="px-6 py-4 whitespace-nowrap"><StockCell product={product} /></td>
                <td className="px-6 py-4 whitespace-nowrap"><ProductStatus product={product} /></td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center gap-2">
                    <IconButton variant="secondary" aria-label={`View ${product.name}`} onClick={() => onView(product)}><Eye /></IconButton>
                    <IconButton variant="secondary" aria-label={`Edit ${product.name}`} onClick={() => onEdit(product)}><Edit /></IconButton>
                    {rowActions(product)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="xl:hidden space-y-4">
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
              <ProductStatus product={product} />
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
            {renderAvailability && <div className="mb-3">{renderAvailability(product)}</div>}
            <div className="flex justify-end gap-2">
              <IconButton variant="secondary" aria-label={`View ${product.name}`} onClick={() => onView(product)}><Eye /></IconButton>
              <IconButton variant="secondary" aria-label={`Edit ${product.name}`} onClick={() => onEdit(product)}><Edit /></IconButton>
              {rowActions(product)}
            </div>
          </div>
        ))}
      </div>

      <Pagination page={currentPage} totalPages={totalPages} totalCount={totalFiltered} perPage={itemsPerPage} onPageChange={onPageChange} />
    </>
  );
}
