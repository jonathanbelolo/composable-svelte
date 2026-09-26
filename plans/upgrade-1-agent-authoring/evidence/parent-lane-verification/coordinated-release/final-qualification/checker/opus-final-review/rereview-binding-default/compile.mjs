import {compile} from '/private/tmp/composable-final-checker/packages/architecture/node_modules/svelte/src/compiler/index.js';
const cases = {
  K1: `<script>let key='a';</script>{#each [{a:1}] as {[(window.location.href = '/x')]: f}}<p>{f}</p>{/each}`,
  K3: `<script>const obj={};</script>{#if true}{@const {[(window.location.href = '/x')]: f} = obj}<p>{f}</p>{/if}`,
  K4: `<script>const q=Promise.resolve({});</script>{#await q then {[(window.location.href = '/x')]: f}}<p>{f}</p>{/await}`,
  C1: `<script>const obj={};</script>{#if true}{@const {f = window.location} = obj}<p>{f}</p>{/if}`,
};
for (const [k, src] of Object.entries(cases)) {
  try { const r = compile(src, {generate: 'client', filename: k + '.svelte'}); console.log(k, 'OK', /location\.href/.test(r.js.code) ? 'emits location.href' : 'NO location.href in output'); }
  catch (e) { console.log(k, 'ERR', e.code ?? '', e.message.split('\n')[0]); }
}
for (const [k, src] of Object.entries({
  H1: `{#each [{}] as {[String(history.pushState(null, '', '/x'))]: f}}<p>{f}</p>{/each}`,
  V2: `<script>const q=Promise.resolve({}); const store={subscribe(){}};</script>{#await q then {[String(store.subscribe(() => {}))]: f}}<p>{f}</p>{/await}`})) {
  try { const r = compile(src, {generate: 'client'}); console.log(k, 'OK', /pushState|subscribe\(/.test(r.js.code) ? 'emits call' : 'NO call'); } catch (e) { console.log(k, 'ERR', e.message.split('\n')[0]); }
}
