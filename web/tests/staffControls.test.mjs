import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Render the actual controls with deterministic hooks. API request tests prove
// server authorization; real browser acceptance covers layout and interaction.
const dataModule = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const stateKey = 'globalThis.__staffControls';
const react = dataModule(`
  export const useState = initial => [typeof initial === 'function' ? initial() : initial, () => {}];
  export const useRef = initial => ({ current: initial });
  export const useMemo = fn => fn(); export const useCallback = fn => fn;
  export const useId = () => "synthetic-id";
  export const useEffect = () => {}; export const lazy = () => () => null;
  export const Suspense = () => null;
`);
async function load(relative, extra = '', simulated = false) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8') + extra;
  const ast = ts.createSourceFile('controls.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const mocks = {};
  for (const node of ast.statements.filter(ts.isImportDeclaration)) {
    const name = node.moduleSpecifier.text;
    if (name === 'react') { mocks[name] = react; continue; }
    if (name.endsWith('/posCart')) {
      const helper = readFileSync(new URL('../src/components/admin/posCart.ts', import.meta.url), 'utf8');
      mocks[name] = dataModule(ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
      continue;
    }
    if (name.endsWith('/usePaymentTerminal')) {
      mocks[name] = dataModule(`export const usePaymentTerminal = () => ({ terminals: [], selected: { id:1, provider:'stripe', environment:'${simulated ? 'simulated' : 'sandbox'}', terminal_id:'tmr_fixture', label:'Fixture reader', status:'ready', collectable:true }, selectedId:1, select(){}, reload:async()=>{}, loading:false, error:null });`);
      continue;
    }
    if (name.includes('StaffAccess')) {
      mocks[name] = dataModule(`export const useStaffAccess = () => ${stateKey}; export const StaffAccessProvider = () => null; export const StaffAccessDenied = () => null;`);
      continue;
    }
    if (name === 'react-router-dom') { mocks[name] = dataModule('export const useNavigate = () => () => {};'); continue; }
    if (name === '@clerk/clerk-react') { mocks[name] = dataModule("export const useAuth = () => ({userId:'fixture',getToken:async()=>null}); export const SignInButton = () => null;"); continue; }
    const clause = node.importClause;
    const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings.elements.filter(binding => !binding.isTypeOnly).map(binding => `export const ${binding.propertyName?.text || binding.name.text} = () => null;`).join('\n') : '';
    mocks[name] = dataModule(`${clause?.name ? 'export default function FixtureComponent() { return null; }' : ''}\n${named}`);
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replaceAll('import.meta.env.DEV', String(simulated))
    .replace(/import\.meta\.env\.[A-Z_]+/g, 'undefined')
    .replace(/from ["']([^"']+)["']/g, (_, name) => `from ${JSON.stringify(mocks[name] || import.meta.resolve(name))}`);
  return import(dataModule(compiled)).catch(error => { throw new Error(error.message); });
}
globalThis.localStorage = { getItem: () => null };
globalThis.window = { matchMedia: () => ({ matches: true }) };
const { default: Panel } = await load('../src/components/payment/simulation/SimulatedTerminalPanel.tsx');
const { AdminPOSWorkspace, POSAccessGate } = await load('../src/pages/admin/AdminPOSPage.tsx', '\nexport { AdminPOSWorkspace, POSAccessGate };');
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : '';
const roles = {
  owner: ['pos.sell', 'payments.collect', 'payments.simulate', 'payments.terminals.manage', 'payments.terminals.discover'],
  global_manager: ['pos.sell', 'payments.collect', 'payments.terminals.manage'],
  scoped_manager: ['pos.sell', 'payments.collect'], staff: ['pos.sell', 'payments.collect'], customer: [],
};
for (const [role, names] of Object.entries(roles)) test(`${role} sees only permitted POS and simulator controls`, () => {
  globalThis.__staffControls = {
    user: { role, operational_scope: role === 'staff' || role === 'scoped_manager' ? 'specific' : 'all' },
    loading: false, error: false, roleLabel: role, scopeLabel: 'Fixture scope', can: name => names.includes(name),
  };
  const panel = Panel({ locationId: 1, attemptId: 'attempt-fixture', terminalId: 1, onSelect() {}, getToken: async () => null, onChange: async () => {} });
  const buttons = elements(panel).filter(node => node.type === 'button').map(text);
  assert.equal(buttons.includes('Take card payment'), names.includes('payments.collect'));
  for (const command of ['Tap card', 'Approve', 'Decline', 'Enter wrong PIN', 'Disconnect', 'Reconnect', 'Lose response']) {
    assert.equal(buttons.includes(command), role === 'owner', command);
  }
  const discovery = elements(AdminPOSWorkspace()).filter(node => node.type === 'button').some(node => String(node.props.title || '').includes('connect reader'));
  assert.equal(discovery, role === 'owner');
  assert.equal(POSAccessGate().type.name === 'AdminPOSWorkspace', names.includes('pos.sell'));
});

// Keep the simulator in the cart's scroll flow, including at tablet breakpoints.
test('POS practice reader is docked inside the scrollable sale column and starts collapsed', async () => {
  globalThis.__staffControls = { user: { role: 'owner' }, roleLabel: 'Owner', scopeLabel: 'All locations', can: () => true };
  const { AdminPOSWorkspace: SimulatedPOS } = await load('../src/pages/admin/AdminPOSPage.tsx', '\nexport { AdminPOSWorkspace };', true);
  const tree = SimulatedPOS();
  const sale = elements(tree).find(node => node.props?.['aria-label'] === 'Current sale');
  assert.match(sale.props.className, /md:overflow-y-auto/);
  const dock = elements(sale).find(node => node.props?.terminalId === 1 && 'attemptId' in node.props);
  assert.ok(dock, 'practice reader must be a descendant of the sale column');
  const panel = Panel({ locationId: 1, attemptId: null, terminalId: 1, onSelect() {}, getToken: async () => null, onChange: async () => {} });
  assert.equal(panel.type, 'details');
  assert.equal(panel.props.open, false);
  assert.doesNotMatch(panel.props.className, /fixed|absolute/);
  assert.equal(text(elements(panel).find(node => node.type === 'summary')), 'Simulated payments — no money moves');
  const empty = elements(sale).find(node => node.type === 'div' && node.props.className?.includes('border-dashed') && text(node) === 'Cart is emptyTap items to add');
  assert.ok(empty);
  assert.match(empty.props.className, /min-h-44/);
  assert.doesNotMatch(empty.props.className, /h-full/);
});
