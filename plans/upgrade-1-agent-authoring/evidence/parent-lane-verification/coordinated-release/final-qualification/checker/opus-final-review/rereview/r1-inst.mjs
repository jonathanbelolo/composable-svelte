import {run, inReducer, module} from '../probes/harness.mjs';
const svelte = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
run([
  ['A1 typeof in type args no FP', inReducer(`const g = (<T,>(x: T) => x)<typeof location>;`, `g(1 as any);`)],
  ['A2 typed param inside inst', inReducer(`const g = (<T,>(x: T, s: Storage) => x)<number>;`, `g(1, undefined as any);`)],
  ['A3 plain control fetch view', svelte(``, `{(() => fetch('/x'))()}`)],
  ['A3 inst fetch view', svelte(``, `{(<T,>() => fetch('/x'))<number>()}`)],
  ['A4 plain qs template', svelte(``, `{(document.querySelector)('#x')}`)],
  ['A4 inst qs template', svelte(``, `{(document.querySelector<HTMLElement>)('#x')}`)],
  ['A5 inst handler body', svelte(``, `<button onclick={(<T,>() => { fetch('/x'); })<number>}>x</button>`)],
  ['A5c plain handler body', svelte(``, `<button onclick={() => { fetch('/x'); }}>x</button>`)],
  ['A6 nested inst', inReducer(``, `((crypto.getRandomValues<Uint8Array>)<Uint8Array>)(new Uint8Array(1));`)],
  ['A7 inst of class expr new', inReducer(`const K = (class <T> { constructor() { fetch('/x'); } })<number>;`, `new K();`)],
  ['A7c plain class new', inReducer(`const K = (class <T> { constructor() { fetch('/x'); } });`, `new K();`)],
  ['A8 inst generic fn decl', inReducer(`function g<T>(x: T) { fetch('/x'); return x; }\nconst h = g<number>;`, `h(1);`)],
  ['H1 class extends call (heritage)', inReducer(``, `class A extends (fetch('/x'), Object) {}`)],
  ['H1c control comma plain', inReducer(``, `const B = (fetch('/x'), Object);`)],
  ['H2 class extends fn body', inReducer(`const mk = () => { fetch('/x'); return Object; };`, `class A extends mk() {}`)],
  ['H3 class extends random w/ targs', inReducer(`class Base<T> {}`, `class A extends (Math.random(), Base)<number> {}`)],
]);
