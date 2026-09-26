import {run, module} from '../probes/harness.mjs';
run([
  ['N1 typeof arguments in type arg', module(`function g<T>(x?: T) { return 1; }\nexport function f(this: any) { const h = g<typeof arguments>; return h(); }\n`)],
  ['N2 typeof arguments annotation', module(`export function f(this: any) { let x: typeof arguments | undefined; return x; }\n`)],
]);
