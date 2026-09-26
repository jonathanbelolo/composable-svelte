import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {parseSemanticModules} from './semantic-parse.mjs';
import {buildSymbols} from './symbols.mjs';
import {buildOrigins} from './semantic-origins.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {createValueDomain} from './taint-values.mjs';
import {createAuthorityValues} from './authority-values.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createTypeSeeds} from './semantic-types.mjs';

function setupContext(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-types-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {'@composable-svelte/core': '0.13.0-next.1'}}),
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

test('builtin unbound BOM/DOM types seed authorities while locally shadowed do not', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      export {};
      interface History { local: true; }
      let a: Window;
      let b: History;
      let c: Document;
      let d: HTMLDivElement;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }
  assert.ok(flow.domain.equal(valuesByName.get('a'), flow.authority.authority('window')));
  assert.equal(valuesByName.get('b'), undefined);
  assert.ok(flow.domain.equal(valuesByName.get('c'), flow.authority.authority('document')));
  assert.ok(flow.domain.equal(valuesByName.get('d'), flow.authority.authority('element')));
});

test('core named and namespace authority type origin resolves properly', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      import type * as CoreApp from '@composable-svelte/core/application';
      let s1: Store<any, any>;
      let s2: CoreApp.ApplicationStore<any, any>;
      let v: CoreApp.ChildView<any, any>;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }
  assert.ok(flow.domain.equal(valuesByName.get('s1'), flow.authority.authority('store')));
  assert.ok(flow.domain.equal(valuesByName.get('s2'), flow.authority.authority('store')));
  assert.ok(flow.domain.equal(valuesByName.get('v'), flow.authority.authority('view')));
});

test('feature props destructuring seeds store and views to bindings and $props initializer', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {FeatureViewProps} from '@composable-svelte/core/application';
      function $props(): any {}
      let {store, views}: FeatureViewProps<any, any> = $props();
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }
  assert.ok(flow.domain.equal(valuesByName.get('store'), flow.authority.authority('view')));
  assert.ok(flow.domain.equal(valuesByName.get('views'), flow.authority.authority('views')));

  assert.ok(flow.nodeValues.size > 0);
  let callSeeded = false;
  for (const [node, val] of flow.nodeValues) {
    if (ts.isCallExpression(node)) {
      callSeeded = true;
      assert.ok(flow.domain.equal(flow.domain.read(val, 'store'), flow.authority.authority('view')));
      assert.ok(flow.domain.equal(flow.domain.read(val, 'views'), flow.authority.authority('views')));
    }
  }
  assert.ok(callSeeded);
});

test('typealias generic substitution and nested typed array/tuple stores', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      type Wrap<T> = { item: T };
      type StoreArray = Store<any, any>[];
      let boxed: Wrap<Store<any, any>>;
      let list: StoreArray;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }

  const boxedVal = valuesByName.get('boxed');
  assert.ok(boxedVal);
  assert.ok(flow.domain.equal(flow.domain.read(boxedVal, 'item'), flow.authority.authority('store')));

  const listVal = valuesByName.get('list');
  assert.ok(listVal);
  assert.ok(flow.domain.equal(flow.domain.read(listVal, '*'), flow.authority.authority('store')));
});

test('reducer type annotation triggers onReducer callback and cast/satisfies joins value', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Reducer} from '@composable-svelte/core';
      const base = 42;
      const myRed = base as Reducer<any, any>;
      function handler(r: Reducer<any, any>) {}
    `
  });
  const flow = createMockFlow();
  const reducersReported = [];
  const seeder = createTypeSeeds(context, flow, {
    onReducer(node, val) {
      reducersReported.push({node, val});
    }
  });
  seeder.apply();

  assert.equal(reducersReported.length, 2);
  assert.equal(ts.isAsExpression(reducersReported[0].node), true);
  assert.equal(ts.isParameter(reducersReported[1].node), true);
});

test('recursive plain data type terminates without looping and seeding is idempotent', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      type Tree = { child?: Tree; name: string };
      let tree: Tree;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();
  seeder.apply();

  const valuesByName = new Map();
  for (const [binding, val] of flow.bindingValues) {
    valuesByName.set(binding.name, val);
  }
  assert.equal(valuesByName.has('tree'), false);
  assert.deepEqual(seeder.errors, []);
});

test('type-derived heaps have stable identities across repeated queries', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {FeatureViewProps} from '@composable-svelte/core/application';
      let props: FeatureViewProps<any, any>;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  const declaration = context.nodes.map((record) => record.node)
    .find((node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'props');
  assert.ok(declaration?.type);
  assert.ok(flow.domain.equal(seeder.typeValue(declaration.type), seeder.typeValue(declaration.type)));
});

test('nested generic aliases retain caller substitutions', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      type Box<T> = { value: T };
      type Wrap<U> = Box<U>;
      let boxed: Wrap<Store<any, any>>;
    `
  });
  const flow = createMockFlow();
  createTypeSeeds(context, flow).apply();
  const boxed = [...flow.bindingValues].find(([binding]) => binding.name === 'boxed')?.[1];
  assert.ok(boxed);
  assert.ok(flow.domain.equal(flow.domain.read(boxed, 'value'), flow.authority.authority('store')));
});

