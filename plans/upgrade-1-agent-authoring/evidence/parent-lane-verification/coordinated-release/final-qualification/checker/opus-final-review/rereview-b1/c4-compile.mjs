import {compile} from '/private/tmp/composable-final-checker/packages/architecture/node_modules/svelte/src/compiler/index.js';
const L = `(window.location.href = '/x')`;
const cases = {
  N1_typeLiteralExpr: `<script lang="ts"></script>{#snippet s(x: {[${L}]: number})}<p>{x}</p>{/snippet}{@render s({})}`,
  N9_eachTyped: `<script lang="ts">const rows=[{a:1}];</script>{#each rows as {a}: {[k: string]: number}}<p>{a}</p>{/each}`,
  C11_catchShort: `<script>const q=Promise.resolve({});</script>{#await q catch {[${L}]: f}}<p>{f}</p>{/await}`,
  C15_snippetTyped: `<script lang="ts"></script>{#snippet s({[${L}]: f}: {[k: string]: any})}<p>{f}</p>{/snippet}{@render s({})}`,
  C2_arrInObj: `<script></script>{#each [{a: [{}]}] as {a: [{[${L}]: f}]}}<p>{f}</p>{/each}`,
  D1_let: `<script>import Child from './Child.svelte';</script><Child let:item={{[${L}]: f}}><p>{f}</p></Child>`,
};
for (const [k, src] of Object.entries(cases)) {
  try { const r = compile(src, {generate: 'client', filename: k + '.svelte'}); console.log(k.padEnd(18), 'OK', /location\.href/.test(r.js.code) ? 'emits location.href' : 'NO location.href in output'); }
  catch (e) { console.log(k.padEnd(18), 'ERR', e.code ?? '', e.message.split('\n')[0]); }
}
