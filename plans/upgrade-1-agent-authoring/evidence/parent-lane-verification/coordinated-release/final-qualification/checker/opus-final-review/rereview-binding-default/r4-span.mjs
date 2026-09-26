import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os'; import {dirname, join} from 'node:path';
const {buildGraph} = await import('../../packages/architecture/src/graph.mjs');
const {analyzeSemantics} = await import('../../packages/architecture/src/semantics.mjs');
const P = {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'};
function go(src) {
  const root = mkdtempSync(join(tmpdir(), 'span-'));
  const files = {'package.json': JSON.stringify({name: 'f', dependencies: P}), 'tsconfig.json': '{}', 'App.svelte': src,
    ...Object.fromEntries(Object.entries(P).map(([n, v]) => [`node_modules/${n}/package.json`, JSON.stringify({name: n, version: v, exports: {'.': './index.js'}})]))};
  for (const [n, t] of Object.entries(files)) { mkdirSync(dirname(join(root, n)), {recursive: true}); writeFileSync(join(root, n), t); }
  const graph = buildGraph({projectRoot: root, roots: ['App.svelte'], tsconfig: 'tsconfig.json', opaquePackages: Object.entries(P).map(([name, version]) => ({name, version, provenance: 'registry'}))});
  const r = analyzeSemantics({projectRoot: root, graph});
  rmSync(root, {recursive: true, force: true});
  const lines = src.split('\n');
  for (const e of r.errors) {
    const {start, end} = e.span; const text = start.line === end.line ? lines[start.line - 1].slice(start.column - (start.column > 0 && e.span.start.column !== undefined ? 0 : 0), end.column) : '(multi)';
    console.log(JSON.stringify({construct: e.construct, path: e.path, span: e.span}), '=>', JSON.stringify(src.slice(start.offset, end.offset)));
  }
  console.log('complete', r.complete, 'findings', r.findings.map(f => f.detector));
}
go(`<script lang="ts">\nconst q = Promise.resolve({});\n</script>\n\n  {#snippet s(a: number,\n     f: any = window.location)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s(1)}\n{#each [{}] as {a: [g = window.location] = []}}<p>{g}</p>{/each}\n<button onclick={() => { window.location.href = '/y'; }}>y</button>\n`);
console.log('--- control: unrelated refusal (each without context) + direct write');
go(`<script lang="ts">\nconst rows = [1];\n</script>\n{#each rows, i}<p>{i}</p>{/each}\n<button onclick={() => { window.location.href = '/y'; }}>y</button>\n`);
console.log('--- control: only direct write');
go(`<script lang="ts">\n</script>\n<button onclick={() => { window.location.href = '/y'; }}>y</button>\n`);
