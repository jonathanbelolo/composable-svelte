import {run, module} from './harness.mjs';
const svelte = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
run([
  ['T1 closure form', svelte(`let fire: any; const p = new Promise(r => { fire = r; }); async function go() { const ev: any = await p; }`, `<button onclick={(e) => fire(e)}>x</button>`)],
  ['T1 direct resolve(window)', svelte(`const p = new Promise(r => { r(window); });`, `<p>x</p>`)],
  ['T4 local child prop', {'App.svelte': `<script lang="ts">\nimport Child from './Child.svelte';\nlet fire: any; const p = new Promise(r => { fire = r; });\n</script>\n<Child onDone={fire} />\n`, 'Child.svelte': `<script lang="ts">\nlet {onDone}: any = $props();\n</script>\n<button onclick={() => onDone({ok: 1})}>x</button>\n`}],
  ['T5 local child prop authority', {'App.svelte': `<script lang="ts">\nimport Child from './Child.svelte';\nlet fire: any; const p = new Promise(r => { fire = r; });\n</script>\n<Child onDone={fire} />\n`, 'Child.svelte': `<script lang="ts">\nlet {onDone}: any = $props();\n</script>\n<button onclick={() => onDone(window.location)}>x</button>\n`}],
  ['R1 Reflect.construct', module(`export async function go() { const v: any = await Reflect.construct(Promise, [(r: any) => r(window.location)]); v.href = '/x'; }\n`)],
  ['R2 window.Promise', module(`export async function go() { const v: any = await new window.Promise((r: any) => r(window.location)); v.href = '/x'; }\n`)],
]);
