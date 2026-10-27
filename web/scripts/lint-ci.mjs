import { checkControls } from './check-ui-controls.mjs';
import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Keep npm run lint strict. CI permits only the measured, tracked legacy debt.
const baseline = JSON.parse(await readFile(new URL('../eslint-baseline.json', import.meta.url), 'utf8'));
const eslint = new ESLint();
const results = await eslint.lintFiles(['.']);
const errors = new Map();
for (const result of results) {
  for (const message of result.messages) {
    if (message.severity !== 2) continue;
    const key = `${path.relative(process.cwd(), result.filePath).split(path.sep).join('/')}|${message.ruleId ?? 'fatal'}`;
    errors.set(key, (errors.get(key) ?? 0) + 1);
  }
}

let regressions = 0;
for (const [key, count] of errors) {
  const allowed = baseline.errors[key] ?? 0;
  if (count > allowed) {
    console.error(`${key}: ${count} errors (baseline ${allowed})`);
    regressions += count - allowed;
  }
}
const formatter = await eslint.loadFormatter('stylish');
console.log(formatter.format(results));
console.log(`Inherited ESLint errors: ${[...errors.values()].reduce((sum, count) => sum + count, 0)}; new errors: ${regressions}. Debt: ${baseline.issue}`);
const ui = checkControls(process.cwd());
for (const entry of ui.added) console.error(`${entry.file}:${entry.line}:${entry.column} ${entry.reason}`);
console.log(`UI controls: ${ui.count} legacy sites; ${ui.added.length} new; ${ui.stale.length} retired.`);
process.exitCode = regressions > 0 || ui.added.length > 0 ? 1 : 0;
