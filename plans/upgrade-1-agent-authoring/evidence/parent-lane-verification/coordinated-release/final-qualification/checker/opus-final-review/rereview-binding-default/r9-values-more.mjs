import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;
run([
  ['Y0 subscribe direct (control)', sv(store, `<p>{String(store.subscribe(() => {}))}</p>`)],
  ['Y1 each item subscribe', sv(store, `{#each [store] as st}<p>{String(st.subscribe(() => {}))}</p>{/each}`)],
  ['Y2 @const subscribe', sv(store, `{#if true}{@const st = store}<p>{String(st.subscribe(() => {}))}</p>{/if}`)],
  ['Y3 each item history', sv(``, `{#each [history] as h}<button onclick={() => h.pushState(null, '', '/x')}>x</button>{/each}`)],
  ['Y4 each item resolver', sv(`let fire: any; const p = new Promise(r => { fire = r; });`, `{#each [fire] as f}<button onclick={f}>x</button>{/each}`)],
]);
