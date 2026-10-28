import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkControls, compareBaseline, inspectSource } from './check-ui-controls.mjs';
const scan = text => inspectSource('src/Example.tsx', text);

test('detects raw buttons (including dynamic classes, no classes and spread props)', () => {
  assert.equal(scan('const Example = () => <><button className={recipe}>Save</button><button {...props}>Close</button></>').length, 2);
});
test('identifies button-like anchors/router aliases without rejecting prose links', () => {
  const rows = scan(`import {Link as RouteLink} from 'react-router-dom';
    const Example = () => <><a href="/help">Help</a><a className="text-tsPrimary underline">Read more</a>
    <a className="rounded px-4 py-2">Save</a><RouteLink className={recipe} to="/next">Next</RouteLink><a className="px-4 py-2 font-semibold">Ghost action</a><a style={{padding: 12}}>Action</a></>`);
  assert.equal(rows.length, 4); assert.ok(rows.every(e => e.kind === 'button-like-link'));
});
test('only exact named specialized implementations and ui directory are exempt', () => {
  const allowed = [{file: 'src/Example.tsx', component: 'Stepper', reason: '44px quantity targets'}];
  const rows = inspectSource('src/Example.tsx', 'function Stepper(){return <button/>} function Screen(){return <button/>}', allowed);
  assert.equal(rows.length, 1); assert.equal(rows[0].component, 'Screen');
  assert.equal(inspectSource('src/components/ui/Button.tsx', 'const Button = () => <button/>').length, 0);
});
test('shared imports including aliases reject recipe overrides but allow responsive layout', () => {
  const rows = scan(`import {Button as Action} from './components/ui/Button';
    const Example = () => <><Action className="w-full sm:w-auto self-start">Save</Action>
    <Action className="h-12 bg-red-500">Save</Action><Action className={custom}>Save</Action><Action style={{height: 12}}>Save</Action><Action {...recipe}>Save</Action><Action className="hover:w-full">Save</Action></>`);
  assert.equal(rows.length, 5); assert.ok(rows.every(e => e.kind === 'shared-override'));
});
test('baseline is stable through line shifts and formatting, but rejects changed and duplicate sites', () => {
  const before = scan('function Example(){return <button className="p-2">Save</button>}');
  const moved = scan('\n\nfunction Example() {\n  return <button className="p-2">Save</button>\n}');
  assert.equal(compareBaseline(moved, before).added.length, 0);
  assert.ok(before[0].line && before[0].column && before[0].hash && before[0].reason);
  const changed = scan('function Example(){return <button className="p-2">Delete</button>}');
  assert.equal(compareBaseline(changed, before).added.length, 1);
  const duplicates = scan('function Example(){return <><button className="p-2">Save</button><button className="p-2">Save</button></>}');
  assert.equal(compareBaseline(duplicates, before).added.length, 1);
});
test('removing an old site cannot hide a new site elsewhere', () => {
  const before = scan('function Example(){return <><button>Save</button><button>Close</button></>}');
  const after = scan('function Example(){return <><button>Save</button><button>Delete</button></>}');
  const { added, stale } = compareBaseline(after, before);
  assert.equal(added.length, 1); assert.equal(stale.length, 1);
});
test('ratchet removes debt but refuses to bless added controls', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tsq-ui-gate-'));
  const file = path.join(root, 'src/Example.tsx'), baseline = path.join(root, 'ui-controls-baseline.json');
  try {
    mkdirSync(path.dirname(file)); writeFileSync(file, 'const Example = () => <button>Save</button>');
    checkControls(root, {initialize:true});
    assert.throws(() => checkControls(root, {initialize:true}), /exists/);
    const original = readFileSync(baseline, 'utf8');
    writeFileSync(file, 'const Example = () => <button>New</button>');
    assert.equal(checkControls(root, {ratchet:true}).added.length, 1);
    assert.equal(readFileSync(baseline, 'utf8'), original);
    writeFileSync(file, 'const Example = () => <div/>');
    assert.equal(checkControls(root, {ratchet:true}).stale.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(baseline, 'utf8')).entries, []);
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test('JSX-valued local variables belong to the enclosing approved component', () => {
  const allowed = [{file:'src/Example.tsx',component:'Stepper',reason:'44px quantity targets'}];
  const declaration = 'function Stepper(){const decrement = <button>Minus</button>;return decrement;}';
  const arrow = 'const Stepper = () => {const decrement = <button>Minus</button>;return decrement;}';
  for (const source of [declaration, arrow]) {
    assert.equal(inspectSource('src/Example.tsx',source,allowed).length,0);
    assert.equal(inspectSource('src/Example.tsx',source,[])[0].component,'Stepper');
  }
  const functions = scan('const Arrow = () => <button/>; const Expression = function(){return <button/>};');
  assert.deepEqual(functions.map(e=>e.component),['Arrow','Expression']);
});

test('shared fields reject new geometry/color overrides and preserve static layout props', () => {
  for (const name of ['Field','Input','Select','Textarea']) {
    const prefix = `import {${name} as Control} from '../components/ui/${name}';`;
    assert.equal(scan(`${prefix}const Page=()=> <Control className="w-full sm:max-w-lg"/>;`).length,0);
    for (const attributes of ['className="h-8 text-xs"','className={recipe}','style={{height:32}}','{...props}']) {
      const rows=scan(`${prefix}const Page=()=> <Control ${attributes}/>;`);
      assert.equal(rows.length,1);assert.equal(rows[0].kind,'shared-override');
    }
  }
});
