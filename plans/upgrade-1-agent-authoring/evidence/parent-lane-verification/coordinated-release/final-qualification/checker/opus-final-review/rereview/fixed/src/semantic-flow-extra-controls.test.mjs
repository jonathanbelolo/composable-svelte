import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {compile} from 'svelte/compiler';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createFrameworkSeeds} from './framework-seeds.mjs';
import {buildExecutionZones} from './semantic-zones.mjs';
import {evaluateSemanticRules} from './rules/semantic-rules.mjs';

function fixture(t, files, roots = Object.keys(files)) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-flow-extra-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({dependencies: {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.0.0'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}}),
    'node_modules/svelte/package.json': JSON.stringify({name: 'svelte', version: '5.0.0', exports: {'.': './index.js'}}),
    ...files
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), text);
  }
  const graph = buildGraph({projectRoot, roots, tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.0.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  assert.equal(context.complete, true, JSON.stringify(context.errors));
  const framework = createFrameworkSeeds(context);
  const flow = buildValueFlow(context, {onInvoke: framework.onInvoke, onProperty: framework.onProperty});
  assert.equal(flow.complete, true, JSON.stringify(flow.errors));
  const zones = buildExecutionZones(context, flow, framework);
  return evaluateSemanticRules({context, flow, zones});
}

const detectors = (result, name) => result.findings.filter((finding) => finding.detector === name);

test('Object.create retains inherited state descendants but permits a fresh own property', (t) => {
  const result = fixture(t, {'entry.ts': `
    import {defineApplication} from '@composable-svelte/core/application';
    function inherited(state) { const next = Object.create(state); next.child.value = 1; return [next]; }
    function own(state) { const next = Object.create(state); next.value = 1; return [next]; }
    defineApplication(inherited, {}); defineApplication(own, {});
  `});
  assert.equal(detectors(result, 'state-mutation').length, 1);
});

test('prototype and reflection mutation of reducer state fail closed', (t) => {
  const result = fixture(t, {'entry.ts': `
    import {defineApplication} from '@composable-svelte/core/application';
    function reducer(state) {
      Object.setPrototypeOf(state, {});
      Reflect.set(state, 'value', 1);
      Reflect.deleteProperty(state, 'old');
      return [state];
    }
    defineApplication(reducer, {});
  `});
  assert.equal(detectors(result, 'state-mutation').length, 3);
});

test('map callbacks distinguish retained state children from fresh copies', (t) => {
  const result = fixture(t, {'entry.ts': `
    import {defineApplication} from '@composable-svelte/core/application';
    function retained(state) { const items = state.items.map(item => item); items[0].done = true; return [{...state, items}]; }
    function fresh(state) { const items = state.items.map(item => ({...item})); items[0].done = true; return [{...state, items}]; }
    defineApplication(retained, {});
    defineApplication(fresh, {});
  `});
  assert.equal(detectors(result, 'state-mutation').length, 1);
});

const snippetSource = '<script module>export { row };</script>{#snippet row(item)}{@const unsub = item.subscribe(() => {})}<li>{item.state.name}</li>{/snippet}';
let snippetSupported = true;
try { compile(snippetSource, {filename: 'Rows.svelte'}); } catch { snippetSupported = false; }

test('an imported exported snippet preserves rendered store-parameter authority', {skip: !snippetSupported && 'installed Svelte compiler lacks exported snippets'}, (t) => {
  const result = fixture(t, {
    'Rows.svelte': snippetSource,
    'App.svelte': `<script>
      import {row} from './Rows.svelte';
      import {useApplication} from '@composable-svelte/core/application';
      const app = useApplication({});
    </script>{@render row(app.store)}`
  }, ['App.svelte']);
  assert.deepEqual(result.errors, []);
  assert.equal(detectors(result, 'view-subscribe').length, 1);
});
