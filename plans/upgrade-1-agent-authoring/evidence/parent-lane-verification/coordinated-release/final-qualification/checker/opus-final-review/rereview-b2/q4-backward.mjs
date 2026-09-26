import {run, analyze} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const W = (v) => `<button onclick={() => { (${v} as any).href = '/x'; }}>x</button>`;
for (const N of [10, 40, 120]) {
  // backward chain: s_i assigned in a handler placed AFTER the each over s_{i}
  let lets = ''; let tpl = '';
  for (let i = 0; i <= N; i++) lets += `let s${i}: any = ${i === N ? 'window.location' : 'null'};\n`;
  for (let i = 0; i < N; i++) tpl += `{#each [s${i + 1}] as e${i}}<button onclick={() => { s${i} = e${i}; }}>x</button>{/each}\n`;
  tpl += W('s0');
  let sfn = '';
  for (let i = 0; i < N; i++) sfn += `function g${i}() { for (const e of [s${i + 1}]) s${i} = e; }\n`;
  const r1 = analyze(sv(lets, tpl));
  const r2 = analyze(sv(lets + sfn, W('s0') + Array.from({length: N}, (_, i) => `<button onclick={g${i}}>x</button>`).join('')));
  console.log(`backward N=${N} template`, JSON.stringify(r1).slice(0, 200));
  console.log(`backward N=${N} script  `, JSON.stringify(r2).slice(0, 200));
}
