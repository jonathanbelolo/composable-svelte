import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const W = `<button onclick={() => { (f as any).href = '/x'; }}>x</button>`;
run([
  ['X0 script for-of control', sv(`const rows: any[] = [window.location];\nfunction go() { for (const f of rows) f.href = '/x'; }`, `<button onclick={go}>x</button>`)],
  ['X0b script destr control', sv(`const rows: any[] = [{f: window.location}];\nfunction go() { for (const {f} of rows) f.href = '/x'; }`, `<button onclick={go}>x</button>`)],
  ['X1 each item no default', sv(`const rows: any[] = [window.location];`, `{#each rows as f}${W}{/each}`)],
  ['X2 each destr no default', sv(`const rows: any[] = [{f: window.location}];`, `{#each rows as {f}}${W}{/each}`)],
  ['X3 then value no default', sv(`const q = Promise.resolve(window.location);`, `{#await q then f}${W}{/await}`)],
  ['X4 @const no default', sv(``, `{#if true}{@const f = window.location}${W}{/if}`)],
  ['X5 snippet arg (control)', sv(``, `{#snippet s(f: any)}${W}{/snippet}\n{@render s(window.location)}`)],
]);
