interface OrderFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearch: () => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  orderTypeFilter: string;
  onOrderTypeFilterChange: (type: string) => void;
  businessLineFilter: string;
  onBusinessLineFilterChange: (value: string) => void;
  fulfillmentFilter: string;
  onFulfillmentFilterChange: (value: string) => void;
  locationFilter: string;
  onLocationFilterChange: (value: string) => void;
  locationOptions: Array<{ id: number; name: string }>;
  datePreset: string;
  onDatePresetChange: (preset: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}

export default function OrderFilters({
  searchQuery,
  onSearchChange,
  onSearch,
  statusFilter,
  onStatusFilterChange,
  orderTypeFilter,
  onOrderTypeFilterChange,
  businessLineFilter,
  onBusinessLineFilterChange,
  fulfillmentFilter,
  onFulfillmentFilterChange,
  locationFilter,
  onLocationFilterChange,
  locationOptions,
  datePreset,
  onDatePresetChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: OrderFiltersProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="md:col-span-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search by order #, email, or name..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent focus:bg-white transition text-sm"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <button onClick={onSearch} className="btn-primary px-6 py-2.5 text-sm">
              Search
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed (Pickup)</option>
          <option value="processing">Processing (Retail)</option>
          <option value="ready">Ready (Pickup)</option>
          <option value="shipped">Shipped (Retail)</option>
          <option value="picked_up">Picked Up</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Order Type and Date Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-4">
        <select
          value={orderTypeFilter}
          onChange={(e) => onOrderTypeFilterChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
        >
          <option value="all">All Types</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>

        <select
          value={businessLineFilter}
          onChange={(e) => onBusinessLineFilterChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
        >
          <option value="all">All Business Lines</option>
          <option value="three_squares">Three Squares</option>
          <option value="latte_stone">Latte Stone Cookies</option>
          <option value="catering">Catering</option>
        </select>

        <select
          value={fulfillmentFilter}
          onChange={(e) => onFulfillmentFilterChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
        >
          <option value="all">All Fulfillment</option>
          <option value="pickup">Pickup</option>
          <option value="shipping">Shipping</option>
        </select>

        <select
          value={locationFilter}
          onChange={(e) => onLocationFilterChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
        >
          <option value="all">All Locations</option>
          {locationOptions.map((location) => (
            <option key={location.id} value={String(location.id)}>
              {location.name}
            </option>
          ))}
        </select>

        <select
          value={datePreset}
          onChange={(e) => onDatePresetChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent hover:border-gray-300 transition text-sm"
        >
          <option value="today">Today</option>
          <option value="last_7_days">Last 7 days</option>
          <option value="this_month">This month</option>
          <option value="all_time">All time</option>
          <option value="custom">Custom range</option>
        </select>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent text-sm"
            aria-label="Start date"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent text-sm"
            aria-label="End date"
          />
        </div>
      </div>
    </div>
  );
}
