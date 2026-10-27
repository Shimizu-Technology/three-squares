import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const context = 'globalThis.__receiptLoading';
const mocks = {
  react: moduleUrl(`export const useState = initial => ${context}.state(initial); export const useEffect = fn => ${context}.effects.push(fn);`),
  'react-router-dom': moduleUrl(`export const useParams = () => ({id:'1'}); export const useLocation = () => ({search:''}); export const useNavigate = () => () => {};`),
  '@clerk/clerk-react': moduleUrl(`export const useAuth = () => ${context}.auth;`),
  '../services/api': moduleUrl(`export default {get:(...a) => ${context}.get(...a)}; export const configApi = {getConfig:async()=>({})};`),
  '../components/payment/PaymentReceipt': moduleUrl('export default function PaymentReceipt() {}'),
};
const compiled = ts.transpileModule(readFileSync(new URL('../src/pages/OrderConfirmationPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: {jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText.replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(mocks[name] || import.meta.resolve(name))}`);
const {default: Receipt} = await import(moduleUrl(compiled));
const flush = () => new Promise(resolve => setImmediate(resolve));
function render(auth, get) {
  const state = {auth,get,effects:[],values:[],state(initial) { const i=this.values.length; this.values.push(initial); return [initial,value=>{this.values[i]=value;}]; }};
  globalThis.__receiptLoading = state;
  globalThis.localStorage = {getItem:()=>null};
  Receipt();
  return {state,cleanup:state.effects[0]()};
}

test('receipt waits for Clerk readiness and sends the authenticated request after refresh', async () => {
  let calls=0;
  render({isLoaded:false},()=>{calls++;});
  await flush();
  assert.equal(calls,0);
  const {state} = render({isLoaded:true,isSignedIn:true,getToken:async()=>'fixture-token'},async(path,options)=>{
    calls++;
    assert.equal(path,'/orders/1');
    assert.equal(options.headers.Authorization,'Bearer fixture-token');
    return {data:{order:{id:1,status:'ready'}}};
  });
  await flush();
  assert.equal(calls,1);
  assert.equal(state.values[0].status,'ready');
  assert.equal(state.values[1],false);
  assert.equal(state.values[2],null);
});

test('a discarded request cannot overwrite the current receipt after an auth change', async () => {
  let finish;
  const {state,cleanup} = render({isLoaded:true,isSignedIn:false},()=>new Promise(resolve=>{finish=resolve;}));
  cleanup();
  finish({data:{order:{id:1,status:'pending'}}});
  await flush();
  assert.equal(state.values[0],null);
  assert.equal(state.values[1],true);
});
