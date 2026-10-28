import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkControls, inspectSource } from './check-ui-controls.mjs';
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
test('only implementations in the ui directory are exempt, including specialized controls', () => {
  const source = 'function POSProductTile(){return <button/>} function Screen(){return <button/>}';
  assert.equal(inspectSource('src/components/pos/POSProductTile.tsx', source).length, 2);
  assert.equal(inspectSource('src/components/ui/POSProductTile.tsx', source).length, 1);
  assert.equal(inspectSource('src/components/ui-copy/Button.tsx', source).length, 2);
});
test('shared imports including aliases reject recipe overrides but allow responsive layout', () => {
  const rows = scan(`import {Button as Action} from './components/ui/Button';
    const Example = () => <><Action className="w-full sm:w-auto self-start">Save</Action>
    <Action className="h-12 bg-red-500">Save</Action><Action className={custom}>Save</Action><Action style={{height: 12}}>Save</Action><Action {...recipe}>Save</Action><Action className="hover:w-full">Save</Action></>`);
  assert.equal(rows.length, 5); assert.ok(rows.every(e => e.kind === 'shared-override'));
});
test('strict gate rejects every raw site without creating or reading a baseline', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tsq-ui-gate-'));
  const file = path.join(root, 'src/Example.tsx'), baseline = path.join(root, 'ui-controls-baseline.json');
  try {
    mkdirSync(path.dirname(file));
    writeFileSync(file, 'const Example = () => <><button>Save</button><button>Save</button></>');
    assert.equal(checkControls(root).count, 2);
    assert.equal(existsSync(baseline), false);
    // An old/manual baseline cannot authorize any control.
    writeFileSync(baseline, JSON.stringify({entries:[{file:'src/Example.tsx'}]}));
    assert.equal(checkControls(root).count, 2);
    writeFileSync(file, 'const Example = () => <a href="/help">Help</a>');
    assert.equal(checkControls(root).count, 0);
    for (const flag of ['--initialize','--ratchet','--unknown']) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-ui-controls.mjs', import.meta.url)),flag], {cwd:root,encoding:'utf8'});
      assert.equal(result.status, 1);assert.match(result.stderr, /strict.*no baseline/);
    }
  } finally { rmSync(root, {recursive:true, force:true}); }
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

test('strict native fields/disclosures and nonnative action roles require reviewed primitives', () => {
  for (const tag of ['input','select','textarea','details','summary']) {
    assert.equal(scan(`function Page(){return <${tag}/>}`).length,1);
  }
  assert.equal(scan('function Page(){return <div role="button" onClick={save}>Save</div>}').length,1);
  for (const component of ['CheckField','FileButton']) {
    assert.equal(inspectSource(`src/components/ui/${component}.tsx`, `function ${component}(){return <input/>} function Other(){return <input/>}`).length,1);
  }
  assert.equal(scan('function Page(){return <>{/* <input/> */}<p>Prose</p></>}').length,0);
});
test('barrel aliases, namespaces, duplicate props and JSX files cannot bypass shared recipes', () => {
  for (const source of [
    `import {Button as Action} from './barrel'; const Page=()=> <Action className="p-1"/>`,
    `import * as UI from './components/ui/Button'; const Page=()=> <UI.Button style={{height:2}}/>`,
    `import {Button} from './components/ui/Button'; const Page=()=> <Button className="w-full" className="p-1"/>`,
  ]) assert.ok(scan(source).length);
  assert.equal(scan(`import * as Router from 'react-router-dom'; const Page=()=> <Router.Link className="p-1"/>`).length,1);
  assert.equal(inspectSource('src/Example.jsx','function Page(){return <button/>}').length,1);
});

test('unknown custom anchor recipes require review while prose/tel/mail styling remains native', () => {
  assert.equal(scan('const Page=()=> <a href="/next" className="custom-action">Next</a>').length,1);
  assert.equal(scan('const Page=()=> <a href="tel:5550100" className="hover:underline text-tsPrimary transition-colors">Call</a>').length,0);
});
