import {run} from '../probes/harness.mjs';
const S = `let fire: any; const p = new Promise(r => { fire = r; });`;
const svelte = (tpl) => ({'App.svelte': `<script lang="ts">\n${S}\n</script>\n${tpl}\n`});
run([
  ['D1 snippet param default', svelte(`{#snippet s(f: any = fire)}<button onclick={f}>x</button>{/snippet}\n{@render s()}`)],
  ['D2 each destructure default', svelte(`{#each [{}] as {f = fire}}<button onclick={f}>x</button>{/each}`)],
  ['D3 await then value', svelte(`{#await Promise.resolve(1) then v}<button onclick={v}>x</button>{/await}`)],
]);
