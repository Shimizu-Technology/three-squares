import { createServer } from 'vite';
import { createServer as createHTTPServer } from 'node:http';
import react from '@vitejs/plugin-react';
import { chromium, webkit } from '@playwright/test';
import { launchGeometryServer } from './geometry-browser.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixture-only server. Never read vite.config, .env files, API settings or auth.
const root = fileURLToPath(new URL('../', import.meta.url));
const parent = path.resolve(process.env.UI_GEOMETRY_OUTPUT || path.join(root, '../tmp/ui-geometry'));
mkdirSync(parent, { recursive: true });
const output = mkdtempSync(path.join(parent, 'run-'));
const session = process.env.DEV_LIFECYCLE_SESSION;
const suites = ['ui-controls', 'ui-admin', 'pos-controls', 'customer-cards', 'ui-fields', 'ui-operations'];
const summary = { status: 'running', suites: [], runnerPid: process.pid, output };
let server, httpServer, child, cancellation, escalation;
const processLedger = path.join(output, 'browser-processes.jsonl');
const browserServers = [], endpoints = {};
const stopChild = signal => {
  if (child?.pid && child.exitCode === null) {
    try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
};
function cleanBrowsers(signal) {
  if (!processLedger || !existsSync(processLedger)) return;
  for (const line of readFileSync(processLedger, 'utf8').trim().split('\n').filter(Boolean)) {
    const identity = JSON.parse(line);
    if (identity.group !== identity.pid) throw new Error('Expected an isolated browser group');
    let verified = false;
    for (const member of identity.members) {
      try {
        const started = execFileSync('ps', ['-p', String(member.pid), '-o', 'lstart='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/\s+/g, ' ');
        const group = Number(execFileSync('ps', ['-p', String(member.pid), '-o', 'pgid='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
        if (started === member.started && group === identity.group) { verified = true; break; }
      } catch { /* This exact member already exited. */ }
    }
    if (!verified) {
      const groups = execFileSync('ps', ['-axo', 'pgid='], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
      if (groups.includes(identity.group)) throw new Error('Browser group still exists without a verifiable member; refusing cleanup');
      continue;
    }
    try { process.kill(-identity.group, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
function recordCleanupError(phase, error) {
  summary.status = 'failed'; process.exitCode = 1;
  (summary.cleanupErrors ??= []).push({ phase, error: error.stack ?? String(error) });
  console.error(`Cleanup failed (${phase}):`, error);
}
const cancel = signal => {
  cancellation = signal;
  try { cleanBrowsers('SIGTERM'); } catch (error) { recordCleanupError('cancel browsers', error); }
  try { stopChild('SIGTERM'); } catch (error) { recordCleanupError('cancel suite', error); }
  clearTimeout(escalation);
  escalation = setTimeout(() => {
    try { cleanBrowsers('SIGKILL'); } catch (error) { recordCleanupError('escalate browsers', error); }
    try { stopChild('SIGKILL'); } catch (error) { recordCleanupError('escalate suite', error); }
  }, 2000);
};
const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => cancel(signal)]));
for (const [signal, handler] of handlers) process.on(signal, handler);
const deadline = setTimeout(() => cancel('three-minute budget'), 175_000);
const save = () => writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
async function measure(name, origin) {
  const directory = path.join(output, name);
  mkdirSync(directory);
  const log = createWriteStream(path.join(directory, 'runner.log'));
  const started = performance.now();
  const args = [path.join(root, `scripts/measure-${name}.mjs`), origin, directory];
  child = spawn(process.execPath, args, {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, UI_GEOMETRY_BROWSERS: JSON.stringify(endpoints), UI_GEOMETRY_PROCESSES: '', DEV_LIFECYCLE_SESSION: '', UI_EVIDENCE_DIR: directory,
      UI_FIXTURE_URL: `${origin}/fixtures/${name}.html`, POS_FIXTURE_URL: `${origin}/fixtures/pos-controls.html`,
      CUSTOMER_FIXTURE_URL: `${origin}/fixtures/customer-cards.html` },
  });
  child.stdout.on('data', bytes => { process.stdout.write(bytes); log.write(bytes); });
  child.stderr.on('data', bytes => { process.stderr.write(bytes); log.write(bytes); });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true; cancel(`${name} timeout`);
  }, 90_000);
  let result;
  try {
    result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  } finally {
    clearTimeout(timer); clearTimeout(escalation);
    // Browser servers belong to the parent and survive until the command ends.
    try { if (child?.pid) process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    child = undefined;
    await new Promise(resolve => log.end(resolve));
  }
  const record = { name, ...result, timedOut, seconds: (performance.now() - started) / 1000 };
  summary.suites.push(record); save();
  if (result.code !== 0 || timedOut || cancellation) throw new Error(`${name} failed: ${JSON.stringify(record)}`);
}
const started = performance.now();
try {
  if (session) execFileSync('dev-lifecycle', ['claim', '--session', session, 'process', String(process.pid), '--reason', 'UI geometry fixture server and exact browser runner descendants']);
  server = await createServer({ root, configFile: false, envDir: false, plugins: [react()],
    server: { middlewareMode: true, hmr: false } });
  httpServer = createHTTPServer(server.middlewares);
  await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${httpServer.address().port}`;
  summary.origin = origin; save();
  const response = await fetch(`${origin}/fixtures/ui-controls.html`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Fixture readiness failed: HTTP ${response.status}`);
  console.log(`Geometry artifacts: ${output}`);
  for (const factory of [chromium, webkit]) {
    if (cancellation) throw new Error(`Cancelled: ${cancellation}`);
    const browserServer = await launchGeometryServer(factory, { headless: true, timeout: 10_000,
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }, processLedger);
    browserServers.push(browserServer); endpoints[factory.name()] = browserServer.wsEndpoint();
  }
  for (const name of suites) { if (cancellation) throw new Error(`Cancelled: ${cancellation}`); await measure(name, origin); }
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed'; summary.error = error.stack; process.exitCode = 1;
  console.error(error);
} finally {
  let killTimer;
  try {
    const killed = Promise.allSettled(browserServers.map(browser => browser.kill()));
    const results = await Promise.race([killed, new Promise(resolve => { killTimer = setTimeout(resolve, 2000); })]);
    for (const result of results ?? []) if (result.status === 'rejected') recordCleanupError('browser server', result.reason);
  } catch (error) { recordCleanupError('browser servers', error); }
  finally { clearTimeout(killTimer); }
  try { cleanBrowsers('SIGKILL'); } catch (error) { recordCleanupError('final browsers', error); }
  try { stopChild('SIGKILL'); } catch (error) { recordCleanupError('final suite', error); }
  clearTimeout(escalation);
  try { httpServer?.closeAllConnections(); } catch (error) { recordCleanupError('HTTP connections', error); }
  try {
    if (httpServer) await new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
  } catch (error) { recordCleanupError('HTTP server', error); }
  try { await server?.close(); } catch (error) { recordCleanupError('Vite server', error); }
  summary.seconds = (performance.now() - started) / 1000;
  clearTimeout(deadline);
  for (const [signal, handler] of handlers) process.off(signal, handler);
  try {
    if (session) execFileSync('dev-lifecycle', ['release', '--session', session, 'process', String(process.pid)]);
  } catch (error) { recordCleanupError('lifecycle release', error); }
  try { save(); } catch (error) { recordCleanupError('summary', error); }
  console.log(`UI geometry ${summary.status} in ${summary.seconds.toFixed(1)}s; ${output}`);
}
