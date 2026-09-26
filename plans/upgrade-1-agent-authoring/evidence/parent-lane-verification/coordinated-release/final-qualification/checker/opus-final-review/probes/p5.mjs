import {run, module} from './harness.mjs';
run([
  ['PR1 Promise.resolve authority to sink', module(`import {sink} from 'ext';\nsink(Promise.resolve(window.location));\n`)],
  ['PR2 async fn returning authority to sink', module(`import {sink} from 'ext';\nasync function f() { return window.location; }\nsink(f());\n`)],
  ['PR3 executor promise to sink data', module(`import {sink} from 'ext';\nsink(new Promise(r => r({a: 1})));\n`)],
]);
