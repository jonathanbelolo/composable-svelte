import {run, inReducer, module} from './harness-fixed.mjs';
run([
  ['G1c plain arguments (control)', module(`function call(this: any) { const a: any = arguments; a[0](window.location); }\nexport async function go() { const v: any = await new Promise(r => call(r)); v.href = '/x'; }\n`)],
  ['G1 arguments<any>', module(`function call(this: any) { const a: any = arguments<any>; a[0](window.location); }\nexport async function go() { const v: any = await new Promise(r => call(r)); v.href = '/x'; }\n`)],
  ['G2c plain arguments identity', module(`function id(this: any): any { return (arguments as any)[0]; }\nexport function go() { id(window.location).href = '/x'; }\n`)],
  ['G2 arguments<any> identity', module(`function id(this: any): any { return (arguments<any> as any)[0]; }\nexport function go() { id(window.location).href = '/x'; }\n`)],
  ['G2p plain param identity (expected)', module(`function id(x: any): any { return x; }\nexport function go() { id(window.location).href = '/x'; }\n`)],
  ['G3 arguments[0]<any> call', module(`function call(this: any) { (arguments[0]<any>)(window.location); }\nexport async function go() { const v: any = await new Promise(r => call(r)); v.href = '/x'; }\n`)],
]);
