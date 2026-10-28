import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const runner = fileURLToPath(new URL('./lint-ci.mjs', import.meta.url));

async function runFixture(file, content) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'tsq-lint-gate-'));
  try {
    await symlink(path.join(webRoot, 'eslint.config.js'), path.join(cwd, 'eslint.config.js'));
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), content);
    return spawnSync(process.execPath, [runner], { cwd, encoding: 'utf8' });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test('accepts measured legacy error counts', async () => {
  const result = await runFixture('src/pages/AdminSettingsPage.tsx', 'export type Probe = any;\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /new errors: 0/);
});

test('rejects an error with no baseline entry', async () => {
  const result = await runFixture('src/NewFile.tsx', 'export type Probe = any;\n');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /src\/NewFile.tsx\|@typescript-eslint\/no-explicit-any/);
});

test('rejects additional errors for an existing baseline key', async () => {
  const content = Array.from({ length: 12 }, (_, i) => `export type Probe${i} = any;`).join('\n');
  const result = await runFixture('src/pages/AdminSettingsPage.tsx', content);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /12 errors \(baseline 11\)/);
});

test('CI rejects new raw controls even when ESLint is otherwise clean', async () => {
  const result = await runFixture('src/NewControl.tsx', 'export function NewControl() { return <button className="px-4">Save</button>; }');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /src\/NewControl.tsx:1:.*Native control outside an approved components\/ui/);
  assert.match(result.stdout, /UI controls: 1 violations; zero required/);
});

test('CI rejects a new button-like anchor', async () => {
  const result = await runFixture('src/NewControl.tsx', 'export function NewControl() { return <a href="/next" className="rounded px-4 bg-white">Next</a>; }');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Action link recipe outside components\/ui/);
});
