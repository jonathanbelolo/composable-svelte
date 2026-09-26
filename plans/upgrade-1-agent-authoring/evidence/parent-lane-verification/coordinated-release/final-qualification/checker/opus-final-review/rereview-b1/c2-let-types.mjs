import {run} from '../probes/harness.mjs';
const sv = (script, tpl, lang = 'ts', extra = {}) => ({'App.svelte': `<script lang="${lang}">\n${script}\n</script>\n${tpl}\n`, ...extra});
const L = `(window.location.href = '/x')`;
const child = {'Child.svelte': `<script>export let item = {};</script>\n<slot {item} />\n`};
run([
  ['D1 let: obj computed', sv(`import Child from './Child.svelte';`, `<Child let:item={{[${L}]: f}}><p>{f}</p></Child>`, 'ts', child)],
  ['D2 let: nested computed', sv(`import Child from './Child.svelte';`, `<Child let:item={{a: {[${L}]: f}}}><p>{f}</p></Child>`, 'ts', child)],
  ['D3 let: plain obj (clean)', sv(`import Child from './Child.svelte';`, `<Child let:item={{a}}><p>{a}</p></Child>`, 'ts', child)],
  ['D4 let: member target', sv(`import Child from './Child.svelte'; const o: any = {};`, `<Child let:item={{a: o.b}}><p>x</p></Child>`, 'ts', child)],
  // No false refusals: computed names in types
  ['N1 type literal arbitrary expr', sv(``, `{#snippet s(x: {[${L}]: number})}<p>{x}</p>{/snippet}\n{@render s({} as any)}`)],
  ['N2 mapped type', sv(``, `{#snippet s(x: {[K in 'a' | 'b']: number})}<p>{x.a}</p>{/snippet}\n{@render s({a: 1, b: 2})}`)],
  ['N3 index signature', sv(``, `{#snippet s(x: {[k: string]: number})}<p>{x.a}</p>{/snippet}\n{@render s({a: 1})}`)],
  ['N4 pattern typed with computed type', sv(``, `{#snippet s({a}: {[Symbol.iterator]: any; ['a']: number})}<p>{a}</p>{/snippet}\n{@render s({a: 1} as any)}`)],
  ['N5 method signature computed', sv(``, `{#snippet s(x: {[Symbol.iterator](): any})}<p>{x}</p>{/snippet}\n{@render s({} as any)}`)],
  ['N6 literal num key', sv(`const rows = [{0: 1}];`, `{#each rows as {0: v}}<p>{v}</p>{/each}`)],
  ['N7 literal str key @const', sv(`const o = {'a-b': 1};`, `{#if true}{@const {'a-b': v} = o}<p>{v}</p>{/if}`)],
  ['N8 nested plain', sv(`const rows = [{a: {b: [1]}}];`, `{#each rows as {a: {b: [c]}}, i (i)}<p>{c}</p>{/each}`)],
  ['N9 each typed context?', sv(`const rows = [{a: 1}];`, `{#each rows as {a}: {[k: string]: number}}<p>{a}</p>{/each}`)],
  ['N10 then plain', sv(`const q = Promise.resolve({a: 1});`, `{#await q then {a: b}}<p>{b}</p>{/await}`)],
  ['N11 computed name in script (control)', sv(`const k = 'a'; const {[k]: v} = {a: 1} as any;`, `<p>{v}</p>`)],
]);
