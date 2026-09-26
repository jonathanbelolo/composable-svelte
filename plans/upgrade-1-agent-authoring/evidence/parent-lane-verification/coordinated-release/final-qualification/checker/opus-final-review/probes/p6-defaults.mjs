import {run} from './harness.mjs';
const sv = (script, tpl, extra = {}) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`, ...extra});
const fire = `let fire: any; const p = new Promise(r => { fire = r; });`;
run([
  ['D1 snippet default authority', sv(``, `{#snippet s(f: any = window.location)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s()}`)],
  ['D1c snippet arg authority', sv(``, `{#snippet s(f: any)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s(window.location)}`)],
  ['D2 each destructure default authority', sv(``, `{#each [{}] as {f = window.location}}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/each}`)],
  ['D3 snippet default resolver', sv(fire, `{#snippet s(f: any = fire)}<button onclick={f}>x</button>{/snippet}\n{@render s()}`)],
  ['D4 each default resolver', sv(fire, `{#each [{}] as {f = fire}}<button onclick={f}>x</button>{/each}`)],
  ['D5 await then default authority', sv(`const q = Promise.resolve({});`, `{#await q then {f = window.location}}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/await}`)],
  ['D6 await catch default authority', sv(`const q = Promise.resolve({});`, `{#await q}{:catch {f = window.location}}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/await}`)],
  ['D7 let directive default', sv(`import Child from './Child.svelte';`, `<Child let:item={{f = window.location}}><button onclick={() => { (f as any).href = '/x'; }}>x</button></Child>`, {'Child.svelte': `<slot item={{}} />\n`})],
  ['P1 ordinary snippet no default', sv(``, `{#snippet s(label: string)}<p>{label}</p>{/snippet}\n{@render s('a')}`)],
  ['P2 ordinary each destructure', sv(`const rows = [{id: 1, name: 'a'}];`, `{#each rows as {id, name}, i (id)}<p>{i}{name}</p>{/each}`)],
  ['P3 each nested + rest', sv(`const rows = [{id: 1, meta: {n: 2}, x: 1}];`, `{#each rows as {id, meta: {n}, ...rest} (id)}<p>{n}{rest.x}</p>{/each}`)],
]);
