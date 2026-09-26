import {run} from '../probes/harness.mjs';
const S = `let fire: any; const p = new Promise(r => { fire = r; });\nasync function go() { const v: any = await p; v.ownerDocument.defaultView.location.href = '/x'; }\n`;
const svelte = (tpl, script = S) => ({'App.svelte': `<script lang="ts">\n${script}</script>\n${tpl}\n`});
run([
  ['P1 event via settle', svelte(`<button onclick={(e) => fire(e.currentTarget)}>x</button>`)],
  ['P1c event direct control', svelte(`<button onclick={(e) => { const v: any = e.currentTarget; v.ownerDocument.defaultView.location.href = '/x'; }}>x</button>`, ``)],
  ['P2 attach via settle', svelte(`<div {@attach (n) => fire(n)}></div>`)],
  ['P2c attach direct control', svelte(`<div {@attach (n: any) => { n.ownerDocument.defaultView.location.href = '/x'; }}></div>`, ``)],
  ['P3 transition:fire', svelte(`<div transition:fire></div>`)],
  ['P3c transition:t control', svelte(`<div transition:t></div>`, `function t(n: any) { n.ownerDocument.defaultView.location.href = '/x'; return {}; }\n`)],
  ['P4 in:fire', svelte(`<div in:fire></div>`)],
  ['P5 animate:fire', svelte(`{#each [1] as i (i)}<div animate:fire></div>{/each}`)],
]);
