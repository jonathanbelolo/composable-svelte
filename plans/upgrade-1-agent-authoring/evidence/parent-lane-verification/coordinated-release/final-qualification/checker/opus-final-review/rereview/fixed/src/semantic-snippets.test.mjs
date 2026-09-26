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
import {createTemplateSeeds} from './template-seeds.mjs';
import {buildExecutionZones} from './semantic-zones.mjs';
import {evaluateSemanticRules} from './rules/semantic-rules.mjs';

function fixture(t, files, roots = ['App.svelte']) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-snippets-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({dependencies: {
      '@composable-svelte/core': '0.13.0-next.1',
      svelte: '5.57.0'
    }}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte', version: '5.57.0', exports: {'.': './index.js'}
    }),
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const graph = buildGraph({projectRoot, roots, tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.57.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  const framework = createFrameworkSeeds(context);
  let template;
  const flow = buildValueFlow(context, {
    onInvoke: (call, api) => api.domain.join(framework.onInvoke(call, api), template?.onInvoke(call, api) ?? api.domain.empty()),
    onProperty: framework.onProperty
  });
  template = createTemplateSeeds(context, flow);
  let converged = false;
  for (let pass = 0; pass < 32; pass++) {
    const previous = flow.revision;
    template.apply();
    flow.solve();
    if (flow.revision === previous) { converged = true; break; }
  }
  assert.equal(converged, true, 'snippet/template dataflow converges');
  assert.deepEqual(template.errors, []);
  const zones = buildExecutionZones(context, flow, framework, {
    wiringSites: template.wiringSites,
    callbackSites: template.callbackSites,
    lifecycleSites: template.lifecycleSites
  });
  const result = evaluateSemanticRules({context, flow, zones});
  const findings = (detector) => result.findings.filter((finding) => finding.detector === detector);
  const named = (name) => [...context.functions.values()].find((record) => record.node.name?.text === name);
  const zoneNames = (name) => new Set(zones.values.get(named(name)?.id)?.keys() ?? []);
  return {context, flow, zones, result, findings, named, zoneNames};
}

const appScript = (extra = '') => `<script>
  import {useApplication} from '@composable-svelte/core/application';
  const app = useApplication({});
  ${extra}
</script>`;

test('an unused snippet body is inert', (t) => {
  const f = fixture(t, {'App.svelte': `${appScript()}
    {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}`});
  assert.deepEqual(f.result.errors, []);
  assert.equal(f.findings('view-subscribe').length, 0);
});

test('a nested snippet activates only through a rendered outer snippet', (t) => {
  const source = (render) => `${appScript()}
    {#snippet inner(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}
    {#snippet outer(store)}{@render inner(store)}{/snippet}
    ${render ? '{@render outer(app.store)}' : ''}`;
  const inert = fixture(t, {'App.svelte': source(false)});
  assert.deepEqual(inert.result.errors, []);
  assert.equal(inert.findings('view-subscribe').length, 0);
  const active = fixture(t, {'App.svelte': source(true)});
  assert.deepEqual(active.result.errors, []);
  assert.equal(active.findings('view-subscribe').length, 1);
});

test('a rendered snippet transfers directly invoked callback parameters into the view zone', (t) => {
  const f = fixture(t, {'App.svelte': `${appScript("function handleRow() { document.title = 'row'; }")}
    {#snippet row(callback)}{@const result = callback()}{result}{/snippet}
    {@render row(handleRow)}`});
  assert.deepEqual(f.result.errors, []);
  assert.deepEqual(f.zoneNames('handleRow'), new Set(['view']));
});

test('a rendered snippet transfers event callback parameters through explicit callback sites', (t) => {
  const f = fixture(t, {'App.svelte': `${appScript("function handleRow() { document.title = 'row'; }")}
    {#snippet row(callback)}<button onclick={callback}>Row</button>{/snippet}
    {@render row(handleRow)}`});
  assert.deepEqual(f.result.errors, []);
  assert.deepEqual(f.zoneNames('handleRow'), new Set(['view']));
});

test('destructured snippet parameters retain rendered store authority', (t) => {
  const f = fixture(t, {'App.svelte': `${appScript()}
    {#snippet row({store})}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}
    {@render row({store: app.store})}`});
  assert.deepEqual(f.result.errors, []);
  assert.equal(f.findings('view-subscribe').length, 1);
});

test('forward local and imported aliases resolve only at render sites', (t) => {
  const local = fixture(t, {'App.svelte': `${appScript()}
    {@render alias(app.store)}
    {#snippet alias(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}`});
  assert.deepEqual(local.result.errors, []);
  assert.equal(local.findings('view-subscribe').length, 1);

  const imported = fixture(t, {
    'Rows.svelte': `<script module>export { row as renderedRow };</script>
      {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}`,
    'App.svelte': `${appScript("import {renderedRow as alias} from './Rows.svelte';")}
      {@render alias(app.store)}`
  });
  assert.deepEqual(imported.result.errors, []);
  assert.equal(imported.findings('view-subscribe').length, 1);
});

test('ordinary calls of snippets fail explicitly instead of executing them', (t) => {
  const f = fixture(t, {'App.svelte': `${appScript()}
    {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}
    {row(app.store)}`});
  assert.equal(f.flow.complete, false);
  assert.ok(f.flow.errors.some((error) => error.construct === 'snippet-outside-render'));
});

test('a mere snippet reference does not execute its body', (t) => {
  const source = `${appScript()}
    {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}
    {row}`;
  assert.doesNotThrow(() => compile(source, {filename: 'App.svelte'}));
  const f = fixture(t, {'App.svelte': source});
  assert.deepEqual(f.result.errors, []);
  assert.equal(f.findings('view-subscribe').length, 0);
});

test('a standalone function-expression statement does not execute its body', (t) => {
  const source = `${appScript("(function inertReference() { app.store.subscribe(() => {}); });")}`;
  assert.doesNotThrow(() => compile(source, {filename: 'App.svelte'}));
  const f = fixture(t, {'App.svelte': source});
  assert.deepEqual(f.result.errors, []);
  assert.equal(f.findings('view-subscribe').length, 0);
  assert.deepEqual(f.zoneNames('inertReference'), new Set());
});
