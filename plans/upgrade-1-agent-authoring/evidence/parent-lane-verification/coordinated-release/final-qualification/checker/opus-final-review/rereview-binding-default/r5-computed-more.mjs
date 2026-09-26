import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;
run([
  ['H0 control history in expr', sv(``, `<p>{history.pushState(null, '', '/x')}</p>`)],
  ['H1 each computed history', sv(``, `{#each [{}] as {[String(history.pushState(null, '', '/x'))]: f}}<p>{f}</p>{/each}`)],
  ['H2 @const computed history', sv(`const o: any = {};`, `{#if true}{@const {[String(history.pushState(null, '', '/x'))]: f} = o}<p>{f}</p>{/if}`)],
  ['V0 control subscribe in expr', sv(store, `<p>{String(store.subscribe(() => {}))}</p>`)],
  ['V1 each computed subscribe', sv(store, `{#each [{}] as {[String(store.subscribe(() => {}))]: f}}<p>{f}</p>{/each}`)],
  ['V2 then computed subscribe', sv(`${store}\nconst q = Promise.resolve({});`, `{#await q then {[String(store.subscribe(() => {}))]: f}}<p>{f}</p>{/await}`)],
]);
