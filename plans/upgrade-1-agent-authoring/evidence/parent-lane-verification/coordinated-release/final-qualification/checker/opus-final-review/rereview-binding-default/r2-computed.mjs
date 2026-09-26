import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const fire = `let fire: any; const p = new Promise(r => { fire = r; });`;
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;
run([
  ['K1 each computed location write', sv(``, `{#each [{}] as {[(window.location.href = '/x')]: f}}<p>{f}</p>{/each}`)],
  ['K1r each computed resolver call', sv(fire, `{#each [{}] as {[fire(1)]: f}}<p>{f}</p>{/each}`)],
  ['K1d each computed dispatch', sv(store, `{#each [{}] as {[store.dispatch({type: 'x'}) as any]: f}}<p>{f}</p>{/each}`)],
  ['K3 @const computed location write', sv(`const obj: any = {};`, `{#if true}{@const {[(window.location.href = '/x')]: f} = obj}<p>{f}</p>{/if}`)],
  ['K3r @const computed resolver', sv(`${fire}\nconst obj: any = {};`, `{#if true}{@const {[fire(1)]: f} = obj}<p>{f}</p>{/if}`)],
  ['K4 then computed location write', sv(`const q = Promise.resolve({});`, `{#await q then {[(window.location.href = '/x')]: f}}<p>{f}</p>{/await}`)],
  ['K5 catch computed', sv(`const q = Promise.resolve({});`, `{#await q}{:catch {[(window.location.href = '/x')]: f}}<p>{f}</p>{/await}`)],
  ['K2 snippet computed location', sv(``, `{#snippet s({[(window.location.href = '/x')]: f}: any)}<p>{f}</p>{/snippet}\n{@render s({})}`)],
  ['K2r snippet computed resolver', sv(fire, `{#snippet s({[fire(1)]: f}: any)}<p>{f}</p>{/snippet}\n{@render s({})}`)],
  ['K2n snippet computed, no render', sv(``, `{#snippet s({[(window.location.href = '/x')]: f}: any)}<p>{f}</p>{/snippet}`)],
  ['R0 script resolver call (control)', sv(fire, `<button onclick={() => fire(1)}>x</button>`)],
  ['R0e each key resolver (control)', sv(fire, `{#each [{}] as f (fire(1))}<p>{f}</p>{/each}`)],
]);
