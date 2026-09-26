import {run, inReducer, module} from '../probes/harness.mjs';
run([
  ['K1 direct cond callee', inReducer(``, `new Promise((res, rej) => { (action.ok ? res : rej)(state); });`)],
  ['K2 .call mixed', inReducer(``, `new Promise((res, rej) => { const f = action.ok ? res : rej; f.call(null, state); });`)],
  ['K3 .apply mixed', inReducer(``, `new Promise((res, rej) => { const f = action.ok ? res : rej; f.apply(null, [state]); });`)],
  ['K4 bind mixed', inReducer(``, `new Promise((res, rej) => { const f = action.ok ? res : rej; const b = f.bind(null, state); b(); });`)],
  ['K5 local wrapper mixed', inReducer(`function call(f: any, v: any) { f(v); }`, `new Promise((res, rej) => { call(action.ok ? res : rej, state); });`)],
  ['K6 wrapper two promises same site', inReducer(`function call(f: any, v: any) { f(v); }`, `new Promise((res) => { call(res, state); }); new Promise((res, rej) => { call(rej, {a: 1}); });`)],
  ['K6c wrapper reject state other promise', inReducer(`function call(f: any, v: any) { f(v); }`, `new Promise((res) => { call(res, {a: 1}); }); new Promise((res, rej) => { call(rej, state); });`)],
  ['K7 mixed thenable reject side', module(`export const p = new Promise((res, rej) => { const f = Math.random() > 0.5 ? rej : res; f({ then(cb: any) { cb(1); } }); });\n`)],
  ['K8 mixed spread', module(`export const p = new Promise((res, rej) => { const f = Math.random() > 0.5 ? rej : res; f(...[1]); });\n`)],
  ['K9 resolve authority mixed', module(`export const p = new Promise((res, rej) => { const f = Math.random() > 0.5 ? rej : res; f(window.location); });\n`)],
  ['K10 nested same-start calls', module(`function mk(): any { return (x: any) => x; }\nexport const p = new Promise((res, rej) => { mk()(rej)(window.location); });\n`)],
  ['K11 Promise.reject factory authority', module(`export async function go() { try { await Promise.reject(window.location); } catch (e: any) { e.href = '/x'; } }\n`)],
  ['K12 mixed factory', module(`export async function go() { try { await (Math.random() > 0.5 ? Promise.resolve : Promise.reject)(window.location); } catch (e: any) { e.href = '/x'; } }\n`)],
]);
