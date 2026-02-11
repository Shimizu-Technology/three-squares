interface ProductFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterPublished: 'all' | 'true' | 'false' | 'archived' | 'attention';
  onPublishedChange: (value: 'all' | 'true' | 'false' | 'archived' | 'attention') => void;
  filterType: string;
  onTypeChange: (type: string) => void;
  productTypes: string[];
  onClear: () => void;
}

export default function ProductFilters({
  searchQuery,
  onSearchChange,
  filterPublished,
  onPublishedChange,
  filterType,
  onTypeChange,
  productTypes,
  onClear,
}: ProductFiltersProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Search</label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition text-sm"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Published Filter */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
          <select
            value={filterPublished}
            onChange={(e) => onPublishedChange(e.target.value as 'all' | 'true' | 'false' | 'archived' | 'attention')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
          >
            <option value="all">All Products</option>
            <option value="true">Published</option>
            <option value="false">Draft</option>
            <option value="archived">Archived</option>
            <option value="attention">⚠ Needs Attention</option>
          </select>
        </div>

        {/* Type Filter */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
          <select
            value={filterType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
          >
            <option value="all">All Types</option>
            {productTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Clear */}
        <div className="flex items-end">
          <button
            onClick={onClear}
            className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition text-sm font-medium text-gray-600 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
