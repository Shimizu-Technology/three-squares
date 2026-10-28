import { uiModules, requireUi, expandUi } from './helpers/uiModules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as helpers from '../src/components/admin/menus/menuItems.ts';
const require = createRequire(import.meta.url);
let query = '';
const source = ts.transpileModule(readFileSync(new URL('../src/components/admin/menus/MenuItemsEditor.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', source)(name => name === 'react' ? { ...React, useState: () => [query, value => { query = value; }] } : name === './menuItems' ? helpers : uiModules[name] ? requireUi(name, require) : require(name), module, module.exports);
const { default: Editor } = module.exports;
const { moveMenuItem, menuProductPrice } = helpers;
const products = [
  { id: 1, name: 'Chicken 🥥 — sauces separate for the very long office lunch name', published: true, archived: false, base_price_cents: 1234 },
  { id: 2, name: 'Draft meal', published: false, archived: false, base_price_cents: 0 },
  { id: 3, name: 'Archived box', published: false, archived: true, base_price_cents: 2400 },
];
const elements = raw => { const value = expandUi(raw); return !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(elements)]; };
const render = props => { const tree = Editor({ products, selectedIds: [3, 1], onChange() {}, disabled: false, ...props }); return { tree, nodes: elements(tree), html: renderToStaticMarkup(tree) }; };

test('saved menu order moves only the requested item and leaves boundaries unchanged', () => {
  const ids = [3, 1, 2];
  assert.deepEqual(moveMenuItem(ids, 1, -1), [1, 3, 2]);
  assert.deepEqual(moveMenuItem(ids, 1, 1), [3, 2, 1]);
  assert.equal(moveMenuItem(ids, 3, -1), ids);
  assert.equal(moveMenuItem(ids, 2, 1), ids);
  assert.equal(moveMenuItem(ids, 99, 1), ids);
  assert.deepEqual(ids, [3, 1, 2]);
});

test('editor includes unpublished choices and keeps archived selected items with a removal path', () => {
  query = '';
  const { html, nodes } = render();
  assert.match(html, /Unpublished item/);
  assert.match(html, /Archived item — unavailable/);
  assert.match(html, /Selected items \(2\)/);
  assert.match(html, /\$12\.34/);
  assert.match(html, /Price requires setup/);
  assert.equal(nodes.filter(node => node.type === 'input' && node.props.type === 'checkbox').length, 2);
  assert.ok(html.indexOf('1. Archived box') < html.indexOf('2. Chicken'));
  assert.equal(menuProductPrice(products[1]), 'Price requires setup');
});

test('search, multiselect, removal and keyboard-accessible moves preserve unrelated selections', () => {
  query = 'DRAFT'; let next;
  const { nodes } = render({ onChange: ids => { next = ids; } });
  const choice = nodes.find(node => node.type === 'input' && node.props.type === 'checkbox');
  assert.equal(choice.props['aria-label'], 'Include Draft meal');
  choice.props.onChange({ target: { checked: true } });
  assert.deepEqual(next, [3, 1, 2]);
  nodes.find(node => node.props?.['aria-label'] === 'Move Archived box down').props.onClick();
  assert.deepEqual(next, [1, 3]);
  nodes.find(node => node.props?.['aria-label'] === 'Remove Archived box from menu').props.onClick();
  assert.deepEqual(next, [1]);
  query = 'No such meal'; assert.match(render().html, /No matching items/);
});

test('saving disables every mutation and search while preserving visible selections', () => {
  query = '';
  const { nodes } = render({ disabled: true });
  assert.ok(nodes.filter(node => node.type === 'input' || node.type === 'button').every(node => node.props.disabled));
});


test('Enter in item search never implicitly submits the enclosing menu form', () => {
  const input = render().nodes.find(node => node.type === 'input' && node.props.type === 'search');
  let prevented = false;
  input.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  input.props.onKeyDown({ key: 'a', preventDefault() { assert.fail('normal typing must remain native'); } });
});
