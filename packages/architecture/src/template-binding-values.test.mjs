import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';

// `{#each xs as p}`, `{@const p = v}` and `{:then p}` bind values exactly like their script forms (`for (const p of xs)`,
// `const p = v`, `const p = await promise`). Catch values stay unmodeled, like script catch bindings.
const PACKAGES = {
  '@composable-svelte/core': {version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}},
  svelte: {version: '5.57.0', exports: {'.': './index.js'}}
};
function project(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'template-binding-values-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: Object.fromEntries(Object.entries(PACKAGES).map(([name, {version}]) => [name, version]))}),
    'tsconfig.json': '{}',
    ...Object.fromEntries(Object.entries(PACKAGES).map(([name, {version, exports}]) => [`node_modules/${name}/package.json`, JSON.stringify({name, version, exports})])),
    ...files
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, name)), {recursive: true});
    writeFileSync(join(root, name), text);
  }
  const graph = buildGraph({projectRoot: root, roots: [Object.keys(files)[0]], tsconfig: 'tsconfig.json',
    opaquePackages: Object.entries(PACKAGES).map(([name, {version}]) => ({name, version, provenance: 'registry'}))});
  assert.deepEqual(graph.errors, []);
  return {root, graph};
}
function analyze(t, files) {
  const {root, graph} = project(t, files);
  const result = analyzeSemantics({projectRoot: root, graph});
  return {complete: result.complete, errors: result.errors.map((error) => error.construct ?? error.code), findings: result.findings.map((finding) => finding.detector).sort()};
}
const app = (script, template) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${template}\n`});
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;
const write = `<button onclick={() => { (f as any).href = '/x'; }}>x</button>`;
const back = `<button onclick={() => { (h as any).pushState({}, '', '/x'); }}>x</button>`;

function assertParity(t, scriptForm, templateForm, detector) {
  const control = analyze(t, scriptForm);
  assert.equal(control.complete, true, JSON.stringify(control.errors));
  assert.ok(control.findings.includes(detector), `script control must report ${detector}: ${JSON.stringify(control)}`);
  const result = analyze(t, templateForm);
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.ok(result.findings.includes(detector), `template form must report ${detector}: ${JSON.stringify(result)}`);
}

test('{#each} items carry authority exactly like script for-of bindings', (t) => {
  assertParity(t, app(`const rows: any[] = [window.location];\nfunction go() { for (const f of rows) f.href = '/x'; }`, `<button onclick={go}>x</button>`),
    app(`const rows: any[] = [window.location];`, `{#each rows as f}${write}{/each}`), 'location-write');
  assertParity(t, app(`const rows: any[] = [{f: window.location}];\nfunction go() { for (const {f} of rows) f.href = '/x'; }`, `<button onclick={go}>x</button>`),
    app(`const rows: any[] = [{f: window.location}];`, `{#each rows as {f}, i (i)}${write}{/each}`), 'location-write');
  assertParity(t, app(`const rows: any[] = [history];\nfunction go() { for (const h of rows) h.pushState({}, '', '/x'); }`, `<button onclick={go}>x</button>`),
    app(`const rows: any[] = [history];`, `{#each rows as h}${back}{/each}`), 'history-write');
  assertParity(t, app(`${store}\nconst rows: any[] = [store];\nfor (const st of rows) st.subscribe(() => {});`, `<p>x</p>`),
    app(`${store}\nconst rows: any[] = [store];`, `{#each rows as st}<p>{String(st.subscribe(() => {}))}</p>{/each}`), 'view-subscribe');
});

test('{@const} and {:then} values carry authority exactly like const and await bindings', (t) => {
  assertParity(t, app(`function go() { const f: any = window.location; f.href = '/x'; }`, `<button onclick={go}>x</button>`),
    app(``, `{#if true}{@const f = window.location}${write}{/if}`), 'location-write');
  assertParity(t, app(`${store}\nconst st = store;\nst.subscribe(() => {});`, `<p>x</p>`),
    app(store, `{#if true}{@const st = store}<p>{String(st.subscribe(() => {}))}</p>{/if}`), 'view-subscribe');
  assertParity(t, app(`async function load(): Promise<any> { return window.location; }\nasync function go() { const f = await load(); f.href = '/x'; }`, `<button onclick={go}>x</button>`),
    app(`async function load(): Promise<any> { return window.location; }`, `{#await load() then f}${write}{/await}`), 'location-write');
  assertParity(t, app(`async function load(): Promise<any> { return {h: history}; }\nasync function go() { const {h} = await load(); h.pushState({}, '', '/x'); }`, `<button onclick={go}>x</button>`),
    app(`async function load(): Promise<any> { return {h: history}; }`, `{#await load() then {h}}${back}{/await}`), 'history-write');
});

