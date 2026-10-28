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
for (const name of ['Button','IconButton','ChoiceGroup','ActionTile']) {
  const url=compile(new URL(`../../src/components/ui/${name}.tsx`,import.meta.url));
  for(const prefix of ['../ui/','../../ui/','../components/ui/','../../components/ui/']) uiModules[prefix+name]=url;
}
uiModules['../../components/admin/AdminPageHeader']=compile(new URL('../../src/components/admin/AdminPageHeader.tsx',import.meta.url));
const expand = new Set(['Button','IconButton','ChoiceGroup','ActionTile','AdminPageHeader']);
export function expandUi(node) {
  while(node && typeof node.type==='function' && expand.has(node.type.name)) node=node.type(node.props);
  return node;
}
export function uiText(node) {
  return typeof node==='string'||typeof node==='number' ? String(node) : node && typeof node==='object' ? [node.props?.children].flat(Infinity).map(uiText).join('') : '';
}
