import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const H = `<button onclick={() => { (h as any).pushState({}, '', '/x'); }}>x</button>`;
run([
  ['A1s await Promise.resolve', sv(`async function go() { const h = await Promise.resolve(history); (h as any).pushState({}, '', '/x'); }`, `<button onclick={go}>x</button>`)],
  ['A1t then Promise.resolve', sv(``, `{#await Promise.resolve(history) then h}${H}{/await}`)],
  ['A2s await new Promise', sv(`const p = new Promise<any>((r) => { r(history); });\nasync function go() { const h = await p; (h as any).pushState({}, '', '/x'); }`, `<button onclick={go}>x</button>`)],
  ['A2t then new Promise', sv(`const p = new Promise<any>((r) => { r(history); });`, `{#await p then h}${H}{/await}`)],
  ['A3t await in const', sv(`async function load(): Promise<any> { return history; }`, `{#if true}{@const h = await load()}${H}{/if}`)],
  ['A4t each await expr', sv(`async function load(): Promise<any> { return [history]; }`, `{#each await load() as h}${H}{/each}`)],
]);
