import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

function fixture(t, files, options = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantics-orchestration-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {
      '@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'
    }}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte', version: '5.57.0', exports: {'.': './index.js', './transition': './transition.js'}
    }),
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const roots = options.roots ?? Object.keys(files);
  const graph = buildGraph({projectRoot, roots, tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.57.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph, ...options.analysis});
}

const findingsFor = (result, rule) => result.findings.filter((finding) => finding.rule === rule);

test('a managed Root and Host path completes without findings or limitations', (t) => {
  const result = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot, ApplicationHost} from '@composable-svelte/core/application';
    const options = {initial: {input: 0}, dependencies: {}};
  </script>
  <ApplicationRoot {options}>
    {#snippet children(app)}<ApplicationHost {app} />{/snippet}
  </ApplicationRoot>`});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.limitations, []);
  assert.ok(result.passes >= 1);
});

test('semantic, routing-template, and motion-syntax findings are joined', (t) => {
  const result = fixture(t, {'App.svelte': `<script>
    import {fade} from 'svelte/transition';
    fetch('/module-load');
    function traverse() { history.pushState({}, '', '/next'); }
  </script>
  <svelte:window onpopstate={traverse} />
  <div transition:fade>unsafe</div>`});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.ok(findingsFor(result, 'resources/no-unowned-infrastructure').some((f) => f.detector === 'view-io'));
  assert.ok(findingsFor(result, 'routing/no-manual-browser-authority').some((f) => f.detector === 'traversal-listener'));
  assert.ok(findingsFor(result, 'motion/no-competing-playback').some((f) => f.detector === 'svelte-motion-import'));
  assert.ok(findingsFor(result, 'motion/no-competing-playback').some((f) => f.detector === 'transition-directive'));
});

test('only a rendered snippet activates view subscription analysis', (t) => {
  const source = (render) => `<script>
    import {useApplication} from '@composable-svelte/core/application';
    const app = useApplication({});
  </script>
  {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}
  ${render ? '{@render row(app.store)}' : ''}`;
  const inert = fixture(t, {'App.svelte': source(false)});
  assert.equal(inert.complete, true, JSON.stringify(inert.errors));
  assert.equal(findingsFor(inert, 'presentation/no-subscription-orchestration').length, 0);
  const invoked = fixture(t, {'App.svelte': source(true)});
  assert.equal(invoked.complete, true, JSON.stringify(invoked.errors));
  assert.equal(findingsFor(invoked, 'presentation/no-subscription-orchestration')
    .filter((finding) => finding.detector === 'view-subscribe').length, 1);
});

test('native event callback sites attribute deferred work to the view zone', (t) => {
  const result = fixture(t, {'App.svelte': `<script>
    function load() { fetch('/on-click'); }
  </script><button onclick={load}>Load</button>`});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.equal(findingsFor(result, 'resources/no-unowned-infrastructure')
    .filter((finding) => finding.detector === 'view-io').length, 1);
});

test('one helper keeps distinct execution attribution from two entrypoints', (t) => {
  const result = fixture(t, {
    'shared.ts': `export function load() { fetch('/shared'); }`,
    'A.svelte': `<script>import {load} from './shared';</script><button onclick={load}>A</button>`,
    'B.svelte': `<script>import {load} from './shared';</script><button onclick={load}>B</button>`
  }, {roots: ['A.svelte', 'B.svelte']});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  const findings = findingsFor(result, 'resources/no-unowned-infrastructure')
    .filter((finding) => finding.detector === 'view-io' && finding.path === 'shared.ts');
  assert.deepEqual(findings.map((finding) => finding.entryPath), ['A.svelte', 'B.svelte']);
});

test('type-derived reducer authority reaches framework zones across passes', (t) => {
  const result = fixture(t, {'entry.ts': `
    import type {Reducer} from '@composable-svelte/core';
    type State = {count: number}; type Action = {type: 'increment'};
    const reducer: Reducer<State, Action> = (state) => {
      state.count++;
      return [state];
    };
    export {reducer};
  `});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.ok(findingsFor(result, 'reducers/pure-decisions')
    .some((finding) => finding.detector === 'state-mutation'));
  assert.ok(result.passes > 1, 'type and framework seeds required another orchestration pass');
});

test('the orchestration bound fails closed instead of returning a partial result', (t) => {
  const result = fixture(t, {'entry.ts': `
    import type {Reducer} from '@composable-svelte/core';
    const reducer: Reducer<{count:number}, {type:'increment'}> = (state) => [state];
    export {reducer};
  `}, {analysis: {maxPasses: 1}});
  assert.equal(result.complete, false);
  assert.equal(result.converged, false);
  assert.ok(result.errors.some((error) => error.construct === 'semantic-orchestration'));
});

test('template limitations remain explicit analysis errors', (t) => {
  const result = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    const props = {options: {dependencies: {}}};
  </script><ApplicationRoot {...props}/>`});
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((error) => error.construct === 'unsupported-framework-prop-spread'));
});

test('an incomplete graph is refused before semantic helpers run', (t) => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantics-incomplete-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const result = analyzeSemantics({projectRoot, graph: {complete: false, modules: [], errors: []}});
  assert.equal(result.complete, false);
  assert.equal(result.passes, 0);
  assert.ok(result.errors.some((error) => error.construct === 'graph'));
});
