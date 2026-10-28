import { CheckField } from '../../ui/CheckField';
import { IconButton } from '../../ui/IconButton';
import { Field } from '../../ui/Field';
import { Input } from '../../ui/Input';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { moveMenuItem, menuProductPrice, type MenuProduct } from './menuItems';

export default function MenuItemsEditor({ products, selectedIds, onChange, disabled }: {
  products: MenuProduct[]; selectedIds: number[]; onChange: (ids: number[]) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState('');
  const selected = new Set(selectedIds);
  const choices = products.filter(product => !product.archived && product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const byId = new Map(products.map(product => [product.id, product]));
  return <section aria-labelledby="menu-items-title" className="space-y-4">
    <h3 id="menu-items-title" className="text-xl font-semibold text-gray-900">Menu items</h3>
    <p className="text-sm text-gray-700">Choose items, then set their order. Saving this menu does not publish a draft item or change its pickup locations. Prices below are base prices; location prices still apply.</p>
    <Field label="Find menu items">
      <Input type="search" onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} value={search} onChange={event => setSearch(event.target.value)} disabled={disabled} placeholder="Search meals, boxes or flavors" /></Field>
    <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 overscroll-contain">
      {choices.length === 0 && <p className="p-4 text-gray-700">No matching items. Try another name.</p>}
      {choices.map(product => <CheckField type="checkbox" checked={selected.has(product.id)} disabled={disabled} onChange={event => onChange(event.target.checked ? [...selectedIds, product.id] : selectedIds.filter(id => id !== product.id))} aria-label={`Include ${product.name}`}>

        <span className="min-w-0 break-words text-gray-900">{product.name}<span className="block text-sm text-gray-700">{menuProductPrice(product)}{!product.published && ' · Unpublished item'}</span></span>
      </CheckField>)}
    </div>
    <h4 className="font-semibold text-gray-900">Selected items ({selectedIds.length}) — saved menu order</h4>
    {selectedIds.length === 0 ? <p className="text-gray-700">No items selected yet.</p> : <ol className="space-y-3">
      {selectedIds.map((id, index) => { const product = byId.get(id); return <li key={id} className="rounded-lg border border-gray-200 p-3">
        <p className="break-words font-medium text-gray-900">{index + 1}. {product?.name || `Unavailable item ${id}`}</p>
        {product?.archived && <p className="text-sm text-amber-900">Archived item — unavailable to customers. Remove it or restore it in Products.</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <IconButton type="button" disabled={disabled || index === 0} onClick={() => onChange(moveMenuItem(selectedIds, id, -1))} aria-label={`Move ${product?.name || id} up`} variant="secondary"><ArrowUp /></IconButton>
          <IconButton type="button" disabled={disabled || index === selectedIds.length - 1} onClick={() => onChange(moveMenuItem(selectedIds, id, 1))} aria-label={`Move ${product?.name || id} down`} variant="secondary"><ArrowDown /></IconButton>
          <IconButton type="button" disabled={disabled} onClick={() => onChange(selectedIds.filter(value => value !== id))} aria-label={`Remove ${product?.name || id} from menu`} variant="secondary"><Trash2 /></IconButton>
        </div>
      </li>; })}
    </ol>}
  </section>;
}
