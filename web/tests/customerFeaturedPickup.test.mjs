import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const mocks = {
  './CatalogPrice': url('export default function Price(){return "Price fixture";}'),
  '../store/cartStore': url('export const useCartStore=()=>null;'),
  '../utils/cartCompatibility': url('export const evaluateCartCompatibility=()=>({relevantPickupLocationIds:[]});'),
  './ProductBadge': url('export default function Badge(){return null;}'),
  './ui/OptimizedImage': url('export default function Image(){return null;}'),
  './ui/CustomerCard': url('export function CustomerCard({children}){return children;}'),
  './ui/StatusBadge': url('export function StatusBadge(){return null;}'),
};
const code = ts.transpileModule(readFileSync(new URL('../src/components/ProductCard.tsx', import.meta.url), 'utf8'), {
  compilerOptions: {jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(mocks[name] || import.meta.resolve(name))}`);
const {default:ProductCard} = await import(url(code));
const render = (showPickupLocation, ids, names) => renderToStaticMarkup(createElement(ProductCard, {
  product:{id:1,slug:'fictional-dish',name:'Fictional dish',actually_available:true,available_location_ids:ids},
  locationNameById:names,showPickupLocation,
}));
test('featured pickup annotation maps available locations and retains the unknown-location fallback', () => {
  assert.match(render(true,[1,2],{1:'Fictional Main',2:'Fictional Market'}), /Pickup: Fictional Main · Fictional Market/);
  for(const ids of [undefined,[],[99]]) assert.match(render(true,ids,{1:'Fictional Main'}), /Pickup: Choose a location/);
});
test('ordinary and location-selected cards omit the optional pickup annotation', () => {
  for(const show of [false,undefined]) assert.doesNotMatch(render(show,[1],{1:'Fictional Main'}), /Pickup:/);
});
