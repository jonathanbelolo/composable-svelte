import {run, inReducer, module} from './harness.mjs';
run([
  ['I1 control direct fn body write', inReducer(`const g = (x: string) => { location.href = x; return x; };`, `g('/x');`)],
  ['I1 instantiated generic arrow', inReducer(`const g = (<T,>(x: T) => { location.href = String(x); return x; })<string>;`, `g('/x');`)],
  ['I2 control fetch in fn', inReducer(`const g = <T,>(x: T) => { fetch('/x'); return x; };`, `g(1);`)],
  ['I2 instantiated fetch in fn', inReducer(`const g = (<T,>(x: T) => { fetch('/x'); return x; })<number>;`, `g(1);`)],
  ['I3 control querySelector call', inReducer(``, `const q = document.querySelector; q('#x');`)],
  ['I3 inst direct call qs', inReducer(``, `(document.querySelector<HTMLElement>)('#x');`)],
  ['I4 control getRandomValues', inReducer(``, `(crypto.getRandomValues)(new Uint8Array(1));`)],
  ['I4 inst getRandomValues', inReducer(``, `(crypto.getRandomValues<Uint8Array>)(new Uint8Array(1));`)],
  ['I5 inst alias then call', inReducer(``, `const q = document.querySelector<HTMLElement>; q('#x');`)],
]);
