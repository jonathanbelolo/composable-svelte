import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

// Template binding patterns (snippet parameters, {#each} items, {:then}/{:catch} values) are declarations whose default
// initializers are never evaluated. Such defaults are refused; ordinary patterns without defaults stay supported.
const PACKAGES = {
  '@composable-svelte/core': {version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}},
  svelte: {version: '5.57.0', exports: {'.': './index.js'}}
};
function analyze(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'template-binding-default-'));
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
  const result = analyzeSemantics({projectRoot: root, graph});
  return {complete: result.complete, errors: result.errors.map((error) => error.construct ?? error.code), findings: result.findings.map((finding) => finding.detector).sort()};
}
const app = (script, template) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${template}\n`});
const resolver = `let fire: any; const p = new Promise(r => { fire = r; });`;
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;

test('defaults in template binding patterns are refused, whatever they carry', (t) => {
  const refused = [
    app(``, `{#snippet s(f: any = window.location)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s()}`),
    app(resolver, `{#snippet s(f: any = fire)}<button onclick={f}>x</button>{/snippet}\n{@render s()}`),
    app(store, `{#snippet s(st: any = store)}<button onclick={() => st.dispatch({type: 'x'})}>x</button>{/snippet}\n{@render s()}`),
    app(``, `{#snippet s({f = window.location}: any)}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/snippet}\n{@render s({})}`),
    app(``, `{#each [{}] as {f = window.location}}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/each}`),
    app(resolver, `{#each [{}] as {f = fire}}<button onclick={f}>x</button>{/each}`),
    app(store, `{#each [[]] as [st = store]}<button onclick={() => (st as any).dispatch({type: 'x'})}>x</button>{/each}`),
    app(`const q = Promise.resolve({});`, `{#await q then {f = window.location}}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/await}`),
    app(`const obj: any = {};`, `{#if true}{@const {f = window.location} = obj}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/if}`),
    app(`const q = Promise.resolve({});`, `{#await q}{:catch {f = window.location}}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/await}`)
  ];
  for (const files of refused) {
    const result = analyze(t, files);
    assert.equal(result.complete, false, files['App.svelte']);
    assert.ok(result.errors.includes('template-binding-default'), `${files['App.svelte']}\n${JSON.stringify(result)}`);
  }
});

test('ordinary template binding patterns without defaults stay supported and keep their findings', (t) => {
  const clean = [
    app(``, `{#snippet s(label: string)}<p>{label}</p>{/snippet}\n{@render s('a')}`),
    app(`const rows = [{id: 1, meta: {n: 2}, x: 1}];`, `{#each rows as {id, meta: {n}, ...rest}, i (id)}<p>{i}{n}{rest.x}</p>{/each}`),
    app(`const rows = [[1, 2]];`, `{#each rows as [a, b]}<p>{a}{b}</p>{/each}`),
    app(`const q = Promise.resolve({n: 1});`, `{#await q then {n}}<p>{n}</p>{:catch error}<p>{String(error)}</p>{/await}`)
  ];
  for (const files of clean) {
    const result = analyze(t, files);
    assert.equal(result.complete, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.findings, []);
  }
  // Values passed explicitly are analyzed: the same authority as an argument is still reported.
  const explicit = analyze(t, app(``, `{#snippet s(f: any)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s(window.location)}`));
  assert.equal(explicit.complete, true, JSON.stringify(explicit.errors));
  assert.ok(explicit.findings.includes('location-write'), JSON.stringify(explicit));
  // Script parameter defaults are ordinary evaluated code and are unaffected.
  const script = analyze(t, app(`function go(f: any = window.location) { f.href = '/x'; }`, `<button onclick={() => go()}>x</button>`));
  assert.equal(script.complete, true, JSON.stringify(script.errors));
  assert.ok(script.findings.includes('location-write'), JSON.stringify(script));
});
