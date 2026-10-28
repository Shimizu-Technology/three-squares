import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
async function compile(file, replacements = {}) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  }}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(replacements[name] ?? import.meta.resolve(name))}`);
  const url = moduleUrl(output);
  return { url, module: await import(url) };
}
const button = await compile('../src/components/ui/Button.tsx');
const { Button } = button.module;
const { module: {IconButton} } = await compile('../src/components/ui/IconButton.tsx', {'./Button':button.url});
const render = (Component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Component, props)));
const css = readFileSync(new URL('../src/components/ui/controls.css', import.meta.url), 'utf8');

test('control recipes have the geometry contract and bounded feedback', () => {
  assert.match(css, /height: 44px;[\s\S]*?padding: 0 16px;[\s\S]*?border: 1px solid transparent;[\s\S]*?border-radius: 8px/);
  assert.match(css, /\.ui-button--sm \{ height: 36px; min-width: 36px; padding: 0 12px/);
  assert.match(css, /\.ui-button--lg \{ height: 52px; min-width: 52px; padding: 0 24px; font-size: 16px; line-height: 24px/);
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*?\.ui-button--sm \{ height: 44px; min-width: 44px/);
  assert.match(css, /outline: 2px solid var\(--color-tsPrimary\); outline-offset: 2px/);
  assert.doesNotMatch(css, /transition:\s*all|translate[XY]\(/);
});
test('variants and sizes select recipes and native actions default to non-submit', () => {
  for (const variant of ['primary','secondary','ghost','destructive','link']) {
    for (const size of ['sm','md','lg']) {
      const tree = Button({variant,size,children:'Save',name:'operation',value:'save'});
      assert.equal(tree.type, 'button'); assert.equal(tree.props.type, 'button');
      assert.match(tree.props.className, new RegExp(`ui-button--${variant} ui-button--${size}`));
      assert.equal(tree.props.name,'operation'); assert.equal(tree.props.value,'save');
    }
  }
  assert.equal(Button({type:'submit',children:'Save'}).props.type,'submit');
});
test('loading keeps the original label/icon in layout and disables the native button', () => {
  const normal = Button({children:'Save item',icon:createElement('svg'),loading:false});
  const pending = Button({children:'Save item',icon:createElement('svg'),loading:true});
  assert.equal(pending.props.disabled,true); assert.equal(pending.props['aria-busy'],true);
  assert.equal(normal.props.children.props.children[0].props.children[1],pending.props.children.props.children[0].props.children[1]);
  const html = render(Button,{loading:true,children:'Save item'});
  assert.match(html, /Save item/); assert.match(html, /ui-button__spinner/);
});
test('native and router links retain anchor semantics and disabled links have no destination', () => {
  assert.match(render(Button,{href:'/help',children:'Help'}), /<a[^>]+href="\/help"/);
  assert.match(render(Button,{to:'/menu',children:'Menu'}), /<a[^>]+href="\/menu"/);
  for (const props of [{href:'/help',disabled:true},{to:'/menu',loading:true}]) {
    const html = render(Button,{...props,children:'Destination'});
    assert.match(html, /aria-disabled="true"/); assert.match(html, /tabindex="-1"/); assert.doesNotMatch(html, /href=/);
  }
});
test('icon actions require a name and use shared square geometry and hidden decorative icons', () => {
  const html = render(IconButton,{'aria-label':'Refresh menu',size:'lg',children:createElement('svg')});
  assert.match(html,/aria-label="Refresh menu"/); assert.match(html,/ui-icon-button/); assert.match(html,/aria-hidden="true"/);
});

test('blocked links remove activation handlers, including capture, but preserve focus and hover', () => {
  const actionNames=['Click','AuxClick','DoubleClick','KeyDown','KeyUp','KeyPress','MouseDown','MouseUp','PointerDown','PointerUp','PointerCancel','TouchStart','TouchEnd','TouchCancel','ContextMenu'].flatMap(name=>[`on${name}`,`on${name}Capture`]);
  const passiveNames=['onFocus','onBlur','onMouseEnter','onMouseLeave','onPointerEnter','onPointerLeave'];
  const handler=()=>assert.fail('blocked link activated');
  const handlers=Object.fromEntries([...actionNames,...passiveNames].map(name=>[name,handler]));
  for (const target of [{to:'/menu'},{href:'/help'}]) {
    for (const state of [{disabled:true},{loading:true}]) {
      const tree=Button({...target,...handlers,...state,children:'Destination'});
      assert.equal(tree.type,'a');
      for (const name of actionNames.filter(name=>name!=='onClick')) assert.equal(tree.props[name],undefined,name);
      for (const name of passiveNames) assert.equal(tree.props[name],handler,name);
      let prevented=false;tree.props.onClick({preventDefault(){prevented=true;}});assert.equal(prevented,true);
    }
    const enabled=Button({...target,...handlers,children:'Destination'});
    for (const name of [...actionNames,...passiveNames]) assert.equal(enabled.props[name],handler,name);
  }
});

test('retry recovery retains its label and delegates pending state to Button', async () => {
  const {module:{default:AdminRequestState}}=await compile('../src/components/admin/AdminRequestState.tsx',{'../ui/Button':button.url});
  for (const loading of [false,true]) {
    const html=render(AdminRequestState,{resource:'Example records',loading,error:true,hasData:true,onRetry(){}});
    assert.match(html,/Retry/); assert.doesNotMatch(html,/Retrying/);
    assert.equal(html.includes('aria-busy="true"'),loading);
    assert.equal(html.includes('disabled=""'),loading);
  }
});

const { module: {ChoiceGroup} } = await compile('../src/components/ui/ChoiceGroup.tsx');
const { module: {ActionTile} } = await compile('../src/components/ui/ActionTile.tsx');
test('single-choice sections expose selection and invoke only their own value', () => {
  const calls=[];
  const tree=ChoiceGroup({label:'Order stages',value:'new',choices:[{value:'new',label:'New paid'},{value:'ready',label:'Ready'}],onChange:value=>calls.push(value)});
  assert.equal(tree.props.role,'group');assert.equal(tree.props['aria-label'],'Order stages');
  const [first,second]=tree.props.children;
  assert.equal(first.props.type,'button');assert.equal(first.props['aria-pressed'],true);assert.equal(second.props['aria-pressed'],false);
  second.props.onClick();assert.deepEqual(calls,['ready']);
  const disabled=ChoiceGroup({label:'Editor sections',value:'new',choices:[{value:'new',label:'Menu'}],onChange(){},disabled:true});
  assert.equal(disabled.props.children[0].props.disabled,true);
});
test('dashboard shortcuts retain real navigation and named content', () => {
  const html=render(ActionTile,{to:'/admin/orders',icon:createElement('svg'),children:'View Orders'});
  assert.match(html,/href="\/admin\/orders"/);assert.match(html,/View Orders/);assert.match(html,/aria-hidden="true"/);
});
