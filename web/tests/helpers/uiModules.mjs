import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
const urls = new Map();
function resolveFile(file) {
  if (existsSync(file)) return file;
  for (const extension of ['.tsx','.ts']) { const candidate = new URL(file.href+extension); if (existsSync(candidate)) return candidate; }
  throw new Error('Missing source module '+file.href);
}
function compile(file) {
  if (urls.has(file.href)) return urls.get(file.href);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(name.startsWith('.') ? compile(resolveFile(new URL(name,file))) : import.meta.resolve(name))}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  urls.set(file.href,url); return url;
}
export const uiModules = {};
for (const name of ['ChoiceGroup','ActionTile','Button','IconButton','StatusBadge','Notice','Field','Input','Select','Textarea','Switch','CheckField','FileButton','Disclosure','ActionMenu','Pagination','DialogHeader','DialogActions','NavigationLink']) {
  const url=compile(new URL(`../../src/components/ui/${name}.tsx`,import.meta.url));
  for(const prefix of ['./ui/','../ui/','../../ui/','../components/ui/','../../components/ui/']) uiModules[prefix+name]=url;
}
uiModules['../components/admin/AdminPageHeader']=uiModules['../../components/admin/AdminPageHeader']=compile(new URL('../../src/components/admin/AdminPageHeader.tsx',import.meta.url));
uiModules['./OrderStatusBadge']=compile(new URL('../../src/components/admin/orders/OrderStatusBadge.tsx',import.meta.url));
for(const prefix of ['./ui/','../ui/','../../ui/','../components/ui/','../../components/ui/']) { const url=compile(new URL('../../src/components/ui/workflowStatus.ts',import.meta.url));uiModules[prefix+'workflowStatus']=uiModules[prefix+'workflowStatus.ts']=url; }
for(const prefix of ['../','../components/admin/','../../components/admin/']) uiModules[prefix+'AdminFilterBar']=compile(new URL('../../src/components/admin/AdminFilterBar.tsx',import.meta.url));
uiModules['../../components/admin/orders/OrderStatusBadge']=uiModules['./OrderStatusBadge'];
const expand = new Set(['ChoiceGroup','ActionTile','Button','IconButton','Input','Select','Textarea','Switch','CheckField','FileButton','Disclosure','Pagination','AdminPageHeader','AdminFilterBar','DialogHeader','DialogActions','NavigationLink','OrderStatusBadge','StatusBadge']);
const expanded = new WeakMap();
export function expandUi(node) {
  const original = node;
  if (node && typeof node === 'object' && expanded.has(node)) return expanded.get(node);
  while(node && typeof node.type==='function' && expand.has(node.type.name)) node=node.type(node.props);
  if(original && typeof original === 'object') expanded.set(original,node);
  return node;
}
export function uiText(value) {
  const node = expandUi(value);
  return typeof node==='string'||typeof node==='number' ? String(node) : node && typeof node==='object'
    ? [node.props?.children].flat(Infinity).map(uiText).join('') : '';
}

// CommonJS render harnesses retain their auth/router boundary while loading the
// same primitives recursively, rather than replacing controls with test doubles.
export function requireUi(name, fallback) {
  const base = name.split('/').at(-1).replace(/\.tsx?$/,'');
  const file = resolveFile(new URL(['AdminPageHeader','AdminFilterBar'].includes(base) ? `../../src/components/admin/${base}` : base === 'OrderStatusBadge' ? '../../src/components/admin/orders/OrderStatusBadge' : `../../src/components/ui/${base}`, import.meta.url));
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',code)(dependency => dependency.startsWith('.') ? requireUi(dependency, fallback) : fallback(dependency), module,module.exports);
  return module.exports;
}
