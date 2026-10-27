import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('./run-with-project-node.mjs', import.meta.url));

test('project Node launcher preserves a failing child status', () => {
  const result = spawnSync(process.execPath, [launcher, process.execPath, '-e', 'process.exit(7)']);
  assert.equal(result.status, 7);
});

test('project Node launcher fails when its child is terminated by a signal', () => {
  const result = spawnSync(process.execPath, [launcher, process.execPath, '-e', "process.kill(process.pid, 'SIGTERM')"]);
  assert.equal(result.status, 1);
});
