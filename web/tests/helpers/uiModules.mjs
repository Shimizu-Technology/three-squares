import { readFileSync } from 'node:fs';
import ts from 'typescript';
const urls = new Map();
function compile(file) {
  if (urls.has(file.href)) return urls.get(file.href);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(name.startsWith('.') ? compile(new URL(name+'.tsx',file)) : import.meta.resolve(name))}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  urls.set(file.href,url); return url;
}
export const uiModules = {};
for (const name of ['Button','IconButton','StatusBadge','Field','Input','Select','Textarea','Switch','CheckField','FileButton','Disclosure','ActionMenu','Pagination']) {
  const url=compile(new URL(`../../src/components/ui/${name}.tsx`,import.meta.url));
  for(const prefix of ['./ui/','../ui/','../../ui/','../components/ui/','../../components/ui/']) uiModules[prefix+name]=url;
}
uiModules['../components/admin/AdminPageHeader']=uiModules['../../components/admin/AdminPageHeader']=compile(new URL('../../src/components/admin/AdminPageHeader.tsx',import.meta.url));
const expand = new Set(['Button','IconButton','Input','Select','Textarea','Switch','CheckField','FileButton','Disclosure','Pagination','AdminPageHeader']);
export function expandUi(node) {
  while(node && typeof node.type==='function' && expand.has(node.type.name)) node=node.type(node.props);
  return node;
}
export function uiText(node) {
  return typeof node==='string'||typeof node==='number' ? String(node) : node && typeof node==='object' ? [node.props?.children].flat(Infinity).map(uiText).join('') : '';
}

// CommonJS render harnesses retain their auth/router boundary while loading the
// same primitives recursively, rather than replacing controls with test doubles.
export function requireUi(name, fallback) {
  const base = name.split('/').at(-1);
  const file = new URL(base === 'AdminPageHeader' ? '../../src/components/admin/AdminPageHeader.tsx' : `../../src/components/ui/${base}.tsx`, import.meta.url);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',code)(dependency => dependency.startsWith('.') ? requireUi(dependency, fallback) : fallback(dependency), module,module.exports);
  return module.exports;
}
