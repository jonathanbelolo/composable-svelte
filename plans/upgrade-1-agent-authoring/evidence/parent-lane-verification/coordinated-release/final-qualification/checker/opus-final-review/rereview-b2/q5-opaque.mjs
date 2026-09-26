import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
run([
  ['O1 each ext array', sv(`import {items} from 'ext';`, `{#each items as it}<p>{String(it)}</p>{/each}`)],
  ['O1s for-of ext array', sv(`import {items} from 'ext';\nconst out: string[] = [];\nfor (const it of items) out.push(String(it));`, `<p>{out.length}</p>`)],
  ['O2 each ext call', sv(`import {list} from 'ext';`, `{#each list() as it}<p>{String(it)}</p>{/each}`)],
  ['O2s for-of ext call', sv(`import {list} from 'ext';\nconst out: string[] = [];\nfor (const it of list()) out.push(String(it));`, `<p>{out.length}</p>`)],
  ['O3 each qSA', sv(``, `{#each document.querySelectorAll('a') as a}<p>{a.href}</p>{/each}`)],
  ['O3s for-of qSA', sv(`const out: string[] = [];\nfor (const a of document.querySelectorAll('a')) out.push(a.href);`, `<p>x</p>`)],
  ['O4 then ext', sv(`import {load} from 'ext';`, `{#await load() then v}<p>{String(v)}</p>{/await}`)],
  ['O4s await ext', sv(`import {load} from 'ext';\nasync function go() { const v = await load(); return String(v); }`, `<button onclick={go}>x</button>`)],
  ['O5 const ext', sv(`import {cfg} from 'ext';`, `{#if true}{@const c = cfg}<p>{String(c.x)}</p>{/if}`)],
  ['O6 each store state', sv(`import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {items: [{n: 1}]}, reducer: (s: any) => [s, Effect.none()]});`, `{#each store.state.items as it}<p>{it.n}</p>{/each}`)],
  ['O7 const store state', sv(`import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {items: [{n: 1}]}, reducer: (s: any) => [s, Effect.none()]});`, `{#if true}{@const state = store.state}{#each state.items as it}<p>{it.n}</p>{/each}{/if}`)],
  ['O8 each $store', sv(`import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {items: [{n: 1}]}, reducer: (s: any) => [s, Effect.none()]});`, `{#each $store.items as it}<p>{it.n}</p>{/each}`)],
]);
