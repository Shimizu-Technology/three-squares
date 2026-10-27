import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const versionFile = resolve(repoRoot, '.node-version');

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-with-project-node.mjs <command> [args...]');
  process.exit(1);
}

const desiredVersion = existsSync(versionFile)
  ? readFileSync(versionFile, 'utf8').trim()
  : '';

const currentVersion = process.version.replace(/^v/, '');
const needsVersionSwitch = desiredVersion && currentVersion !== desiredVersion;

const env = { ...process.env };

if (needsVersionSwitch) {
  try {
    const prefix = execFileSync('nodenv', ['prefix', desiredVersion], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    env.PATH = `${prefix}/bin:${env.PATH}`;
    env.NODENV_VERSION = desiredVersion;
  } catch {
    console.warn(
      `Warning: expected Node ${desiredVersion}, but running ${currentVersion} and could not resolve nodenv prefix.`
    );
  }
}

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
