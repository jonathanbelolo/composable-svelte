import {run} from '../probes/harness.mjs';
const svelte = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const S = `let fire: any; const p = new Promise(r => { fire = r; });\nasync function go() { const v: any = await p; v.href = '/x'; }`;
run([
  ['C1 snippet default authority write', svelte(``, `{#snippet s(f: any = window.location)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s()}`)],
  ['C1p snippet arg authority write', svelte(``, `{#snippet s(f: any)}<button onclick={() => { f.href = '/x'; }}>x</button>{/snippet}\n{@render s(window.location)}`)],
  ['C2 each default authority write', svelte(``, `{#each [{}] as {f = window.location}}<button onclick={() => { f.href = '/x'; }}>x</button>{/each}`)],
  ['C3 snippet default fire + dispatch', svelte(S, `{#snippet s(f: any = fire)}<button onclick={() => f(window.location)}>x</button>{/snippet}\n{@render s()}`)],
  ['C3p snippet arg fire + dispatch', svelte(S, `{#snippet s(f: any)}<button onclick={() => f(window.location)}>x</button>{/snippet}\n{@render s(fire)}`)],
  ['C4 snippet default fire to handler', svelte(S, `{#snippet s(f: any = fire)}<button onclick={f}>x</button>{/snippet}\n{@render s()}`)],
]);
