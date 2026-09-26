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

const findingsFor = (result, rule) => result.findings.filter((finding) => finding.rule === rule);

test('public Effect constructors are known pure decision calls through aliases', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect as E, type Reducer} from '@composable-svelte/core';
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,E.batch(E.none(),E.cancel('old'))];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.deepEqual(result.limitations,[]);
 assert.deepEqual(result.findings,[]);
});
test('unknown Effect members do not gain the deferred effect exemption', (t) => {
 const result=fixture(t, {'App.svelte': `<script>import {Effect} from '@composable-svelte/core';
 Effect.unknown(() => fetch('/unsafe'));</script>`});
 assert.ok(result.findings.some(f=>f.detector==='view-io'));
});
test('real Effect execution callbacks keep effect ownership and eager calls stay in view', (t) => {
 const result=fixture(t, {'App.svelte': `<script>import {Effect as E} from '@composable-svelte/core';
 function eager(){fetch('/eager');return ()=>{};}
 E.run(eager()); E.cancellable('id',()=>fetch('/effect'));</script>`});
 assert.ok(result.findings.some(f=>f.detector==='view-io'));
 assert.ok(result.findings.some(f=>f.detector==='effect-body-primitive'));
 assert.deepEqual(result.errors,[]);
});
test('a same-named local object never gains framework ownership', (t) => {
 const result=fixture(t, {'App.svelte': `<script>const Effect={run(fn){fn();}};
 Effect.run(()=>fetch('/local'));</script>`});
 assert.ok(result.findings.some(f=>f.detector==='view-io'));
});
test('public API and websocket constructors have exact deferred mapper positions', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,Effect.batch(
 Effect.api({}, {}, () => ({type:'go'}), () => ({type:'go'})),
 Effect.apiFireAndForget({}, {}, () => ({type:'go'})),
 Effect.apiAll({}, [], () => ({type:'go'}), () => ({type:'go'})),
 Effect.websocket.connect({}, 'id', '/ws', [], () => ({type:'go'})),
 Effect.websocket.disconnect({}),
 Effect.websocket.send({}, {}, () => ({type:'go'}), () => ({type:'go'})),
 Effect.websocket.subscribe({}, 'id', () => ({type:'go'})),
 Effect.websocket.subscribeToEvents({}, 'id', () => ({type:'go'}))
 )];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.deepEqual(result.limitations,[]);
 assert.deepEqual(result.findings,[]);
});
test('inherited and unknown nested names are not recognized Effect constructors', (t) => {
 const result=fixture(t, {'App.svelte': `<script>import {Effect} from '@composable-svelte/core';
 Effect.toString(()=>fetch('/prototype'));
 Effect.websocket.unknown(()=>fetch('/unknown'));</script>`});
 assert.equal(result.findings.filter(f=>f.detector==='view-io').length,2);
});
test('subscription teardown executes under effect ownership rather than remaining inert', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,
 Effect.subscription('id', () => () => { fetch('/cleanup'); })];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.ok(result.findings.some(f=>f.detector==='effect-body-primitive'));
 assert.deepEqual(result.limitations,[]);
});

test('helper-returned subscription cleanup follows the actual return value into effect ownership', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 function cleanup() { fetch('/returned-cleanup'); }
 function makeCleanup() { return cleanup; }
 function setup() { return makeCleanup(); }
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,Effect.subscription('id',setup)];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.equal(result.findings.filter(f=>f.detector==='effect-body-primitive').length,1);
 assert.deepEqual(result.limitations,[]);
});

test('subscription setup and returned cleanup may call injected services without direct primitives', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 type Dependencies={events:{start():void;stop():void}};
 const reducer: Reducer<{value:number},{type:'go'},Dependencies> = (state,action,deps) => [state,
 Effect.subscription('id',()=>{deps.events.start();return ()=>deps.events.stop();})];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.deepEqual(result.findings,[]);
 assert.deepEqual(result.limitations,[]);
});

test('noncallable subscription return containers do not execute their nested functions', (t) => {
 for(const returned of ['{cleanup}', '[cleanup]', '42', 'null']) {
  const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 function cleanup() { fetch('/not-a-cleanup'); }
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,
 Effect.subscription('id',()=>(${returned}))];`});
  assert.equal(result.findings.filter(f=>f.detector==='effect-body-primitive').length,0,returned);
 }
});

test('promise-returning setup is not mistaken for its fulfilled cleanup callback', (t) => {
 for (const setup of ['async()=>cleanup', '()=>makePromise()']) {
  const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 function cleanup() { fetch('/not-an-awaited-cleanup'); }
 async function makePromise() { return cleanup; }
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,
 Effect.subscription('id',${setup})];`});
  assert.equal(result.findings.filter(f=>f.detector==='effect-body-primitive').length,0,setup);
 }
});

test('subscription dispatch argument suppresses a default callback while forwarding real dispatch', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 function wrongDefault() { fetch('/default-must-not-run'); }
 function makeCleanup(dispatch) { return () => dispatch({type:'go'}); }
 function setup(dispatch=wrongDefault) { return makeCleanup(dispatch); }
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,Effect.subscription('id',setup)];`});
 assert.equal(result.findings.filter(f=>f.detector==='effect-body-primitive').length,0);
 assert.deepEqual(result.errors,[]);
});

test('suppressed subscription defaults do not activate framework callbacks through helper references', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 function unusedWork() { fetch('/unused-default'); }
 function setup(dispatch=Effect.run(unusedWork)) { return () => dispatch({type:'go'}); }
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,Effect.subscription('id',setup)];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.deepEqual(result.findings,[]);
});

test('an actually omitted default still activates framework callback helper references', (t) => {
 const result=fixture(t, {'entry.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
 function actualWork() { fetch('/actual-default'); }
 function makeCleanup(effect=Effect.run(actualWork)) { return () => {}; }
 const reducer: Reducer<{value:number},{type:'go'}> = state => [state,Effect.subscription('id',() => makeCleanup())];`});
 assert.equal(result.complete,true,JSON.stringify(result.errors));
 assert.equal(result.findings.filter(f=>f.detector==='effect-body-primitive').length,1);
});
