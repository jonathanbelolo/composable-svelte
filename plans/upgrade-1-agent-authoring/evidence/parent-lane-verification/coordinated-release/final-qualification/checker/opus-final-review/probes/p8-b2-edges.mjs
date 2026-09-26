import {run} from './harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
run([
  ['E1 nested each outer item', sv(`const rows: any[] = [{xs: [window.location]}];`, `{#each rows as r}{#each r.xs as f}<button onclick={() => { f.href = '/x'; }}>x</button>{/each}{/each}`)],
  ['E2 each keyed+index clean', sv(`const rows = [{id: 1, n: 'a'}];`, `{#each rows as row, i (row.id)}<p>{i}{row.n}</p>{/each}`)],
  ['E3 each over state data clean', sv(`let s = $state({items: [{n: 1}]});`, `{#each s.items as it}<p>{it.n}</p>{/each}`)],
  ['E4 @const chain', sv(`const o: any = {l: window.location};`, `{#if true}{@const a = o}{@const f = a.l}<button onclick={() => { f.href = '/x'; }}>x</button>{/if}`)],
  ['E5 each no-as', sv(`const rows = [1, 2];`, `{#each rows}<p>x</p>{/each}`)],
  ['E6 each over Object.entries', sv(`const m: any = {a: window.location};`, `{#each Object.entries(m) as [k, f]}<button onclick={() => { (f as any).href = '/x'; }}>{k}</button>{/each}`)],
  ['E7 then value from async fn', sv(`async function load(): Promise<any> { return window.location; }`, `{#await load() then f}<button onclick={() => { f.href = '/x'; }}>x</button>{/await}`)],
]);
