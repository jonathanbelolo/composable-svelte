import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;
run([
  ['L0 script alias write', sv(`const f: any = window.location;`, `<button onclick={() => { f.href = '/x'; }}>x</button>`)],
  ['L1 @const alias write', sv(``, `{#if true}{@const f: any = window.location}<button onclick={() => { f.href = '/x'; }}>x</button>{/if}`)],
  ['L2 @const alias history', sv(``, `{#if true}{@const h = history}<button onclick={() => h.pushState(null, '', '/x')}>x</button>{/if}`)],
  ['L3 @const alias subscribe', sv(store, `{#if true}{@const st = store}<p>{String(st.subscribe(() => {}))}</p>{/if}`)],
  ['L4 each item alias write', sv(``, `{#each [window.location] as f}<button onclick={() => { f.href = '/x'; }}>x</button>{/each}`)],
]);
