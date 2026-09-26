import {run} from '../probes/harness.mjs';
const sv = (script, tpl, extra = {}) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`, ...extra});
const svjs = (script, tpl) => ({'App.svelte': `<script>\n${script}\n</script>\n${tpl}\n`});
const W = `<button onclick={() => { (f as any).href = '/x'; }}>x</button>`;
const Wjs = `<button onclick={() => { f.href = '/x'; }}>x</button>`;
run([
  ['S1 snippet plain default JS', svjs(``, `{#snippet s(f = window.location)}${Wjs}{/snippet}\n{@render s()}`)],
  ['S2 snippet 2nd param default', sv(``, `{#snippet s(a: number, f: any = window.location)}${W}{/snippet}\n{@render s(1)}`)],
  ['S3 snippet array destr default', sv(``, `{#snippet s([f = window.location]: any[])}${W}{/snippet}\n{@render s([])}`)],
  ['S4 snippet nested default', sv(``, `{#snippet s({a: {f = window.location}}: any)}${W}{/snippet}\n{@render s({a:{}})}`)],
  ['S5 snippet renamed default', sv(``, `{#snippet s({g: f = window.location}: any)}${W}{/snippet}\n{@render s({})}`)],
  ['S6 snippet rest nested default', sv(``, `{#snippet s([...[f = window.location]]: any[])}${W}{/snippet}\n{@render s([])}`)],
  ['S7 snippet complex type', sv(``, `{#snippet s(f: {href: string} | Record<string, (x: number) => void> = window.location as any)}${W}{/snippet}\n{@render s()}`)],
  ['E1 each ident default?', sv(``, `{#each [undefined] as f = window.location}${W}{/each}`)],
  ['E2 each array default', sv(``, `{#each [[]] as [f = window.location]}${W}{/each}`)],
  ['E3 each nested default', sv(``, `{#each [{a:{}}] as {a: [f = window.location] = []}}${W}{/each}`)],
  ['E4 each renamed default', sv(``, `{#each [{}] as {g: f = window.location}}${W}{/each}`)],
  ['E5 each default + index + key', sv(``, `{#each [{}] as {f = window.location}, i (i)}${W}{/each}`)],
  ['E6 each object index?', sv(``, `{#each [{}] as item, {f = window.location}}${W}{/each}`)],
  ['E7 each JS default', svjs(``, `{#each [{}] as {f = window.location}}${Wjs}{/each}`)],
  ['A1 then ident default?', sv(`const q = Promise.resolve(undefined);`, `{#await q then f = window.location}${W}{/await}`)],
  ['A2 then array default', sv(`const q = Promise.resolve([]);`, `{#await q then [f = window.location]}${W}{/await}`)],
  ['A3 short then default', sv(`const q = Promise.resolve({});`, `{#await q then {f = window.location}}${W}{:catch {g = window.location}}<p/>{/await}`)],
  ['A4 short catch default', sv(`const q = Promise.resolve({});`, `{#await q catch {f = window.location}}${W}{/await}`)],
  ['C1 @const destr default', sv(`const obj: any = {};`, `{#if true}{@const {f = window.location} = obj}${W}{/if}`)],
  ['C2 @const array default', sv(`const obj: any = [];`, `{#if true}{@const [f = window.location] = obj}${W}{/if}`)],
  ['C3 @const plain (evaluated)', sv(``, `{#if true}{@const f = window.location}${W}{/if}`)],
  ['C4 @const typed', sv(`const obj: any = {};`, `{#if true}{@const {f}: any = obj}${W}{/if}`)],
  ['K1 computed key each', sv(`const obj: any = {};`, `{#each [{}] as {[(window.location.href = '/x')]: f}}<p>{f}</p>{/each}`)],
  ['K2 computed key snippet', sv(``, `{#snippet s({[(window.location.href = '/x')]: f}: any)}<p>{f}</p>{/snippet}\n{@render s({})}`)],
  ['K3 computed key @const', sv(`const obj: any = {};`, `{#if true}{@const {[(window.location.href = '/x')]: f} = obj}<p>{f}</p>{/if}`)],
  ['K0 baseline expr write', sv(``, `<p>{(window.location.href = '/x')}</p>`)],
]);
