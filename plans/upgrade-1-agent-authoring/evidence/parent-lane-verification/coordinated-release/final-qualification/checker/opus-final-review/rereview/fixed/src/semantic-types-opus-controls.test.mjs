import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {createValueDomain} from './taint-values.mjs';
import {createAuthorityValues} from './authority-values.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createTypeSeeds} from './semantic-types.mjs';

function setupContext(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-types-opus-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({
      name: 'fixture',
      dependencies: {'@composable-svelte/core': '0.13.0-next.1'}
    }),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: '0.13.0-next.1',
      exports: {
        '.': './index.js',
        './application': './application.js'
      }
    }),
    ...files
  };
  for (const [name, value] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), value);
  }
  const graph = buildGraph({
    projectRoot,
    roots: Object.keys(files),
    tsconfig: 'tsconfig.json',
    opaquePackages: [{name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'}]
  });
  return buildSemanticContext({projectRoot, graph});
}

function createMockFlow() {
  const domain = createValueDomain();
  const authority = createAuthorityValues(domain);
  const bindingValues = new Map();
  const nodeValues = new Map();
  return {
    domain,
    authority,
    value(node) { return nodeValues.get(node) ?? domain.empty(); },
    seedBinding(binding, val) {
      const existing = bindingValues.get(binding) ?? domain.empty();
      bindingValues.set(binding, domain.join(existing, val));
    },
    seedNode(node, val) {
      const existing = nodeValues.get(node) ?? domain.empty();
      nodeValues.set(node, domain.join(existing, val));
    },
    bindingValues,
    nodeValues
  };
}

function stabilize(seeder, flow, maxPasses = 10) {
  let passes = 0;
  while (passes < maxPasses) {
    const before = flow.revision;
    seeder.apply();
    flow.solve();
    passes++;
    if (flow.revision === before) return passes;
  }
  assert.fail(`type/flow fixed point did not converge within ${maxPasses} passes`);
}

function hasAtom(domain, value, kind, id) {
  if (!value || !(value instanceof Set)) return false;
  return [...value].some((atom) => {
    const described = domain.describe(atom);
    return described.kind === kind && (id === undefined || described.id === id);
  });
}

// ---- F1: Local namespace aliases and barrel re-exports ----
test('F1: namespace-qualified types from local modules and barrel re-exports preserve authority', (t) => {
  const context = setupContext(t, {
    'types.ts': `
      import type {Store} from '@composable-svelte/core';
      export type AppStore = Store<any, any>;
      export type {Store as ReexportedStore} from '@composable-svelte/core';
    `,
    'entry.ts': `
      import type * as T from './types';
      let s1: T.AppStore;
      let s2: T.ReexportedStore<any, any>;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  assert.ok(valuesByName.has('s1'), 's1 binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('s1'), 'authority', 'store'), 's1 has store authority');
  assert.ok(valuesByName.has('s2'), 's2 binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('s2'), 'authority', 'store'), 's2 has store authority');
  assert.deepEqual(seeder.errors, []);
});

// ---- F2: Value-only shadowed imports ----
test('F2: lexical fallback with value-only shadow in scope preserves anchored type import', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      function f() {
        const Store = 0;
        let s: Store<any, any>;
      }
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  assert.ok(valuesByName.has('s'), 's binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('s'), 'authority', 'store'), 's has store authority');
  assert.deepEqual(seeder.errors, []);
});

test('F2: import with value-only origin does not shadow global DOM builtin in type position', (t) => {
  const context = setupContext(t, {
    'helpers.ts': `
      export function Location() { return 'not-dom'; }
    `,
    'entry.ts': `
      import {Location} from './helpers';
      let loc: Location;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  assert.ok(valuesByName.has('loc'), 'loc binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('loc'), 'authority', 'location'), 'loc has location authority');
  assert.deepEqual(seeder.errors, []);
});

// ---- F3: Destructured authority ----
test('F3: pattern seeding with member projector propagates authority to destructured bindings', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      import type {FeatureViewProps} from '@composable-svelte/core/application';
      export function bindStore({dispatch}: Store<any, any>) {}
      export function bindProps({store: {dispatch: viewDispatch}}: FeatureViewProps<any, any>) {}
      declare const win: Window;
      const {document: winDoc}: Window = win;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  assert.ok(valuesByName.has('dispatch'), 'dispatch binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('dispatch'), 'dispatch', 'store'), 'dispatch binding has store dispatch atom');

  assert.ok(valuesByName.has('viewDispatch'), 'viewDispatch binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('viewDispatch'), 'dispatch', 'view'), 'viewDispatch binding has view dispatch atom');

  assert.ok(valuesByName.has('winDoc'), 'winDoc binding is seeded');
  assert.ok(hasAtom(flow.domain, valuesByName.get('winDoc'), 'authority', 'document'), 'winDoc binding has document authority');
});

test('F3: real flow propagates destructured dispatch authority from Store and FeatureViewProps', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      import type {FeatureViewProps} from '@composable-svelte/core/application';
      export function bindStore({dispatch}: Store<any, any>) {
        return dispatch;
      }
      export function bindProps({store: {dispatch: viewDispatch}}: FeatureViewProps<any, any>) {
        return viewDispatch;
      }
    `
  });
  const flow = buildValueFlow(context);
  const seeder = createTypeSeeds(context, flow);
  stabilize(seeder, flow, 10);

  const dispatchBinding = context.symbols.bindings.find((b) => b.name === 'dispatch');
  assert.ok(dispatchBinding, 'dispatch binding exists');
  assert.ok(
    hasAtom(flow.domain, flow.bindingValue(dispatchBinding), 'dispatch', 'store'),
    'real flow seeds store dispatch to destructured parameter'
  );

  const viewDispatchBinding = context.symbols.bindings.find((b) => b.name === 'viewDispatch');
  assert.ok(viewDispatchBinding, 'viewDispatch binding exists');
  assert.ok(
    hasAtom(flow.domain, flow.bindingValue(viewDispatchBinding), 'dispatch', 'view'),
    'real flow seeds view dispatch to nested destructured parameter'
  );

  assert.deepEqual(flow.errors, []);
});

// ---- F4: Recursive authority-bearing types ----
test('F4: recursive authority-bearing types terminate and either preserve authority or report unsupported diagnostic', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {ChildView} from '@composable-svelte/core/application';
      type Tree = { view: ChildView<any, any>; child?: Tree };
      let t: Tree;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  const tVal = valuesByName.get('t');
  let hasRecursiveView = false;
  if (tVal) {
    const child = flow.domain.read(tVal, 'child');
    const childView = flow.domain.read(child, 'view');
    hasRecursiveView = hasAtom(flow.domain, childView, 'authority', 'view');
  }
  const hasDiagnostic = seeder.errors.some((err) => err.code === 'unsupported-authority-type');

  assert.ok(
    hasRecursiveView || hasDiagnostic,
    'Recursive authority must either propagate through self-referential heap or report unsupported-authority-type'
  );
});

// ---- F5: Reducer-typed parameter incoming actual callback and growth ----
test('F5: reducer-typed parameter reports incoming callback and tracks growth under real flow', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import {Effect, type Reducer} from '@composable-svelte/core';
      type State = { count: number };
      type Action = { type: 'inc' };
      function register(r: Reducer<State, Action>) {}
      register((s) => [s, Effect.none()]);
      register((s) => [{count: 1}, Effect.none()]);
      const later = (s) => [{count: 2}, Effect.none()];
    `
  });
  const flow = buildValueFlow(context);
  const reported = [];
  const seeder = createTypeSeeds(context, flow, {
    onReducer(node, val) {
      reported.push({node, val: new Set(val)});
    }
  });

  seeder.apply();
  const initialParameterReport = reported.find(({node}) => ts.isParameter(node));
  assert.ok(initialParameterReport, 'parameter receives an initial report');
  const passes = stabilize(seeder, flow, 10);
  assert.ok(passes > 0 && passes <= 10, 'stabilization loop completes within bounded passes');

  const paramReports = reported.filter(({node}) => ts.isParameter(node));
  assert.ok(paramReports.length > 0, 'onReducer reported for reducer-typed parameter');

  const lastParamReport = paramReports[paramReports.length - 1];
  const functionAtoms = [...lastParamReport.val].filter(
    (atom) => flow.domain.describe(atom).kind === 'function'
  );
  assert.equal(functionAtoms.length, 2, 'both distinct incoming callbacks are reported');
  const arrows = context.nodes.map(({node}) => node).filter(ts.isArrowFunction);
  const expected = new Set(arrows.slice(0, 2).flatMap((node) => [...flow.value(node)]));
  assert.deepEqual(new Set(functionAtoms), expected, 'reported callbacks match actual incoming arrow identities');
  const beforeGrowth = reported.length;
  const parameter = context.symbols.bindings.find((binding) => binding.name === 'r');
  flow.seedBinding(parameter, flow.value(arrows[2]));
  stabilize(seeder, flow);
  const grown = reported.filter(({node}) => ts.isParameter(node)).at(-1);
  const allCallbacks = new Set(arrows.flatMap((node) => [...flow.value(node)]));
  assert.ok(reported.length > beforeGrowth, 'later incoming callback growth is re-reported');
  assert.deepEqual(grown.val, allCallbacks, 'grown report retains all actual callbacks');

  assert.deepEqual(flow.errors, []);
});

// ---- F6: Infer shadowing in conditionals ----
test('F6: infer type parameter does not fall back to outer alias or global DOM types', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      type ExtractItem<T> = T extends {item: infer Element} ? Element : never;
      let elem: ExtractItem<{item: number}>;

      type OuterStore = Store<any, any>;
      type UnwrapOuter<T> = T extends {inner: infer OuterStore} ? OuterStore : never;
      let nonStore: UnwrapOuter<{inner: number}>;

      type UnwrapStore<T> = T extends {inner: infer U} ? U : never;
      let s: UnwrapStore<{inner: Store<any, any>}>;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  const elemVal = valuesByName.get('elem');
  assert.ok(!hasAtom(flow.domain, elemVal, 'authority', 'element'), 'elem must not resolve to global DOM Element authority');

  const nonStoreVal = valuesByName.get('nonStore');
  assert.ok(!hasAtom(flow.domain, nonStoreVal, 'authority', 'store'), 'nonStore must not resolve to outer Store alias');

  const sVal = valuesByName.get('s');
  const hasStore = hasAtom(flow.domain, sVal, 'authority', 'store');
  const hasDiagnostic = seeder.errors.some((err) => err.code === 'unsupported-authority-type');
  assert.ok(hasStore || hasDiagnostic, 'infer over authority type must yield authority or emit unsupported diagnostic');
});

// ---- F7: Merged interfaces ----
test('F7: declaration-merged interfaces preserve authority from all declarations', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      interface Props {
        title: string;
      }
      interface Props {
        store: Store<any, any>;
      }
      let p: Props;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  assert.ok(valuesByName.has('p'), 'p binding is seeded');
  const pVal = valuesByName.get('p');
  const storeProp = flow.domain.read(pVal, 'store');
  assert.ok(hasAtom(flow.domain, storeProp, 'authority', 'store'), 'store property on merged interface has store authority');
});