test('nested {#each} and chained {@const} bindings converge', (t) => {
  const nested = analyze(t, app(`const rows: any[] = [{xs: [{ys: [window.location]}]}];`,
    `{#each rows as r}{#each r.xs as x}{#each x.ys as f}${write}{/each}{/each}{/each}`));
  assert.equal(nested.complete, true, JSON.stringify(nested.errors));
  assert.ok(nested.findings.includes('location-write'), JSON.stringify(nested));
  const chained = analyze(t, app(`const o: any = {a: {b: {l: window.location}}};`,
    `{#if true}{@const a = o.a}{@const b = a.b}{#each [b] as item}{@const f = item.l}${write}{/each}{/if}`));
  assert.equal(chained.complete, true, JSON.stringify(chained.errors));
  assert.ok(chained.findings.includes('location-write'), JSON.stringify(chained));
});

test('ordinary data bindings stay supported and clean; resolvers and catch values keep their existing treatment', (t) => {
  for (const files of [
    app(`const rows = [{id: 1, n: 'a', meta: {k: 2}}];`, `{#each rows as {id, n, meta: {k}}, i (id)}<p>{i}{n}{k}</p>{/each}`),
    app(`let s = $state({items: [{n: 1}]});`, `{#each s.items as it}<p>{it.n}</p>{/each}\n{#each s.items}<p>x</p>{/each}`),
    app(`const o = {a: {b: 1}};`, `{#if true}{@const {a} = o}{@const b = a.b}<p>{b}</p>{/if}`),
    app(`async function load() { return {n: 1}; }`, `{#await load() then {n}}<p>{n}</p>{:catch error}<p>{String(error)}</p>{/await}`)
  ]) {
    const result = analyze(t, files);
    assert.equal(result.complete, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.findings, []);
  }
  // A Promise resolver bound by {#each} still cannot reach a template.
  const resolver = analyze(t, app(`let fire: any; const p = new Promise(r => { fire = r; }); const rows: any[] = [fire];`, `{#each rows as f}<button onclick={f}>x</button>{/each}`));
  assert.equal(resolver.complete, false);
  assert.ok(resolver.errors.includes('promise-settle-escape'), JSON.stringify(resolver));
  // Documented limitation, unchanged: values reaching a catch binding are not modeled, in script and in {:catch}.
  const script = analyze(t, app(`function go() { try { throw window.location; } catch (e: any) { e.href = '/x'; } }`, `<button onclick={go}>x</button>`));
  const template = analyze(t, app(`async function load(): Promise<any> { throw window.location; }`, `{#await load() catch e}<button onclick={() => { (e as any).href = '/x'; }}>x</button>{/await}`));
  assert.deepEqual([script.complete, script.findings], [true, []]);
  assert.deepEqual([template.complete, template.findings], [true, []]);
});

test('a template binding whose source value cannot be correlated is refused, not skipped', (t) => {
  const {root, graph} = project(t, app(`const rows: any[] = [window.location];`, `{#each rows as f}${write}{/each}\n{#if true}{@const g = rows}<p>{g.length}</p>{/if}`));
  const context = buildSemanticContext({projectRoot: root, graph});
  const module = context.modules.find((candidate) => candidate.path.endsWith('App.svelte'));
  const each = module.markers.find((marker) => marker.kind === 'each-block');
  // Drop the unit holding the each expression, as if the parser had not produced it.
  module.units.splice(module.units.findIndex((unit) => unit.kind === 'template' && unit.start === each.expression.start && unit.end === each.expression.end), 1);
  const flow = buildValueFlow(context);
  assert.equal(flow.complete, false);
  assert.ok(flow.errors.some((error) => error.construct === 'template-binding-correlation'), JSON.stringify(flow.errors));
  // Correlation is exact: a unit that merely contains the pattern is not accepted either.
  const other = project(t, app(`const rows: any[] = [window.location];`, `{#each rows as f}${write}{/each}`));
  const widened = buildSemanticContext({projectRoot: other.root, graph: other.graph});
  const widenedModule = widened.modules.find((candidate) => candidate.path.endsWith('App.svelte'));
  const widenedEach = widenedModule.markers.find((marker) => marker.kind === 'each-block');
  const binding = widenedModule.units.find((unit) => unit.kind === 'binding' && unit.start === widenedEach.context.start && unit.end === widenedEach.context.end);
  binding.start -= 1;
  const widenedFlow = buildValueFlow(widened);
  assert.equal(widenedFlow.complete, false);
  assert.ok(widenedFlow.errors.some((error) => error.construct === 'template-binding-correlation'), JSON.stringify(widenedFlow.errors));
});
