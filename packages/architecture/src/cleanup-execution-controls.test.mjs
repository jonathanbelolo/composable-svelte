import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

function fixture(t, files, options = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantics-orchestration-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {
      '@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'
    }}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte', version: '5.57.0', exports: {'.': './index.js', './transition': './transition.js'}
    }),
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const roots = options.roots ?? Object.keys(files);
  const graph = buildGraph({projectRoot, roots, tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.57.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph, ...options.analysis});
}


const effects = result => result.findings.filter(f => f.detector === 'effect-body-primitive');
function subscription(t, declarations, setup) {
 return fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 ${declarations}
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state, Effect.subscription('id',${setup})];`});
}
test('bound setup and bound cleanup execute their target bodies', t => {
 for (const setup of ['setup.bind(null)', '()=>cleanup.bind(null)', 'setup.bind(null).bind(null)']) {
  const result=subscription(t, `function cleanup(){fetch('/cleanup');} function setup(){return cleanup;}`,setup);
  assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,1,setup);
 }
});
test('bound setup forwards bound arguments before runtime dispatch', t => {
 const result=subscription(t, `function wrong(){fetch('/wrong');} function setup(prefix,dispatch=wrong){return ()=>dispatch({type:'go'});}`,`setup.bind(null,'prefix')`);
 assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,0);
});
test('direct async cleanup is executable, async setup result is explicitly unsupported', t => {
 const direct=subscription(t,'',`()=>async()=>{fetch('/cleanup');}`);
 assert.equal(direct.complete,true,JSON.stringify(direct.errors));assert.equal(effects(direct).length,1);
 for(const setup of ['async()=>cleanup', '()=>makePromise()']) {
  const result=subscription(t,`function cleanup(){fetch('/deferred');} async function makePromise(){return cleanup;}`,setup);
  assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.construct==='subscription-async-cleanup'));
  assert.equal(effects(result).length,0);
 }
});
test('omitted and explicitly undefined arguments retain their callback defaults', t => {
 for(const argument of ['', 'undefined', 'void 0']) {
  const result=subscription(t,`function fallback(){fetch('/fallback');} function helper(callback=fallback){return ()=>callback();}`,`()=>helper(${argument})`);
  assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,1,argument);
 }
});
test('unknown opaque invocations retain defaults even alongside a supplied local call', t => {
 const result=fixture(t, {'App.svelte': `<script>function wrong(){fetch('/default');} function callback(value=wrong){value();}
 callback(()=>{}); external(callback);</script>`});
 assert.ok(result.findings.some(f=>f.detector==='view-io'));
});
test('forwarded actual dispatch suppresses fallback calls and fallback initializer execution', t => {
 const result=subscription(t,`function wrong(){fetch('/default');} function helper(callback=wrong){return ()=>callback({type:'go'});} function setup(dispatch=fetch('/initializer')){return helper(dispatch);}`,`setup`);
 assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,0);
});
test('possible undefined alongside dispatch still activates the default', t => {
 const result=subscription(t,`function wrong(){fetch('/default');} function helper(callback=wrong){return ()=>callback({type:'go'});} function setup(dispatch){return helper(flag?dispatch:undefined);}`,`setup`);
 assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,1);
});

test('bound cleanup arguments suppress its unused callback default', t => {
 const result=subscription(t,`function wrong(){fetch('/unused-default');} function cleanup(callback=wrong){callback();}`,`()=>cleanup.bind(null,()=>{})`);
 assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,0);
});
test('Promise.resolve and custom thenable setup stay explicit without executing their stored callbacks', t => {
 for(const setup of ['()=>Promise.resolve(cleanup)', '()=>({then:cleanup})']) {
  const result=subscription(t,`function cleanup(){fetch('/not-synchronous');}`,setup);
  assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.construct==='subscription-async-cleanup'));
  assert.equal(effects(result).length,0);
 }
});
test('multiple bound invocation alternatives retain the possibly omitted default', t => {
 const result=subscription(t,`function wrong(){fetch('/possible-default');} function setup(callback=wrong){return ()=>callback();}
 const chosen=flag?setup.bind(null,()=>{}):setup.bind(null,undefined);`,`chosen`);
 assert.equal(result.complete,true,JSON.stringify(result.errors));assert.equal(effects(result).length,1);
});