// ---- F8: Tuple position precision ----
test('F8: tuple positions are distinct and do not bleed across indices', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      export function f([s, w]: [Store<any, any>, Window]) {}
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  assert.ok(valuesByName.has('s'), 's binding is seeded');
  assert.ok(valuesByName.has('w'), 'w binding is seeded');

  const sVal = valuesByName.get('s');
  const wVal = valuesByName.get('w');

  assert.ok(hasAtom(flow.domain, sVal, 'authority', 'store'), 's has store authority');
  assert.ok(!hasAtom(flow.domain, sVal, 'authority', 'window'), 's must not carry window authority from index 1');

  assert.ok(hasAtom(flow.domain, wVal, 'authority', 'window'), 'w has window authority');
  assert.ok(!hasAtom(flow.domain, wVal, 'authority', 'store'), 'w must not carry store authority from index 0');
});

// ---- F9: Distinct nested arrays ----
test('F9: nested arrays allocate distinct heaps and do not share identity', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      let grid: Store<any, any>[][];
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  const gridVal = valuesByName.get('grid');
  assert.ok(gridVal, 'grid binding is seeded');

  const row = flow.domain.read(gridVal, '*');
  const cell = flow.domain.read(row, '*');

  assert.ok(hasAtom(flow.domain, cell, 'authority', 'store'), 'grid[0][0] has store authority');
  assert.ok(!hasAtom(flow.domain, row, 'authority', 'store'), 'grid[0] row must not carry direct store authority');
  assert.ok(!hasAtom(flow.domain, row, 'dispatch', 'store'), 'grid[0] row must not carry dispatch atom');

  const gridAtoms = [...gridVal];
  const rowAtoms = [...row].filter((a) => flow.domain.describe(a).kind === 'heap');
  for (const ga of gridAtoms) {
    for (const ra of rowAtoms) {
      assert.notEqual(ga, ra, 'outer array heap and inner row heap must have distinct identities');
    }
  }
});

