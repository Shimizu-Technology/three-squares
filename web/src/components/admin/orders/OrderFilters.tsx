import AdminFilterBar from '../AdminFilterBar';
import { Disclosure } from '../../ui/Disclosure';
import { Field } from '../../ui/Field';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useRef, useState } from 'react';

interface OrderFiltersProps {
  pickupQueue?: boolean;
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
  pickupQueue = false,
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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(datePreset === 'custom' || statusFilter === 'all');
  const moreFiltersRef = useRef<HTMLDetailsElement>(null);

  if (pickupQueue) {
    return <AdminFilterBar label="Pickup queue filters" layout="custom">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={(event) => { event.preventDefault(); onSearch(); }} className="col-span-2 flex min-w-0 items-end gap-2 md:col-span-1">
          <Field label="Find an order"><Input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Name or order #" /></Field>
          <Button variant="primary" type="submit">Search</Button>
        </form>
        <Field label="Pickup location"><Select aria-label="Pickup location" value={locationFilter} onChange={(event) => onLocationFilterChange(event.target.value)}><option value="all">All locations</option>{locationOptions.map((location) => <option key={location.id} value={String(location.id)}>{location.name}</option>)}</Select></Field>
        <Field label="Period"><Select aria-label="Period" value={datePreset} onChange={(event) => {
          if (event.target.value === 'custom') {
            // Native disclosure state may have changed without a prop change.
            setMoreFiltersOpen(true);
            if (moreFiltersRef.current) moreFiltersRef.current.open = true;
          }
          onDatePresetChange(event.target.value);
        }}><option value="today">Today</option><option value="last_7_days">Last 7 days</option><option value="this_month">This month</option><option value="all_time">All time</option><option value="custom">Custom range</option></Select></Field>
      </div>
      <div className="mt-2"><Disclosure ref={moreFiltersRef} open={moreFiltersOpen} onToggle={(event) => setMoreFiltersOpen(event.currentTarget.open)} title={<>More filters{orderTypeFilter !== 'all' || businessLineFilter !== 'all' || datePreset === 'custom' || statusFilter === 'all' ? ' · filters applied' : ''}</>}>

        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Field label="Stage"><Select aria-label="Stage" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>{[['all','All pickup orders'],['new_paid','New paid'],['confirmed','Acknowledged'],['ready','Ready'],['picked_up','Picked up'],['waiting_payment','Waiting for payment'],['all_active','All active']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="Order type"><Select aria-label="Order type" value={orderTypeFilter} onChange={(event) => onOrderTypeFilterChange(event.target.value)}><option value="all">All types</option><option value="retail">Retail</option><option value="wholesale">Catering / wholesale</option></Select></Field>
          <Field label="Business line"><Select aria-label="Business line" value={businessLineFilter} onChange={(event) => onBusinessLineFilterChange(event.target.value)}><option value="all">All business lines</option><option value="three_squares">Three Squares</option><option value="latte_stone">Latte Stone Cookies</option><option value="catering">Catering</option></Select></Field>
          <Field label="Start date"><Input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} /></Field>
          <Field label="End date"><Input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} /></Field>
        </div>
      </Disclosure></div>
    </AdminFilterBar>;
  }

  return (
    <AdminFilterBar layout="custom">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="md:col-span-2">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <Field label="Search"><Input
                type="text"
                placeholder="Search by order #, email, or name..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              /></Field>

            </div>
            <Button variant="primary" onClick={onSearch}>
              Search
            </Button>
          </div>
        </div>

        {/* Status Filter */}
        <Field label="Stage"><Select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
        >
          {(pickupQueue ? [
            ['all', 'All pickup orders'], ['new_paid', 'New paid'], ['confirmed', 'Acknowledged'], ['ready', 'Ready'], ['picked_up', 'Picked up'], ['waiting_payment', 'Waiting for payment'], ['all_active', 'All active'],
          ] : [
            ['all', 'All Status'], ['pending', 'Pending'], ['confirmed', 'Acknowledged (Pickup)'], ['processing', 'Processing (Shipping)'], ['ready', 'Ready (Pickup)'], ['shipped', 'Shipped'], ['picked_up', 'Picked up'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
          ]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select></Field>
      </div>

      {/* Order Type and Date Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-4">
        <Field label="Order type"><Select
          value={orderTypeFilter}
          onChange={(e) => onOrderTypeFilterChange(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </Select></Field>

        <Field label="Business line"><Select
          value={businessLineFilter}
          onChange={(e) => onBusinessLineFilterChange(e.target.value)}
        >
          <option value="all">All Business Lines</option>
          <option value="three_squares">Three Squares</option>
          <option value="latte_stone">Latte Stone Cookies</option>
          <option value="catering">Catering</option>
        </Select></Field>

        <Field label="Fulfillment"><Select
          disabled={pickupQueue}
          value={fulfillmentFilter}
          onChange={(e) => onFulfillmentFilterChange(e.target.value)}
        >
          <option value="all">All Fulfillment</option>
          <option value="pickup">Pickup</option>
          <option value="shipping">Shipping</option>
        </Select></Field>

        <Field label="Location"><Select
          value={locationFilter}
          onChange={(e) => onLocationFilterChange(e.target.value)}
        >
          <option value="all">All Locations</option>
          {locationOptions.map((location) => (
            <option key={location.id} value={String(location.id)}>
              {location.name}
            </option>
          ))}
        </Select></Field>

        <Field label="Period"><Select
          value={datePreset}
          onChange={(e) => onDatePresetChange(e.target.value)}
        >
          <option value="today">Today</option>
          <option value="last_7_days">Last 7 days</option>
          <option value="this_month">This month</option>
          <option value="all_time">All time</option>
          <option value="custom">Custom range</option>
        </Select></Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Start date"><Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            aria-label="Start date"
          /></Field>
          <Field label="End date"><Input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-label="End date"
          /></Field>
        </div>
      </div>
    </AdminFilterBar>
  );
}
