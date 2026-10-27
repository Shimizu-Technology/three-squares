import ts from 'typescript';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exact implementation + component, never an entire page. Extend with the
// primitive's semantics/geometry tests when introducing a specialized control.
export const specializedControls = [
  { file: 'src/components/pos/POSProductTile.tsx', component: 'POSProductTile', reason: '128px sale tile with reserved title/price/state slots' },
  { file: 'src/components/pos/QuantityStepper.tsx', component: 'QuantityStepper', reason: 'Grouped quantity controls with 44px targets' },
];
const printer = ts.createPrinter({ removeComments: true });
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const attr = (node, name) => node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText() === name);
const classText = (attribute, source) => attribute?.initializer ? printer.printNode(ts.EmitHint.Unspecified, attribute.initializer, source) : '';
const componentName = node => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name) return parent.name.text;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.initializer &&
      (ts.isArrowFunction(parent.initializer) || ts.isFunctionExpression(parent.initializer))) return parent.name.text;
    if (ts.isClassDeclaration(parent) && parent.name) return parent.name.text;
  }
  return '<module>';
};
// Permit layout only; unknown/custom classes require putting the recipe in ui.
const layoutClass = token => /^(?:w-(?:full|auto)|(?:min|max)-w-(?:0|full|xs|sm|md|lg|xl|[2-7]xl)|(?:m[trblxy]?|gap[xy]?)-(?:0|1|2|3|4|6|8|12|16|auto)|(?:self|justify-self)-(?:start|end|center|stretch|auto)|(?:shrink|grow)(?:-0)?|(?:flex|order)-\d+|col-span-\d+)$/.test(token);

export function inspectSource(file, text, allowlist = specializedControls) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [], occurrences = new Map(), sharedNames = new Set(), linkNames = new Set(['a', 'Link', 'NavLink']);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier.text;
    for (const entry of statement.importClause?.namedBindings?.elements ?? []) {
      const original = entry.propertyName?.text ?? entry.name.text;
      if (['Button', 'IconButton'].includes(original) && /(?:^|\/)ui\/(?:Button|IconButton)(?:\.tsx)?$/.test(specifier)) sharedNames.add(entry.name.text);
      if (['Link', 'NavLink'].includes(original) && specifier === 'react-router-dom') linkNames.add(entry.name.text);
    }
  }
  function add(node, kind, reason) {
    const component = componentName(node);
    const fingerprint = hash(printer.printNode(ts.EmitHint.Unspecified, ts.isJsxSelfClosingElement(node) ? node : node.parent, source));
    const root = `${file}|${component}|${kind}|${fingerprint}`;
    const occurrence = (occurrences.get(root) ?? 0) + 1;
    occurrences.set(root, occurrence);
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ key: `${root}|${occurrence}`, file, component, line: line + 1, column: character + 1, hash: fingerprint, kind, reason });
  }
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source), component = componentName(node);
      const approved = allowlist.some(a => a.file === file && a.component === component && a.reason);
      if (!file.startsWith('src/components/ui/') && !approved) {
        if (tag === 'button') add(node, 'raw-button', 'Legacy native action; migrate to Button/IconButton or a reviewed specialized primitive');
        if (linkNames.has(tag)) {
          const cls = attr(node, 'className'), recipe = classText(cls, source);
          const staticClass = cls?.initializer && ts.isStringLiteral(cls.initializer);
          const buttonLike = attr(node, 'role')?.initializer?.getText(source).includes('button') ||
            /btn-|\b(?:bg-|border|rounded|inline-flex|(?:min-)?h-|p[xytrbl]?-)/.test(recipe) || (cls && !staticClass) || attr(node, 'style') || node.attributes.properties.some(ts.isJsxSpreadAttribute);
          if (buttonLike) add(node, 'button-like-link', 'Legacy action link recipe; migrate to Button href/to or a reviewed navigation primitive');
        }
        if (sharedNames.has(tag)) {
          const cls = attr(node, 'className');
          if (cls && (!cls.initializer || !ts.isStringLiteral(cls.initializer) || cls.initializer.text.split(/\s+/).filter(Boolean).some(t => !t.split(':').slice(0,-1).every(v => /^(sm|md|lg|xl|2xl)$/.test(v)) || !layoutClass(t.split(':').at(-1))))) {
            add(node, 'shared-override', 'Shared controls permit static layout classes only; choose variant/size for geometry and colors');
          }
          if (node.attributes.properties.some(ts.isJsxSpreadAttribute)) add(node, 'shared-override', 'Spread props can bypass the recipe; pass action/ARIA props explicitly outside ui');
          if (attr(node, 'style')) add(node, 'shared-override', 'Inline styles bypass the shared control recipe');
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

export function compareBaseline(current, baseline) {
  const allowed = new Set(baseline.map(entry => entry.key));
  const present = new Set(current.map(entry => entry.key));
  return { added: current.filter(entry => !allowed.has(entry.key)), stale: baseline.filter(entry => !present.has(entry.key)) };
}

export function collectControls(root) {
  const results = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) results.push(...inspectSource(path.relative(root, full).split(path.sep).join('/'), readFileSync(full, 'utf8')));
    }
  }
  walk(path.join(root, 'src'));
  return results;
}

export function checkControls(root, { ratchet = false, initialize = false } = {}) {
  const baselinePath = path.join(root, 'ui-controls-baseline.json');
  const current = collectControls(root);
  if (initialize) {
    if (existsSync(baselinePath)) throw new Error('Baseline exists; use --ratchet (which cannot accept new debt).');
    writeFileSync(baselinePath, JSON.stringify({ version: 1, entries: current }, null, 2) + '\n');
    return { added: [], stale: [], count: current.length };
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (baseline.version !== 1 || !Array.isArray(baseline.entries) || baseline.entries.some(e => !e.key || !e.file || !e.hash || !e.line || !e.reason)) throw new Error('Invalid per-site UI baseline');
  const result = compareBaseline(current, baseline.entries);
  if (ratchet && !result.added.length) writeFileSync(baselinePath, JSON.stringify({ version: 1, entries: current }, null, 2) + '\n');
  return { ...result, count: current.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkControls(process.cwd(), { ratchet: process.argv.includes('--ratchet'), initialize: process.argv.includes('--initialize') });
  for (const entry of result.added) console.error(`${entry.file}:${entry.line}:${entry.column} ${entry.kind}: ${entry.reason}`);
  console.log(`UI controls: ${result.count} baselined sites; ${result.added.length} new; ${result.stale.length} retired. Run npm run ui:ratchet after migrations.`);
  process.exitCode = result.added.length ? 1 : 0;
}
