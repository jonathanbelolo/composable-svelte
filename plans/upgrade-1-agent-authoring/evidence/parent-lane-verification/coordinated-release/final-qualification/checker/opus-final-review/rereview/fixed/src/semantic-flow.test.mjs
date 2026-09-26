import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';

function fixture(t, files, options = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-flow-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {'@composable-svelte/core': '0.13.0-next.1'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js'}}),
    ...files
  };
  for (const [name, value] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), value);
  }
  const graph = buildGraph({projectRoot, roots: Object.keys(files), tsconfig: 'tsconfig.json', opaquePackages: [{name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'}]});
  const context = buildSemanticContext({projectRoot, graph});
  const flow = buildValueFlow(context, options);
  return {context, flow, projectRoot};
}

function identifierAt(module, fragment) {
  const offset = module.text.indexOf(fragment);
  assert.ok(offset >= 0, fragment);
  const found = [];
  for (const unit of module.units) {
    const walk = (node) => {
      if (ts.isIdentifier(node) && unit.base + node.getStart(unit.sourceFile) === offset) found.push(node);
      ts.forEachChild(node, walk);
    };
    walk(unit.sourceFile);
  }
  assert.equal(found.length, 1, `one identifier at ${fragment}`);
  return found[0];
}

test('local shadow never resolves to global authority', (t) => {
  const {context, flow} = fixture(t, {
    'entry.ts': 'const history = {title: "local"}; function f() { history.title; } window.history.back();'
  });
  const m = context.modules[0];
  const localIdent = identifierAt(m, 'history.title');
  const localVal = flow.value(localIdent);
  for (const a of localVal) {
    assert.notEqual(flow.domain.describe(a).kind, 'authority');
  }
  const globalIdent = identifierAt(m, 'history.back');
  const globalVal = flow.value(globalIdent.parent);
  assert.ok([...globalVal].some((a) => flow.domain.describe(a).kind === 'authority' && flow.domain.describe(a).id === 'history'));
});

test('alias helper and barrel exports propagate return values', (t) => {
  const {context, flow} = fixture(t, {
    'helper.ts': 'export function getTitle() { return "title-ok"; }',
    'barrel.ts': 'export {getTitle as fetchTitle} from "./helper";',
    'entry.ts': 'import {fetchTitle} from "./barrel"; const res = fetchTitle();'
  });
  const m = context.modules.find((mod) => mod.path.endsWith('entry.ts'));
  const resIdent = identifierAt(m, 'res =');
  const b = context.symbols.bindingOf(resIdent);
  const val = flow.bindingValue(b);
  assert.ok([...val].some((a) => flow.domain.describe(a).kind === 'literal' && flow.domain.describe(a).id === JSON.stringify('title-ok')));
});

test('parameter leaf destructuring, defaults, and rest array heap', (t) => {
  const {context, flow} = fixture(t, {
    'entry.ts': 'function testFn({a, b = "default-b"}, ...rest) { a; b; rest; } testFn({a: "passed-a"}, 1, 2);'
  });
  const m = context.modules[0];
  const bA = context.symbols.bindingOf(identifierAt(m, 'a;'));
  const bB = context.symbols.bindingOf(identifierAt(m, 'b;'));
  const bRest = context.symbols.bindingOf(identifierAt(m, 'rest;'));
  assert.ok([...flow.bindingValue(bA)].some((a) => flow.domain.describe(a).id === JSON.stringify('passed-a')));
  assert.ok([...flow.bindingValue(bB)].some((a) => flow.domain.describe(a).id === JSON.stringify('default-b')));
  const valRest = flow.bindingValue(bRest);
  assert.ok([...valRest].some((a) => flow.domain.describe(a).kind === 'heap'));
  const restRead = flow.domain.read(valRest, '0');
  assert.ok([...restRead].some((a) => flow.domain.describe(a).id === JSON.stringify(1)));
});

test('cyclic calls reach finite fixed point and converge', (t) => {
  const {flow} = fixture(t, {
    'entry.ts': 'function ping(x) { return pong(x); } function pong(y) { return ping(y); } ping("token");'
  });
  assert.equal(flow.complete, true);
  assert.deepEqual(flow.errors, []);
});

test('namespace dynamic import and then callback propagation', (t) => {
  const {context, flow} = fixture(t, {
    'mod.ts': 'export const data = "mod-data";',
    'entry.ts': 'async function run() { const m = await import("./mod"); const r = m.data; import("./mod").then((ns) => { const x = ns.data; }); } run();'
  });
  const m = context.modules.find((mod) => mod.path.endsWith('entry.ts'));
  const rIdent = identifierAt(m, 'r =');
  const bR = context.symbols.bindingOf(rIdent);
  assert.ok([...flow.bindingValue(bR)].some((a) => flow.domain.describe(a).id === JSON.stringify('mod-data')));
  const xIdent = identifierAt(m, 'x =');
  const bX = context.symbols.bindingOf(xIdent);
  assert.ok([...flow.bindingValue(bX)].some((a) => flow.domain.describe(a).id === JSON.stringify('mod-data')));
});

test('class this instance, constructor write, arrow this, and ambiguous this rejection', (t) => {
  const {context, flow} = fixture(t, {
    'entry.ts': 'class Service { title = "init"; constructor() { this.title = "ctor-title"; } getTitle() { const f = () => this.title; return f(); } bad() { function nested() { return this; } return nested(); } } const s = new Service(); const out = s.getTitle();'
  });
  const m = context.modules[0];
  const outIdent = identifierAt(m, 'out =');
  const bOut = context.symbols.bindingOf(outIdent);
  assert.ok([...flow.bindingValue(bOut)].some((a) => flow.domain.describe(a).id === JSON.stringify('ctor-title')));
  assert.ok(flow.errors.some((err) => err.construct === 'ambiguous-this'));
  assert.equal(flow.complete, false);
});

test('copied state descendants preserve state atom through seedBinding and solve', (t) => {
  const {context, flow} = fixture(t, {
    'entry.ts': 'function processState(state) { const copy = state.slice(); return copy; }'
  });
  const m = context.modules[0];
  const stateIdent = identifierAt(m, 'state)');
  const stateBinding = context.symbols.bindingOf(stateIdent);
  assert.ok(stateBinding);
  const stateAtom = flow.domain.atom('state', 'app-state-1');
  flow.seedBinding(stateBinding, stateAtom);
  flow.solve();
  const copyIdent = identifierAt(m, 'copy =');
  const bCopy = context.symbols.bindingOf(copyIdent);
  const copyVal = flow.bindingValue(bCopy);
  const copyDescendant = flow.domain.read(copyVal, '*');
  assert.ok([...copyDescendant].some((a) => flow.domain.describe(a).kind === 'state' && flow.domain.describe(a).id === 'app-state-1'));
});

test('input hooks provide monotonic seeds on invoke and property', (t) => {
  const {context, flow} = fixture(t, {
    'entry.ts': 'function customHook() { const obj = {a: 1}; const val = obj.a; } customHook();'
  }, {
    onInvoke: (call, api) => api.domain.atom('hook-invoke', 'called'),
    onProperty: (prop, api) => api.domain.atom('hook-prop', 'prop-read')
  });
  const m = context.modules[0];
  const valIdent = identifierAt(m, 'val =');
  const bVal = context.symbols.bindingOf(valIdent);
  assert.ok([...flow.bindingValue(bVal)].some((a) => flow.domain.describe(a).kind === 'hook-prop'));
});

test('non-convergence refuses complete and records actionable error', (t) => {
  const {flow} = fixture(t, {
    'entry.ts': 'let a = 0; let b = 0; let c = 0; a = b; b = c; c = 1;'
  }, {maxPasses: 1});
  assert.equal(flow.complete, false);
  assert.ok(flow.errors.some((err) => err.code === 'non-convergence'));
});
