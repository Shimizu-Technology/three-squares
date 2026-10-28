import ts from 'typescript';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Native controls are allowed only in these reviewed component implementations.
// A second component in the same file is not exempt.
export const nativeImplementations = [
  ['Button', 'Button', ['button']], ['Switch', 'Switch', ['button']],
  ['ChoiceGroup', 'ChoiceGroup', ['button']], ['POSProductTile', 'POSProductTile', ['button']],
  ['NavigationLink', 'NavigationDisclosure', ['button']],
  ['Input', 'Input', ['input']], ['Select', 'Select', ['select']], ['Textarea', 'Textarea', ['textarea']],
  ['CheckField', 'CheckField', ['input']], ['FileButton', 'FileButton', ['input']],
  ['Disclosure', 'Disclosure', ['details', 'summary']], ['ActionMenu', 'ActionMenu', ['details', 'summary']],
].map(([file, component, tags]) => ({ file: `src/components/ui/${file}.tsx`, component, tags }));
const sharedControls = new Set(['Button', 'IconButton', 'Field', 'Input', 'Select', 'Textarea', 'Switch', 'CheckField', 'FileButton', 'Disclosure', 'ActionMenu', 'Pagination', 'NavigationLink', 'NavigationDisclosure', 'ChoiceGroup', 'ActionTile', 'CustomerCard', 'CustomerCardFrame', 'HomeCategoryCard', 'POSProductTile', 'QuantityStepper']);
const printer = ts.createPrinter({ removeComments: true });
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
const proseClass = token => /^(?:(?:hover|focus-visible):)?(?:underline|no-underline|underline-offset-\d+|m[lr]-\d+|font-(?:medium|semibold|bold)|text-[a-zA-Z0-9/-]+|decoration-[a-zA-Z0-9/-]+|transition(?:-colors)?)$/.test(token);
const layoutClass = token => /^(?:w-(?:full|auto)|(?:min|max)-w-(?:0|full|xs|sm|md|lg|xl|[2-7]xl)|(?:m[trblxy]?|gap[xy]?)-(?:0|1|2|3|4|6|8|12|16|auto)|(?:self|justify-self)-(?:start|end|center|stretch|auto)|(?:shrink|grow)(?:-0)?|(?:flex|order)-\d+|col-span-\d+)$/.test(token);

export function inspectSource(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [], sharedNames = new Set(), linkNames = new Set(['a', 'Link', 'NavLink']);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings) && specifier === 'react-router-dom') {
      linkNames.add(`${bindings.name.text}.Link`); linkNames.add(`${bindings.name.text}.NavLink`);
    }
    for (const entry of bindings?.elements ?? []) {
      const original = entry.propertyName?.text ?? entry.name.text;
      if (sharedControls.has(original)) sharedNames.add(entry.name.text);
      if (['Link', 'NavLink'].includes(original) && specifier === 'react-router-dom') linkNames.add(entry.name.text);
    }
  }
  function add(node, kind, reason) {
    const component = componentName(node);
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ file, component, line: line + 1, column: character + 1, kind, reason });
  }
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source), component = componentName(node);
      const native = ['button', 'input', 'select', 'textarea', 'details', 'summary'].includes(tag);
      const approved = nativeImplementations.some(entry => entry.file === file && entry.component === component && entry.tags.includes(tag));
      if (native && !approved) add(node, `raw-${tag}`, 'Native control outside an approved components/ui implementation; use the shared primitive');
      if (attr(node, 'role')?.initializer?.getText(source).includes('button') && !native && !file.startsWith('src/components/ui/')) add(node, 'non-native-action', 'Use a native shared control rather than a button role on another element');
      if (!file.startsWith('src/components/ui/')) {
        if (linkNames.has(tag)) {
          const cls = attr(node, 'className'), recipe = classText(cls, source);
          const staticClass = cls?.initializer && ts.isStringLiteral(cls.initializer);
          const buttonLike = attr(node, 'role')?.initializer?.getText(source).includes('button') ||
            /btn-|\b(?:bg-|border|rounded|inline-flex|(?:min-)?h-|p[xytrbl]?-)/.test(recipe) || (staticClass && cls.initializer.text.split(/\s+/).filter(Boolean).some(token => !proseClass(token))) || (cls && !staticClass) || attr(node, 'style') || node.attributes.properties.some(ts.isJsxSpreadAttribute);
          if (buttonLike) add(node, 'button-like-link', 'Action link recipe outside components/ui; migrate to Button href/to or a reviewed navigation primitive');
        }
        if (sharedNames.has(tag) || sharedControls.has(tag.split('.').at(-1))) {
          const names = node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => attribute.name.getText(source));
          if (new Set(names).size !== names.length) add(node, 'shared-override', 'Duplicate control attributes can bypass the recipe');
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

export function collectControls(root) {
  const results = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.[jt]sx$/.test(entry.name)) results.push(...inspectSource(path.relative(root, full).split(path.sep).join('/'), readFileSync(full, 'utf8')));
    }
  }
  walk(path.join(root, 'src'));
  return results;
}

export function checkControls(root) {
  const violations = collectControls(root);
  return { violations, count: violations.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) {
    console.error('UI controls are strict: no baseline, initialization or ratchet flags are supported.');
    process.exitCode = 1;
  } else {
    const result = checkControls(process.cwd());
    for (const entry of result.violations) console.error(`${entry.file}:${entry.line}:${entry.column} ${entry.kind}: ${entry.reason}`);
    console.log(`UI controls: ${result.count} violations; zero required.`);
    process.exitCode = result.count ? 1 : 0;
  }
}
