import AdminFilterBar, { FilterSearch, FilterSelect } from '../AdminFilterBar';
import { Button } from '../../ui/Button';
interface ProductFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterPublished: 'all' | 'true' | 'false' | 'archived' | 'attention' | 'pickup_locations';
  onPublishedChange: (value: 'all' | 'true' | 'false' | 'archived' | 'attention' | 'pickup_locations') => void;
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
  return <AdminFilterBar actions={<Button variant="secondary" onClick={onClear}>Clear filters</Button>}>
    <FilterSearch label="Search products" value={searchQuery} onChange={onSearchChange} placeholder="Search products…" />
    <FilterSelect label="Status" value={filterPublished} onChange={value => onPublishedChange(value as ProductFiltersProps['filterPublished'])} options={[
      {value:'all',label:'All Products'},{value:'true',label:'Published'},{value:'false',label:'Draft'},
      {value:'archived',label:'Archived'},{value:'pickup_locations',label:'Needs pickup locations'},{value:'attention',label:'Needs attention'},
    ]} />
    <FilterSelect label="Type" value={filterType} onChange={onTypeChange} options={[{value:'all',label:'All Types'}, ...productTypes.map(type => ({value:type,label:type}))]} />
  </AdminFilterBar>;
}
