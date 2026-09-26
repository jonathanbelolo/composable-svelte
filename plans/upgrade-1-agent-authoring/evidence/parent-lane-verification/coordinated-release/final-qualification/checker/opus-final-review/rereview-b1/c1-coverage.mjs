import {run} from '../probes/harness.mjs';
const sv = (script, tpl, lang = 'ts') => ({'App.svelte': `<script lang="${lang}">\n${script}\n</script>\n${tpl}\n`});
const L = `(window.location.href = '/x')`;
const fire = `let fire: any; const p = new Promise(r => { fire = r; });`;
run([
  ['C1 nested obj in obj', sv(``, `{#each [{a: {}}] as {a: {[${L}]: f}}}<p>{f}</p>{/each}`)],
  ['C2 array in obj', sv(``, `{#each [{a: [{}]}] as {a: [{[${L}]: f}]}}<p>{f}</p>{/each}`)],
  ['C3 obj in array', sv(``, `{#each [[{}]] as [{[${L}]: f}]}<p>{f}</p>{/each}`)],
  ['C4 computed + rest', sv(``, `{#each [{}] as {[${L}]: f, ...rest}}<p>{f}{rest}</p>{/each}`)],
  ['C5 rest array w/ nested obj', sv(``, `{#each [[{}]] as [...[{[${L}]: f}]]}<p>{f}</p>{/each}`)],
  ['C6 computed renamed to pattern', sv(``, `{#each [{}] as {[${L}]: {g}}}<p>{g}</p>{/each}`)],
  ['C7 each with index', sv(``, `{#each [{}] as {[${L}]: f}, i}<p>{f}{i}</p>{/each}`)],
  ['C8 each with index+key', sv(``, `{#each [{}] as {[${L}]: f}, i (i)}<p>{f}{i}</p>{/each}`)],
  ['C9 each key only', sv(``, `{#each [{}] as {[${L}]: f} (f)}<p>{f}</p>{/each}`)],
  ['C10 then short form', sv(`const q = Promise.resolve({});`, `{#await q then {[${L}]: f}}<p>{f}</p>{/await}`)],
  ['C11 catch short form', sv(`const q = Promise.resolve({});`, `{#await q catch {[${L}]: f}}<p>{f}</p>{/await}`)],
  ['C12 then long form', sv(`const q = Promise.resolve({});`, `{#await q}<p>..</p>{:then {[${L}]: f}}<p>{f}</p>{/await}`)],
  ['C13 @const nested', sv(`const o: any = {};`, `{#if true}{@const {a: {[${L}]: f}} = o}<p>{f}</p>{/if}`)],
  ['C14 @const array', sv(`const o: any = [];`, `{#if true}{@const [{[${L}]: f}] = o}<p>{f}</p>{/if}`)],
  ['C15 snippet typed param', sv(``, `{#snippet s({[${L}]: f}: {[k: string]: any})}<p>{f}</p>{/snippet}\n{@render s({})}`)],
  ['C16 snippet 2nd param', sv(``, `{#snippet s(a: any, {[${L}]: f}: any)}<p>{a}{f}</p>{/snippet}\n{@render s(1, {})}`)],
  ['C17 snippet untyped JS', sv(``, `{#snippet s({[(window.location.href = '/x')]: f})}<p>{f}</p>{/snippet}\n{@render s({})}`, 'js')],
  ['C18 each JS', sv(``, `{#each [{}] as {[(window.location.href = '/x')]: f}}<p>{f}</p>{/each}`, 'js')],
  ['C19 resolver call', sv(fire, `{#each [{}] as {[fire(1)]: f}}<p>{f}</p>{/each}`)],
  ['C20 computed in default key', sv(``, `{#each [{}] as {a = {[${L}]: 1}}}<p>{a}</p>{/each}`)],
  ['C21 multi computed', sv(``, `{#each [{}] as {[${L}]: f, [${L}]: g}}<p>{f}{g}</p>{/each}`)],
  ['C22 computed literal num', sv(``, `{#each [{}] as {[0]: f}}<p>{f}</p>{/each}`)],
  ['C23 snippet optional param w/ computed', sv(``, `{#snippet s({[${L}]: f}?: any)}<p>{f}</p>{/snippet}\n{@render s({})}`)],
  ['C24 nested in snippet array', sv(``, `{#snippet s([{[${L}]: f}]: any)}<p>{f}</p>{/snippet}\n{@render s([{}])}`)],
]);
