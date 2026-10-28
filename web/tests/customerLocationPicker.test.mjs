import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import { uiModules, expandUi } from './helpers/uiModules.mjs';
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const ctx = 'globalThis.__customerLocationPicker';
const mocks = {
  ...uiModules,
  react: url(['useState','useRef','useEffect','useCallback'].map(name => `export const ${name}=(...args)=>${ctx}.${name}(...args);`).join('\n')),
  '../store/locationStore': url(`export const useLocationStore=Object.assign(()=>${ctx}.location,{getState:()=>${ctx}.location});`),
  '../store/cartStore': url(`export const useCartStore=Object.assign(()=>${ctx}.cartState,{getState:()=>${ctx}.cartState});`),
  '../services/api': url(`export const locationsApi={getLocations:async()=>({locations:${ctx}.location.locations})};`),
  'react-hot-toast': url(`export default {error:message=>${ctx}.errors.push(message)};`),
  'react-router-dom': url(`export const useLocation=()=>({pathname:'/products/fictional-meal'});export const useNavigate=()=>()=>{};`),
};
const source = ts.transpileModule(readFileSync(new URL('../src/components/LocationPicker.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(mocks[name]||import.meta.resolve(name))}`);
const Picker = (await import(url(source))).default;
const nodes = node => {node=expandUi(node);return !node || typeof node !== 'object' ? [] : [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];};
const text = node => typeof node === 'string' ? node : node && typeof node !== 'boolean' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
function harness(t,count) {
  const selected={id:2,name:'Fictional current location',slug:'current'},target={id:1,name:'Fictional carrying location',slug:'carrying'};
  const hooks=[],effects=[];let cursor=0,tree;
  const h={errors:[],fetches:0,clears:0,failClear:false,
    location:{selectedLocation:selected,locations:count?[selected]:[],showPicker:false,requestedLocation:null,
      setSelectedLocation:next=>{h.location.selectedLocation=next;},setLocations:next=>{h.location.locations=next;},setShowPicker:next=>{h.location.showPicker=next;},requestLocation:next=>{h.location.requestedLocation=next;}},
    cartState:{pricingError:null,cart:{items:[{product:{allow_pickup:true,available_location_ids:[2]}}]},fetchCart:async()=>{h.fetches++;},clearCart:async()=>{h.clears++;if(h.failClear)throw Error('Fictional clear failure');h.cartState.cart={items:[]};}},
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],next=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},
    useRef(initial){return hooks[cursor++]||={current:initial};},
    useCallback(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((v,j)=>!Object.is(v,hooks[i].deps[j])))hooks[i]={fn,deps};return hooks[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((v,j)=>!Object.is(v,hooks[i].deps[j]))){const old=hooks[i];hooks[i]={deps};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=fn();});}},
    async flush(){for(let i=0;i<12;i++){globalThis.__customerLocationPicker=h;cursor=0;tree=Picker();for(const effect of effects.splice(0))effect();await Promise.resolve();}},
    async request(){h.location.requestLocation(target);await h.flush();},
    dialogs(){return nodes(tree).filter(node=>node.props?.role==='dialog');},
    click(label){const button=nodes(tree).find(node=>node.type==='button'&&text(node).trim()===label);assert.ok(button,`Expected ${label}`);return button.props.onClick();},
  };
  t.after(()=>{for(const hook of hooks)hook?.cleanup?.();delete globalThis.__customerLocationPicker;});
  return {h,selected,target};
}
for(const count of [1,0]) test(`${count} loaded locations: incompatible cart shortcut confirms, cancels and preserves clear-failure recovery`,async t=>{
  const {h,selected,target}=harness(t,count);await h.flush();assert.equal(h.dialogs().length,0);
  await h.request();assert.equal(h.fetches,1);assert.equal(h.dialogs().length,1);assert.match(text(h.dialogs()[0]),/Change Location\?/);assert.match(text(h.dialogs()[0]),/Fictional carrying location/);
  assert.equal(h.location.selectedLocation,selected);assert.equal(h.clears,0);
  h.click('Keep Current');await h.flush();assert.equal(h.dialogs().length,0);assert.equal(h.cartState.cart.items.length,1);
  await h.request();h.failClear=true;await h.click('Switch & Clear');await h.flush();assert.equal(h.location.selectedLocation,selected);assert.equal(h.cartState.cart.items.length,1);assert.match(h.errors[0],/Unable to clear cart/);
  await h.request();h.failClear=false;await h.click('Switch & Clear');await h.flush();assert.equal(h.location.selectedLocation,target);assert.equal(h.cartState.cart.items.length,0);assert.equal(h.dialogs().length,0);
});
