import {run, inReducer, module, core} from './harness.mjs';
const svelte = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
run([
  ['G1 $props alias', svelte(`let {a}: any = $props(); const o = { get a() { return a; } };`, `<p>{o.a}</p>`)],
  ['G2 $derived alias', svelte(`let n = $state(1); const d = $derived(n * 2); const o = { get d() { return d; } };`, `<p>{o.d}</p>`)],
  ['G3 $store autosub alias', svelte(`import {writable} from 'svelte/store'; const c = writable(0); const o = { get v() { return $c; } };`, `<p>{o.v}</p>`)],
  ['G4 alias import ext', module(`import {thing} from 'ext';\nimport {sink} from 'ext';\nconst o = { get t() { return thing; } };\nsink(o);\n`)],
  ['G4c data import ext', module(`import {thing} from 'ext';\nimport {sink} from 'ext';\nconst o = { t: thing };\nsink(o);\n`)],
  ['G5 alias store into reducer via deps', {'entry.ts': `${core}let st: any;\nconst deps = { get store() { return st; } };\nst = createStore({initialState: {}, reducer: (s: any, a: any, d: any) => { d.store.dispatch({type: 'x'}); return [s, Effect.none()]; }, dependencies: deps});\n`}],
  ['G5c data store into reducer via deps', {'entry.ts': `${core}let st: any;\nconst deps = { store: st };\nst = createStore({initialState: {}, reducer: (s: any, a: any, d: any) => { d.store.dispatch({type: 'x'}); return [s, Effect.none()]; }, dependencies: deps});\n`}],
  ['G6 getter + setter same key', module(`let x = 1; export const o = { get x() { return x; }, set x(v: number) { x = v; } };\n`)],
  ['G7 getter string name', module(`const l = window.location; const o = { get 'l'() { return l; } };\nexport function f() { o.l.href = '/x'; }\n`)],
  ['G8 getter returning param of enclosing fn', inReducer(`function mk(v: any) { return { get v() { return v; } }; }`, `mk(window.location).v.href = '/x';`)],
  ['G8c data', inReducer(`function mk(v: any) { return { v }; }`, `mk(window.location).v.href = '/x';`)],
  ['G9 getter with type-only binding', module(`type T = number; declare const T: any; export const o = { get t() { return T; } };\n`)],
  ['G10 getter comma expr', module(`const a = 1; export const o = { get t() { return (0, a); } };\n`)],
  ['G11 getter returning fn declared later', inReducer(`const o = { get go() { return nav; } }; function nav() { history.back(); }`, `o.go();`)],
  ['G12 getter in Svelte mount props', {'entry.ts': `import {mount} from 'svelte';\nimport App from './App.svelte';\n${core}const store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});\nmount(App, {target: document.body, props: { get store() { return store; } }});\n`, 'App.svelte': `<script lang="ts">\nlet {store}: any = $props();\n$effect(() => { store.dispatch({type: 'x'}); });\n</script>\n<p>x</p>\n`}],
  ['G12c data mount props', {'entry.ts': `import {mount} from 'svelte';\nimport App from './App.svelte';\n${core}const store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()]});\nmount(App, {target: document.body, props: { store }});\n`, 'App.svelte': `<script lang="ts">\nlet {store}: any = $props();\n$effect(() => { store.dispatch({type: 'x'}); });\n</script>\n<p>x</p>\n`}],
]);
