import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { acquireShippingFixtureLock, catalogReadAllowed } from './customer-qa-safety.mjs';

test('shipping fixture lock excludes another Node process until the owner restores and releases', () => {
  const database = `tsq_uniform_c_lock_${randomUUID()}demo`;
  const module = new URL('./customer-qa-safety.mjs', import.meta.url).href;
  const child = () => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {acquireShippingFixtureLock} from ${JSON.stringify(module)};const release=acquireShippingFixtureLock('5432',${JSON.stringify(database)});release();`], { encoding: 'utf8' });
  const release = acquireShippingFixtureLock('5432', database);
  try {
    const blocked = child();
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Another shipping-fields run owns this target/);
    const otherPort = acquireShippingFixtureLock('5433', database);
    otherPort();
    const otherDatabase = acquireShippingFixtureLock('5432', database + '_other');
    otherDatabase();
  } finally { release(); }
  const available = child();
  assert.equal(available.status, 0, available.stderr);
});

test('catalog guard rejects writes and foreign assets as well as foreign API requests', () => {
  const allowed = new Set(['http://localhost:5691', 'http://localhost:3601']);
  for (const url of ['http://localhost:5691/products', 'http://localhost:5691/src/App.tsx', 'http://localhost:3601/api/v1/products']) {
    assert.equal(catalogReadAllowed(url, 'GET', allowed), true);
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS', 'HEAD']) assert.equal(catalogReadAllowed(url, method, allowed), false);
  }
  for (const url of ['https://example.test/api/v1/products', 'https://example.test/font.woff2', 'http://localhost:9999/products', 'data:text/plain,fixture', 'invalid']) {
    assert.equal(catalogReadAllowed(url, 'GET', allowed), false);
  }
});
