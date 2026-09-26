import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const W = (v) => `<button onclick={() => { (${v} as any).href = '/x'; }}>x</button>`;
const N = 60;
// nested each depth N: rows = [[[...[location]...]]]
const nest = (d) => d === 0 ? 'window.location' : `[${nest(d - 1)}]`;
let open = '', close = '';
for (let i = 0; i < N; i++) { open += `{#each ${i ? 'x' + (i - 1) : 'rows'} as x${i}}`; close += '{/each}'; }
// const chain N
let consts = `{@const c0 = o}`; for (let i = 1; i < N; i++) consts += `{@const c${i} = c${i - 1}}`;
// const chain through distinct functions
let fns = ''; let fconsts = `{@const d0 = o}`;
for (let i = 1; i < N; i++) { fns += `function f${i}(x: any) { return x; }\n`; fconsts += `{@const d${i} = f${i}(d${i - 1})}`; }
let sfns = ''; let sconsts = `const d0: any = o;\n`;
for (let i = 1; i < N; i++) { sfns += `function f${i}(x: any) { return x; }\n`; sconsts += `const d${i} = f${i}(d${i - 1});\n`; }
// alternate each / then / const chain
let alt = `{#await load() then t0}`, altClose = `{/await}`;
for (let i = 1; i < 20; i++) { alt += `{#each [t${i - 1}] as e${i}}{@const k${i} = e${i}}{#await Promise.resolve(k${i}) then t${i}}`; altClose = `{/await}{/each}` + altClose; }
run([
  [`nested each depth ${N}`, sv(`const rows: any[] = ${nest(N)};`, `${open}${W(`x${N - 1}`)}${close}`)],
  [`const chain ${N}`, sv(`const o: any = window.location;`, `{#if true}${consts}${W(`c${N - 1}`)}{/if}`)],
  [`const via fns ${N}`, sv(`const o: any = window.location;\n${fns}`, `{#if true}${fconsts}${W(`d${N - 1}`)}{/if}`)],
  [`SCRIPT const via fns ${N}`, sv(`const o: any = window.location;\n${sfns}${sconsts}function go() { (d${N - 1} as any).href = '/x'; }`, `<button onclick={go}>x</button>`)],
  [`alt then/each/const 19`, sv(`async function load(): Promise<any> { return window.location; }`, `${alt}${W('t19')}${altClose}`)],
]);
