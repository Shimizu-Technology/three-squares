import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = s => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const ctx='globalThis.__ordering';
const mocks={react:url(['useState','useEffect','useCallback','useRef','useId'].map(n=>`export const ${n}=(...a)=>${ctx}.${n}(...a);`).join('\n')),
  '@clerk/clerk-react':url(`export const useAuth=()=>({getToken:${ctx}.getToken});`),
  '../../services/authApi':url(`export const authGet=(...a)=>${ctx}.get(...a);export const authPut=(...a)=>${ctx}.put(...a);`),
  '../../hooks/useAppConfig':url(`export const invalidateAppConfig=()=>${ctx}.invalidations++;`),
  './StaffAccess.tsx':url(`export const useStaffAccess=()=>({can:()=>${ctx}.owner});`),
  '../ui/Dialog':url('export default function Dialog() {}'),
  '../store/cartStore':url(`export const useCartStore=selector=>selector({cart:${ctx}.cart});`),
  'react-router-dom':url(`export const useLocation=()=>({pathname:${ctx}.pathname});`),
  '../hooks/useBackendAvailability':url(`export const useBackendAvailability=()=>{${ctx}.probes++;return ${ctx}.availability;};`)};
async function load(path){return import(url(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ["']([^"']+)["']/g,(_,n)=>`from ${JSON.stringify(mocks[n]||import.meta.resolve(n))}`)));}
const Owner=(await load('../src/components/admin/OnlineOrderingSection.tsx')).default;
const {default:Boundary,CustomerConnection}=await load('../src/components/CustomerAvailability.tsx');
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n!=='boolean'?[n.props?.children].flat(Infinity).map(text).join(''):'';
function harness(t){const hooks=[],effects=[];let i=0,tree;const initial={paused:false,customer_message:null,effective_message:'Standard',history:[]};
const h={cart:null,owner:true,probes:0,invalidations:0,pathname:'/',getToken:async()=> 'fixture',get:async()=>({data:initial}),put:async()=>({data:initial}),availability:{status:'available',config:{online_ordering_paused:false},retry:()=>{}},
useId:()=> 'fixture-title',useState(v){const j=i++;if(!(j in hooks))hooks[j]=v;return[hooks[j],v=>{hooks[j]=typeof v==='function'?v(hooks[j]):v;}];},useRef(v){return hooks[i++]||={current:v};},useCallback(fn,deps){const j=i++;if(!hooks[j]||deps.some((v,k)=>v!==hooks[j].deps[k]))hooks[j]={fn,deps};return hooks[j].fn;},useEffect(fn,deps){const j=i++;if(!hooks[j]||deps.some((v,k)=>v!==hooks[j].deps[k])){const old=hooks[j];hooks[j]={deps};effects.push(()=>{old?.cleanup?.();hooks[j].cleanup=fn();});}},
async flush(){for(let j=0;j<15;j++){globalThis.__ordering=h;i=0;const n=Owner();tree=n?n.type(n.props):null;for(const f of effects.splice(0))f();await Promise.resolve();}},find(fn){const n=nodes(tree).find(fn);assert.ok(n);return n;},button(label){return h.find(n=>n.type==='button'&&text(n)===label);},click(label){h.button(label).props.onClick();},get tree(){return tree;}};
globalThis.__ordering=h;t.after(()=>hooks.forEach(x=>x?.cleanup?.()));return h;}

test('owner confirms through Dialog and saved status waits for server response',async t=>{const h=harness(t);await h.flush();assert.match(text(h.tree),/Saved status: Accepting online orders/);let resolve,payload;h.put=(_,body)=>{payload=body;return new Promise(done=>resolve=done);};h.click('Pause online ordering');await h.flush();const dialog=h.find(n=>n.type?.name==='Dialog');assert.equal(dialog.props.open,true);assert.match(text(dialog),/Staff can keep using POS and pickup queues/);h.click('Confirm change');await h.flush();assert.equal(payload.online_ordering.paused,true);assert.doesNotMatch(text(h.tree),/Saved status: Paused/);resolve({data:{paused:true,customer_message:null,history:[{id:1,actor:'Fixture Owner',paused:true,changed_at:'2026-10-28T01:00:00Z'}]}});await h.flush();assert.match(text(h.tree),/Saved status: Paused/);assert.match(text(h.tree),/Fixture Owner/);assert.equal(h.invalidations,1);});
test('failed save requires checking saved state before another write',async t=>{const h=harness(t);await h.flush();h.put=async()=>{throw Error('lost response');};h.click('Pause online ordering');await h.flush();h.click('Confirm change');await h.flush();assert.match(text(h.tree),/could not confirm whether the change was saved/);assert.equal(h.button('Pause online ordering').props.disabled,true);h.get=async()=>({data:{paused:true,customer_message:'Back soon',history:[]}});h.click('Check saved status');await h.flush();assert.match(text(h.tree),/Saved status: Paused/);});
test('nonowners never mount pause editor',async t=>{const h=harness(t);h.owner=false;await h.flush();assert.equal(h.tree,null);});
for(const pathname of ['/admin','/admin/pos','/admin/pickup','/pos'])test(`staff ${pathname} bypasses public probe`,t=>{const h=harness(t);h.pathname=pathname;const child={type:'staff-content'};assert.equal(Boundary({children:child}),child);assert.equal(h.probes,0);});
test('never-reached shows connection copy without fake menu or pause',t=>{const h=harness(t);h.availability={status:'unavailable',config:null,retry:()=>{}};const n=CustomerConnection({children:'Fake menu'});assert.match(text(n),/can’t reach ordering/);assert.doesNotMatch(text(n),/paused|Fake menu/);});
test('transient failure retains loaded content and only explicit pause shows pause copy',t=>{const h=harness(t);h.availability={status:'unavailable',config:{online_ordering_paused:false},retry:()=>{}};const n=CustomerConnection({children:'Loaded menu'});assert.match(text(n),/Having trouble connecting — retrying/);assert.match(text(n),/Loaded menu/);assert.doesNotMatch(text(n),/ordering is paused/);h.availability={status:'available',config:{online_ordering_paused:true,online_ordering_pause_message:'Back soon'},retry:()=>{}};assert.match(text(CustomerConnection({children:'Menu'})),/Online ordering is paused.*Back soon/);});

for (const [name, cart, hasItems] of [['unknown', null, false], ['empty', { items: [] }, false], ['populated', { items: [{ quantity: 1 }] }, true]]) {
  test(`never-reached ${name} cart copy only claims a cart when items are known locally`, t => {
    const h = harness(t);
    h.cart = cart;
    h.availability = { status: 'unavailable', config: null, retry: () => {} };
    const copy = text(CustomerConnection({ children: 'Fake menu' }));
    assert.equal(copy.includes('Your cart is still here.'), hasItems);
    assert.equal(copy.includes('Please try again in a moment.'), !hasItems);
    assert.doesNotMatch(copy, /saved cart|on this device|Fake menu|paused/);
  });
}
