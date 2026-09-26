import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createFrameworkSeeds} from './framework-seeds.mjs';
import {buildExecutionZones} from './semantic-zones.mjs';

function fixture(t, files, {callbackNames = []} = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-zones-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.0.0'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({name: 'svelte', version: '5.0.0', exports: {'.': './index.js'}}),
    ...files
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), text);
  }
  const roots = Object.keys(files).filter((path) => path === 'entry.ts' || path === 'App.svelte');
  const graph = buildGraph({
    projectRoot, roots, tsconfig: 'tsconfig.json',
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
      {name: 'svelte', version: '5.0.0', provenance: 'registry'}
    ]
  });
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  assert.equal(context.complete, true, JSON.stringify(context.errors));
  const framework = createFrameworkSeeds(context);
  const flow = buildValueFlow(context, {onInvoke: framework.onInvoke});
  assert.equal(flow.complete, true, JSON.stringify(flow.errors));
  const named = (name) => [...context.functions.values()].find((fn) => fn.node.name?.text === name);
  const callbackSites = callbackNames.map((name) => {
    const fn = named(name);
    assert.ok(fn, `callback ${name}`);
    return {node: fn.node, value: flow.domain.atom('function', fn.id)};
  });
  const zones = buildExecutionZones(context, flow, framework, {callbackSites});
  const zoneNames = (name) => new Set(zones.values.get(named(name)?.id)?.keys() ?? []);
  return {context, flow, framework, zones, named, zoneNames};
}

test('dependency closures are wiring while eagerly invoked factories retain module execution', (t) => {
  const f = fixture(t, {'entry.ts': `
    import {createStore} from '@composable-svelte/core';
    function reducer(state, action) { return [state]; }
    function inertClient() { return fetch('/later'); }
    function makeClient() { fetch('/eager'); return function returnedClient() { return fetch('/returned'); }; }
    createStore({reducer, dependencies: {inertClient, eager: makeClient()}});
  `});
  assert.deepEqual(f.zoneNames('inertClient'), new Set(['wiring']));
  assert.ok(f.zoneNames('makeClient').has('module'));
  assert.equal(f.zoneNames('makeClient').has('wiring'), false);
  assert.ok(f.zoneNames('returnedClient').has('wiring'));
});

test('one helper can be attributed independently to wiring and a rendered callback', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {createStore} from '@composable-svelte/core';
    function reducer(state) { return [state]; }
    function shared() { return document.title; }
    createStore({reducer, dependencies: {shared}});
  </script><button onclick={shared}>Run</button>`}, {callbackNames: ['shared']});
  assert.deepEqual(f.zoneNames('shared'), new Set(['view', 'wiring']));
  assert.equal(f.zones.inLifecycle(f.named('shared').node), false);
});

test('Effect.run body is effect work and remains separate from its reducer', (t) => {
  const f = fixture(t, {'entry.ts': `
    import {Effect} from '@composable-svelte/core';
    import {defineApplication} from '@composable-svelte/core/application';
    function effectBody() { return fetch('/effect'); }
    function reducer(state, action) { return [state, Effect.run(effectBody)]; }
    defineApplication(reducer, {});
  `});
  assert.ok(f.zoneNames('reducer').has('decision'));
  assert.equal(f.zoneNames('reducer').has('effect'), false);
  assert.ok(f.zoneNames('effectBody').has('effect'));
  assert.equal(f.zoneNames('effectBody').has('decision'), false);
});

test('factory invoked by a reducer stays decision work while its returned closure is effect work', (t) => {
  const f = fixture(t, {'entry.ts': `
    import {Effect} from '@composable-svelte/core';
    import {defineApplication} from '@composable-svelte/core/application';
    function makeEffect() { const chosen = 'now'; return function later() { return fetch(chosen); }; }
    function reducer(state, action) { return [state, Effect.run(makeEffect())]; }
    defineApplication(reducer, {});
  `});
  assert.ok(f.zoneNames('makeEffect').has('decision'));
  assert.equal(f.zoneNames('makeEffect').has('effect'), false);
  assert.ok(f.zoneNames('later').has('effect'));
  assert.equal(f.zoneNames('later').has('decision'), false);
});

test('an imported but unused service function receives no execution zone', (t) => {
  const f = fixture(t, {
    'entry.ts': `import {unusedService} from './service'; export const value = 1;`,
    'service.ts': `export function unusedService() { return fetch('/unused'); }`
  });
  assert.deepEqual(f.zoneNames('unusedService'), new Set());
});

test('render callback is view work but only framework lifecycle callback has lifecycle marker', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {onMount} from 'svelte';
    function clickHandler() { document.title = 'clicked'; }
    function mounted() { document.title = 'mounted'; }
    onMount(mounted);
  </script><button onclick={clickHandler}>Run</button>`}, {callbackNames: ['clickHandler']});
  assert.ok(f.zoneNames('clickHandler').has('view'));
  assert.equal(f.zones.inLifecycle(f.named('clickHandler').node), false);
  assert.ok(f.zoneNames('mounted').has('view'));
  assert.equal(f.zones.inLifecycle(f.named('mounted').node), true);
});

test('local names shadowing core helpers do not create framework zones', (t) => {
  const f = fixture(t, {'entry.ts': `
    const Effect = {run(callback) { return callback; }};
    function localBody() { return fetch('/local'); }
    Effect.run(localBody);
  `});
  assert.equal(f.zoneNames('localBody').has('effect'), false);
  assert.deepEqual(f.zoneNames('localBody'), new Set());
  assert.equal(f.framework.effects.size, 0);
});
