import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const W = (v='f') => `<button onclick={() => { (${v} as any).href = '/x'; }}>x</button>`;
const H = (v='h') => `<button onclick={() => { (${v} as any).pushState({}, '', '/x'); }}>x</button>`;
const store = `import {createStore, Effect} from '@composable-svelte/core';\nconst store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});`;
const go = (body) => `function go() { ${body} }`;
const B = `<button onclick={go}>x</button>`;
run([
  // each: object rest
  ['S1 for-of obj rest', sv(`const rows: any[] = [{a: 1, f: window.location}];\n${go(`for (const {a, ...r} of rows) (r.f as any).href = '/x';`)}`, B)],
  ['T1 each obj rest', sv(`const rows: any[] = [{a: 1, f: window.location}];`, `{#each rows as {a, ...r}}<button onclick={() => { (r.f as any).href = '/x'; }}>{a}</button>{/each}`)],
  // each: array destructure + rest
  ['S2 for-of arr rest', sv(`const rows: any[] = [[1, window.location]];\n${go(`for (const [k, ...o] of rows) (o[0] as any).href = '/x';`)}`, B)],
  ['T2 each arr rest', sv(`const rows: any[] = [[1, window.location]];`, `{#each rows as [k, ...o]}<button onclick={() => { (o[0] as any).href = '/x'; }}>{k}</button>{/each}`)],
  // index + key
  ['T3 each idx+key', sv(`const rows: any[] = [{id: 1, f: window.location}];`, `{#each rows as {id, f}, i (id)}${W()}{/each}`)],
  // state data
  ['S4 for-of state', sv(`let s = $state<any>({items: [window.location]});\n${go(`for (const f of s.items) (f as any).href = '/x';`)}`, B)],
  ['T4 each state', sv(`let s = $state<any>({items: [window.location]});`, `{#each s.items as f}${W()}{/each}`)],
  // Map
  ['S5 for-of Map', sv(`const m = new Map<any, any>([[1, window.location]]);\n${go(`for (const [k, f] of m) (f as any).href = '/x';`)}`, B)],
  ['T5 each Map', sv(`const m = new Map<any, any>([[1, window.location]]);`, `{#each m as [k, f]}${W()}{/each}`)],
  ['S5b for-of Set', sv(`const m = new Set<any>([window.location]);\n${go(`for (const f of m) (f as any).href = '/x';`)}`, B)],
  ['T5b each Set', sv(`const m = new Set<any>([window.location]);`, `{#each m as f}${W()}{/each}`)],
  ['S5c for-of values()', sv(`const m: any = {a: window.location};\n${go(`for (const f of Object.values(m)) (f as any).href = '/x';`)}`, B)],
  ['T5c each values()', sv(`const m: any = {a: window.location};`, `{#each Object.values(m) as f}${W()}{/each}`)],
  // then destructuring
  ['S6 await destr rest', sv(`async function load(): Promise<any> { return {a: 1, b: {h: history}}; }\nasync function go() { const {a, b: {...r}} = await load(); (r.h as any).pushState({}, '', '/x'); }`, B)],
  ['T6 then destr rest', sv(`async function load(): Promise<any> { return {a: 1, b: {h: history}}; }`, `{#await load() then {a, b: {...r}}}${H('r.h')}{/await}`)],
  ['T6b then arr', sv(`async function load(): Promise<any> { return [history]; }`, `{#await load() then [h]}${H()}{/await}`)],
  ['T6c then non-promise', sv(`const x: any = history;`, `{#await x then h}${H()}{/await}`)],
  ['T6d then pending form', sv(`async function load(): Promise<any> { return history; }`, `{#await load()}<p>..</p>{:then h}${H()}{:catch e}<p>e</p>{/await}`)],
  ['T6e then Promise.resolve', sv(``, `{#await Promise.resolve(history) then h}${H()}{/await}`)],
  // nested each referencing outer item
  ['T7 nested outer ref', sv(`const rows: any[] = [{f: window.location, xs: [1]}];`, `{#each rows as r}{#each r.xs as x}<button onclick={() => { (r.f as any).href = '/x'; }}>{x}</button>{/each}{/each}`)],
  ['T7b nested inner over outer', sv(`const rows: any[] = [[window.location]];`, `{#each rows as r}{#each r as f}${W()}{/each}{/each}`)],
  // chained const
  ['T8 const chain + destr', sv(`const o: any = {a: {b: [{f: window.location}]}};`, `{#if true}{@const {a} = o}{@const [c] = a.b}{@const {f} = c}${W()}{/if}`)],
  ['T8b const rest', sv(`const o: any = {x: 1, f: window.location};`, `{#if true}{@const {x, ...r} = o}<button onclick={() => { (r.f as any).href = '/x'; }}>{x}</button>{/if}`)],
  ['T8c const in each over item', sv(`const rows: any[] = [{l: window.location}];`, `{#each rows as r}{@const f = r.l}${W()}{/each}`)],
  ['T8d const in then', sv(`async function load(): Promise<any> { return {l: window.location}; }`, `{#await load() then r}{@const f = r.l}${W()}{/await}`)],
  ['T8e each over then value', sv(`async function load(): Promise<any> { return [window.location]; }`, `{#await load() then rs}{#each rs as f}${W()}{/each}{/await}`)],
  // store
  ['T9 then store subscribe', sv(`${store}\nasync function load(): Promise<any> { return store; }`, `{#await load() then st}<p>{String(st.subscribe(() => {}))}</p>{/await}`)],
  ['T9b each destr store', sv(`${store}\nconst rows: any[] = [{st: store}];`, `{#each rows as {st}}<p>{String(st.subscribe(() => {}))}</p>{/each}`)],
  // callable item as handler
  ['S10 fn item called', sv(`const fns: any[] = [() => { window.location.href = '/x'; }];\n${go(`for (const f of fns) f();`)}`, B)],
  ['T10 fn item as handler', sv(`const fns: any[] = [() => { window.location.href = '/x'; }];`, `{#each fns as f}<button onclick={f}>x</button>{/each}`)],
  ['T10b const fn handler', sv(`const o: any = {go: () => { history.pushState({}, '', '/x'); }};`, `{#if true}{@const g = o.go}<button onclick={g}>x</button>{/if}`)],
  // snippet with each
  ['T11 snippet param each', sv(``, `{#snippet s(rows: any[])}{#each rows as f}${W()}{/each}{/snippet}\n{@render s([window.location])}`)],
  // item passed to component prop / escape
  ['T12 each item to ext fn', sv(`import ext from 'ext';\nconst rows: any[] = [window.location];`, `{#each rows as f}<p>{String(ext(f))}</p>{/each}`)],
  ['S12 for-of item to ext fn', sv(`import ext from 'ext';\nconst rows: any[] = [window.location];\nfor (const f of rows) ext(f);`, `<p>x</p>`)],
]);
