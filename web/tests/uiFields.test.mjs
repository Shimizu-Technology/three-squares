import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
async function compile(name) {
  const code=ts.transpileModule(readFileSync(new URL(`../src/components/ui/${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))[name];
}
const [Field,Input,Select,Textarea]=await Promise.all(['Field','Input','Select','Textarea'].map(compile));
const render=(props,child)=>renderToStaticMarkup(createElement(Field,props,child));
test('field generates an explicit label/control association and distinct help/error slots',()=>{
  const html=render({label:'Device name',help:'Use a short name.',error:'Name is required.'},createElement(Input,{required:true}));
  const id=html.match(/<label[^>]+for="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${id}"`));assert.ok(html.includes(`aria-describedby="${id}-help ${id}-error"`));
  assert.ok(html.includes('aria-invalid="true"'));assert.ok(html.includes(`id="${id}-help"`));assert.ok(html.includes(`id="${id}-error"`));
  assert.ok(!html.includes('role="alert"'));assert.ok(html.includes('required=""'));
});
test('field preserves caller IDs, descriptions, refs, event handlers and nonerror validity',()=>{
  let seen,changed;const ref={current:null},onChange=event=>changed=event;
  const Probe=props=>{seen=props;return createElement(Input,props);};
  render({label:'Device name',help:'Help'},createElement(Probe,{id:'device-name','aria-describedby':'external-note device-name-help','aria-invalid':'grammar',ref,onChange}));
  assert.equal(seen.id,'device-name');assert.equal(seen['aria-describedby'],'external-note device-name-help');assert.equal(seen['aria-invalid'],'grammar');assert.equal(seen.ref,ref);
  const event={target:{value:'Kitchen'}};seen.onChange(event);assert.equal(changed,event);
});
test('separate fields receive distinct generated IDs; absent slots add no descriptions',()=>{
  const html=renderToStaticMarkup(createElement('form',null,...['First','Second'].map(label=>createElement(Field,{key:label,label},createElement(Input)))));
  const ids=[...html.matchAll(/<label[^>]+for="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,2);assert.ok(!html.includes('aria-describedby'));assert.ok(!html.includes('aria-invalid'));
});
test('native field semantics retain type, disabled state, values and multiline rows',()=>{
  const input=render({label:'Email'},createElement(Input,{type:'email',name:'email',defaultValue:'fixture@example.test',disabled:true}));
  assert.match(input,/type="email"/);assert.match(input,/disabled=""/);assert.match(input,/value="fixture@example.test"/);
  const select=render({label:'Location'},createElement(Select,{name:'location',defaultValue:'main'},createElement('option',{value:'main'},'Main')));assert.match(select,/<select/);assert.match(select,/selected=""/);
  const textarea=render({label:'Notes'},createElement(Textarea,{name:'notes',defaultValue:'Fictional note',rows:4}));assert.match(textarea,/rows="4"/);assert.match(textarea,/Fictional note<\/textarea>/);
});
