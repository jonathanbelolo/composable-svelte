import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

function analyze(t, source, additional = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'native-error-provenance-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const files = {
    'package.json': JSON.stringify({dependencies: {'@composable-svelte/core': '0.13.0-next.1'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js'}
    }),
    'entry.ts': source, ...additional
  };
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), content);
  }
  const graph = buildGraph({projectRoot, roots: ['entry.ts'], tsconfig: 'tsconfig.json',
    opaquePackages: [{name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'}]});
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph});
}
const reducer = body => `import {Effect, type Reducer} from '@composable-svelte/core';
const reduce: Reducer<any, any> = (state, action) => {${body}; return [state, Effect.none()];};`;
const detector = (result, name) => result.findings.filter(f => f.detector === name);
const complete = result => assert.equal(result.complete, true, JSON.stringify(result.errors));


for (const control of ['call', 'apply', 'bind']) test(`array ${control} uses the explicit receiver instead of its extraction source`, t => {
  const invoke = (target, receiver) => control === 'call' ? `${target}.call(${receiver},{id:'new'})`
    : control === 'apply' ? `${target}.apply(${receiver},[{id:'new'}])` : `${target}.bind(${receiver})({id:'new'})`;
  const fresh = analyze(t, reducer(`const copy=[]; ${invoke('state.items.push','copy')}`));
  complete(fresh); assert.deepEqual(fresh.findings, []); assert.deepEqual(fresh.limitations, []);
  const state = analyze(t, reducer(`${invoke('[].push','state.items')}`));
  complete(state); assert.equal(detector(state,'state-mutation').length,1); assert.deepEqual(state.limitations, []);
});

test('bound array arguments and receiver survive rebinding and control calls', t => {
  const result = analyze(t, reducer(`const fresh=[];
    const push=[].push.bind(state.items,{id:'bound'}).bind(fresh,{id:'later'});
    push.call(fresh,{id:'call'});`));
  complete(result); assert.equal(detector(result,'state-mutation').length,1); assert.deepEqual(result.limitations, []);
});

test('controlled and bound map preserve retained versus copied descendants', t => {
  for (const [callback, expected] of [['item=>item',1],['item=>({...item})',0]]) {
    const result=analyze(t,reducer(`const map=[].map.bind(state.items,${callback}); const result=map(); result[0].id='changed'`));
    complete(result); assert.equal(detector(result,'state-mutation').length,expected); assert.deepEqual(result.limitations, []);
  }
});

test('native identity follows local helper returns and nested destructuring', t => {
  const result = analyze(t, `function identity(value){return value;} const {nested:{Error:Native}}=identity({nested:globalThis});
    Native.prototype.route=history; class BusinessError extends Error {} new BusinessError().route.back();`);
  assert.equal(result.complete,false); assert.ok(result.errors.some(e=>e.construct==='class-inheritance'));
});

test('ambient mutations follow local helper and reflection aliases', t => {
  const result = analyze(t, `function ambient(){return globalThis;} const write=Reflect.set;
    write(ambient(),'Error',class Replacement{route=history;});
    class BusinessError extends Error {} new BusinessError().route.back();`);
  assert.equal(result.complete,false); assert.ok(result.errors.some(e=>e.construct==='class-inheritance'));
});

test('rebinding native aliases and passing scalar reads leaves the actual native base intact', t => {
  const result = analyze(t, `let Native=Error; Native=class Local {}; let prototype=Error.prototype; prototype={};
    function name(ctor){return ctor.name;} console.log(name(Error),typeof Error,{} instanceof Error,Error.prototype.message);
    class BusinessError extends Error {} new BusinessError('message');`);
  complete(result); assert.deepEqual(result.findings,[]);
});

test('native constructor exposure through an opaque heap argument remains explicit', t => {
  const result = analyze(t, `const envelope={nested:[Error]}; opaque(envelope);
    class BusinessError extends Error {} new BusinessError();`);
  assert.equal(result.complete,false); assert.ok(result.errors.some(e=>e.construct==='class-inheritance'));
});

test('native ambient identity survives a local module barrel', t => {
  const result=analyze(t, `import {ambient} from './barrel'; ambient.Error=class Replacement{route=history;};
    class BusinessError extends Error {} new BusinessError().route.back();`,{
      'ambient.ts':'export const ambient=globalThis;', 'barrel.ts':"export {ambient} from './ambient';"
    });
  assert.equal(result.complete,false); assert.ok(result.errors.some(e=>e.construct==='class-inheritance'));
});