// ---- F10: Class field lexical pollution ----
test('F10: class property declarations do not pollute outer lexical bindings', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      let store = 0;
      class Widget {
        store: Window;
      }
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const storeBinding = context.symbols.bindings.find((b) => b.name === 'store' && !b.typeOnly);
  assert.ok(storeBinding, 'store lexical binding found');

  const storeVal = flow.bindingValues.get(storeBinding);
  assert.ok(!hasAtom(flow.domain, storeVal, 'authority', 'window'), 'outer store binding must not receive window authority');
});

test('F10: class field names do not pollute outer lexical bindings under real flow', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      let store = 0;
      class Widget {
        store: Window;
      }
    `
  });
  const flow = buildValueFlow(context);
  const seeder = createTypeSeeds(context, flow);
  stabilize(seeder, flow, 10);

  const storeBinding = context.symbols.bindings.find((b) => b.name === 'store' && !b.typeOnly);
  assert.ok(storeBinding, 'outer store binding found');

  const storeVal = flow.bindingValue(storeBinding);
  assert.ok(!hasAtom(flow.domain, storeVal, 'authority', 'window'), 'outer store binding must not receive window authority');
  assert.deepEqual(flow.errors, []);
});

// ---- F11: Module-local versus script global interface semantics ----
test('F11: interface shadowing global DOM builtin in external module does not seed authority', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      export {};
      interface History { local: true; }
      let h: History;
      let w: Window;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  const hVal = valuesByName.get('h');
  assert.ok(!hasAtom(flow.domain, hVal, 'authority', 'history'), 'shadowed History interface does not seed history authority');
  assert.ok(hasAtom(flow.domain, valuesByName.get('w'), 'authority', 'window'), 'unshadowed Window seeds window authority');
});

// ---- F12: Distinct instantiation, satisfies callbacks, and ordinary data ----
test('F12: distinct generic instantiations receive distinct heap identities and values', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      type Wrap<T> = { item: T };
      let w1: Wrap<Store<any, any>>;
      let w2: Wrap<Window>;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  const w1Val = valuesByName.get('w1');
  const w2Val = valuesByName.get('w2');
  assert.ok(w1Val && w2Val, 'both wrapped bindings are seeded');

  const w1Heap = [...w1Val][0];
  const w2Heap = [...w2Val][0];
  assert.notEqual(w1Heap, w2Heap, 'Wrap<Store> and Wrap<Window> must allocate distinct heaps');

  const w1Item = flow.domain.read(w1Val, 'item');
  const w2Item = flow.domain.read(w2Val, 'item');
  assert.ok(hasAtom(flow.domain, w1Item, 'authority', 'store'), 'w1.item has store authority');
  assert.ok(!hasAtom(flow.domain, w1Item, 'authority', 'window'), 'w1.item does not have window authority');
  assert.ok(hasAtom(flow.domain, w2Item, 'authority', 'window'), 'w2.item has window authority');
  assert.ok(!hasAtom(flow.domain, w2Item, 'authority', 'store'), 'w2.item does not have store authority');
});

test('F12: satisfies expression reports reducer callback and joins underlying actual value', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import {Effect, type Reducer} from '@composable-svelte/core';
      const myRed = ((state) => [state, Effect.none()]) satisfies Reducer<any, any>;
    `
  });
  const flow = createMockFlow();
  const satisfiesNode = context.nodes.map((r) => r.node).find(ts.isSatisfiesExpression);
  assert.ok(satisfiesNode, 'found satisfies expression');

  const actualFnAtom = flow.domain.atom('function', 'satisfies-fn');
  flow.seedNode(satisfiesNode.expression, actualFnAtom);

  const reported = [];
  const seeder = createTypeSeeds(context, flow, {
    onReducer(node, val) {
      reported.push({node, val: new Set(val)});
    }
  });
  seeder.apply();

  assert.ok(reported.length > 0, 'onReducer called for satisfies reducer');
  assert.ok(reported.some((r) => r.node === satisfiesNode), 'satisfies node reported');
  const satisfiesReport = reported.find((r) => r.node === satisfiesNode);
  assert.ok(hasAtom(flow.domain, satisfiesReport.val, 'function', 'satisfies-fn'), 'satisfies report includes actual function atom');

  const seededVal = flow.nodeValues.get(satisfiesNode);
  assert.ok(hasAtom(flow.domain, seededVal, 'authority', 'reducer'), 'satisfies node has reducer authority');
  assert.ok(hasAtom(flow.domain, seededVal, 'function', 'satisfies-fn'), 'satisfies node has actual function atom');
});

test('F12: ordinary data types evaluate empty and generate no unsupported diagnostics', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      type NumTree = { val: number; next?: NumTree };
      let m: Map<string, number>;
      let p: Promise<void>;
      let r: Record<string, number>;
      let d: Date;
      let tree: NumTree;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  for (const name of ['m', 'p', 'r', 'd', 'tree']) {
    const val = valuesByName.get(name);
    assert.ok(!val || val.size === 0, `${name} has empty authority value`);
  }

  assert.deepEqual(seeder.errors, [], 'no unsupported-authority-type diagnostics for ordinary data');
});
