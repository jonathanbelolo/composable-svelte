import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
const src = '../../packages/architecture/src';
const {buildGraph} = await import(`${src}/graph.mjs`);
const {analyzeSemantics} = await import(`${src}/semantics.mjs`);
const L = `(window.location.href = '/x')`;
const cases = {
  each: `{#each [{}] as {a, [${L}]: f}}<p>{f}</p>{/each}`,
  nested: `{#each [{}] as {a: {b: [{[${L}]: f}]}}}<p>{f}</p>{/each}`,
  const: `{#if true}{@const {[${L}]: f} = obj}<p>{f}</p>{/if}`,
  snippet: `{#snippet s(x: number, {[${L}]: f}: any)}<p>{f}</p>{/snippet}\n{@render s(1, {})}`,
  thenShort: `{#await q then {[${L}]: f}}<p>{f}</p>{/await}`,
};
for (const [name, tpl] of Object.entries(cases)) {
  const text = `<script lang="ts">\nconst obj: any = {}; const q = Promise.resolve({});\n</script>\n${tpl}\n`;
  const root = mkdtempSync(join(tmpdir(), 'b1span-'));
  try {
    const files = {'package.json': JSON.stringify({name: 'f', dependencies: {svelte: '5.57.0'}}), 'tsconfig.json': '{}',
      'node_modules/svelte/package.json': JSON.stringify({name: 'svelte', version: '5.57.0', exports: {'.': './index.js'}}), 'App.svelte': text};
    for (const [n, t] of Object.entries(files)) { mkdirSync(dirname(join(root, n)), {recursive: true}); writeFileSync(join(root, n), t); }
    const graph = buildGraph({projectRoot: root, roots: ['App.svelte'], tsconfig: 'tsconfig.json', opaquePackages: [{name: 'svelte', version: '5.57.0', provenance: 'registry'}]});
    const r = analyzeSemantics({projectRoot: root, graph});
    for (const e of r.errors) {
      const slice = text.slice(e.span.start.offset, e.span.end.offset);
      console.log(name.padEnd(10), e.construct, e.path, JSON.stringify(e.span.start), JSON.stringify(e.span.end), JSON.stringify(slice), 'expected', JSON.stringify(`[${L}]`), slice === `[${L}]` ? 'MATCH' : 'MISMATCH');
    }
  } finally { rmSync(root, {recursive: true, force: true}); }
}
