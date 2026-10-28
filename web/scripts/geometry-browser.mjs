import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Playwright browsers have their own process groups. Record their exact identities
// so the parent can clean them even if a killed runner cannot execute finally.
export async function launchGeometryServer(factory, options = {}, ledger = process.env.UI_GEOMETRY_PROCESSES) {
  const server = await factory.launchServer(options);
  const pid = server.process().pid;
  try {
    if (ledger) {
      const started = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' }).trim();
      const group = Number(execFileSync('ps', ['-p', String(pid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
      if (group !== pid) throw new Error('Expected an isolated Playwright browser process group');
      const members = execFileSync('ps', ['-axo', 'pid=,pgid=,lstart='], { encoding: 'utf8' }).trim().split('\n').map(line => {
        const [member, memberGroup, ...date] = line.trim().split(/\s+/);
        return { pid: Number(member), group: Number(memberGroup), started: date.join(' ') };
      }).filter(member => member.group === group);
      appendFileSync(ledger, JSON.stringify({ pid, group, started, members }) + '\n');
    }
    return server;
  } catch (error) { await server.close(); throw error; }
}

export async function launchGeometryBrowser(factory, options = {}) {
  // The surviving parent launches and owns both engines before starting a suite.
  // Killing a suite at any point cannot interrupt browser ownership registration.
  const endpoint = JSON.parse(process.env.UI_GEOMETRY_BROWSERS || '{}')[factory.name()];
  if (endpoint) return factory.connect(endpoint);
  const server = await launchGeometryServer(factory, options);
  try {
    const browser = await factory.connect(server.wsEndpoint());
    const disconnect = browser.close.bind(browser);
    browser.close = async () => { try { await disconnect(); } finally { await server.close(); } };
    return browser;
  } catch (error) { await server.close(); throw error; }
}