test('annotated reducer variable reports its initializer value', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Reducer} from '@composable-svelte/core';
      const reducer: Reducer<any, any> = (state) => [state, undefined];
    `
  });
  const flow = createMockFlow();
  const declaration = context.nodes.map((record) => record.node)
    .find((node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'reducer');
  assert.ok(declaration?.initializer);
  const actual = flow.domain.atom('function', 'fixture-reducer');
  flow.seedNode(declaration.initializer, actual);
  const reported = [];
  createTypeSeeds(context, flow, {onReducer: (node, value) => reported.push({node, value})}).apply();
  assert.equal(reported.length, 1);
  assert.equal(reported[0].node, declaration.initializer);
  assert.ok(flow.domain.equal(reported[0].value, actual));
});

test('reapplying joins late actual flow facts into a typed assertion', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      declare const source: unknown;
      const asserted = source as Store<any, any>;
    `
  });
  const flow = createMockFlow();
  const assertion = context.nodes.map((record) => record.node).find(ts.isAsExpression);
  assert.ok(assertion);
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();
  const actual = flow.domain.atom('literal', 'late');
  flow.seedNode(assertion.expression, actual);
  seeder.apply();
  const seeded = flow.value(assertion);
  assert.ok(flow.domain.equal(flow.domain.join(flow.authority.authority('store'), actual), seeded));
});

test('authority-bearing utility transformations fail explicitly when unsupported', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import type {Store} from '@composable-svelte/core';
      let wrapped: Readonly<Store<any, any>>;
    `
  });
  const flow = createMockFlow();
  const seeder = createTypeSeeds(context, flow);
  seeder.apply();
  assert.ok(seeder.errors.some((error) => error.code === 'unsupported-authority-type'));
});

test('real flow receives typed Reducer and FeatureViewProps seeds', (t) => {
  const context = setupContext(t, {
    'entry.ts': `
      import {Effect, type Reducer} from '@composable-svelte/core';
      import type {FeatureViewProps} from '@composable-svelte/core/application';
      type State = { count: number };
      type Action = { type: 'increment' };
      const reducer: Reducer<State, Action> = (state) => [state, Effect.none()];
      function $props(): unknown { return {}; }
      let {store, views}: FeatureViewProps<State, Action> = $props() as FeatureViewProps<State, Action>;
      const dispatch = store.dispatch;
      const item = views.item;
      declare const structural: unknown;
      const castStore = (structural as FeatureViewProps<State, Action>).store;
    `
  });
  const hookCalls = {invoke: 0, property: 0};
  const flow = buildValueFlow(context, {
    onInvoke(_call, api) {
      hookCalls.invoke++;
      return api.domain.empty();
    },
    onProperty(_read, api) {
      hookCalls.property++;
      return api.domain.empty();
    }
  });
  const reducers = [];
  const seeder = createTypeSeeds(context, flow, {onReducer: (node, value) => reducers.push({node, value})});
  seeder.apply();
  flow.solve();
  seeder.apply();
  flow.solve();

  const binding = (name) => {
    const matches = context.symbols.bindings.filter((candidate) => candidate.name === name);
    assert.equal(matches.length, 1, `unique binding ${name}`);
    return matches[0];
  };
  const has = (value, kind, id) => [...value].some((atom) => {
    const described = flow.domain.describe(atom);
    return described.kind === kind && (id === undefined || described.id === id);
  });
  assert.ok(has(flow.bindingValue(binding('store')), 'authority', 'view'));
  assert.ok(has(flow.bindingValue(binding('views')), 'authority', 'views'));
  assert.ok(has(flow.bindingValue(binding('dispatch')), 'dispatch', 'view'));
  assert.ok(has(flow.bindingValue(binding('item')), 'authority', 'feature-handle'));
  assert.ok(has(flow.bindingValue(binding('castStore')), 'authority', 'view'));
  assert.ok(reducers.some(({node, value}) => ts.isArrowFunction(node) && has(value, 'function')));
  assert.ok(hookCalls.invoke > 0);
  assert.ok(hookCalls.property > 0);
  assert.deepEqual(seeder.errors, []);
  assert.deepEqual(flow.errors, []);
  assert.equal(flow.complete, true);
});
