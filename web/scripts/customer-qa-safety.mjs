import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Fail closed across processes and worktrees, independent of the evidence directory. */
export function acquireShippingFixtureLock(port, database) {
  const key = createHash('sha256').update(`${port}:${database}`).digest('hex');
  const lockPath = path.join(tmpdir(), `tsq-shipping-fields-${key}.lock`);
  let fd;
  try {
    fd = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw Error(`Another shipping-fields run owns this target; inspect ${lockPath} before removing a stale lock`);
    throw error;
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, port, database }) + '\n');
  } catch (error) {
    closeSync(fd);
    unlinkSync(lockPath);
    throw error;
  }
  return () => { closeSync(fd); unlinkSync(lockPath); };
}

/** Catalog QA may only read the checked page/API origins, including non-API assets. */
export function catalogReadAllowed(requestUrl, method, allowedOrigins) {
  if (method !== 'GET') return false;
  try { return allowedOrigins.has(new URL(requestUrl).origin); }
  catch { return false; }
}
