import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

function analyze(t, source) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'data-field-error-controls-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const files = {
    'package.json': JSON.stringify({dependencies: {'@composable-svelte/core': '0.13.0-next.1'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js'}
    }),
    'entry.ts': source
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


for (const [label, mutation] of [
  ['global alias property assignment', `const ambient=globalThis; ambient.Error=class Replacement {constructor(){this.route=history;}};`],
  ['global Error destructuring alias', `const {Error: Native}=globalThis; Native.prototype.route=history;`],
  ['destructured native prototype alias', `const {prototype}=Error; prototype.route=history;`]
]) test(`independent native Error guard rejects ${label}`, t => {
  const result=analyze(t, `${mutation} class BusinessError extends Error {} new BusinessError().route.back();`);
  assert.ok(!result.complete || detector(result,'history-write').length>0,JSON.stringify(result));
});

for(const expression of ['value instanceof Error','Error.name']) test(`ordinary Error expression ${expression} does not compromise the native constructor`, t => {
    const result=analyze(t, `const value={}; console.log(${expression}); class BusinessError extends Error {} new BusinessError('message');`);
    complete(result);
    assert.deepEqual(result.findings,[]);
});

for(const [label, operation] of [
  ['call',`state.items.push.call(state.items,{id:'new'})`],
  ['apply',`const push=state.items.push; push.apply(state.items,[{id:'new'}])`],
  ['bind',`const push=state.items.push.bind(state.items); push({id:'new'})`]
]) test(`tentative state mutator ${label} retains mutation or explicitly refuses`, t => {
  const result=analyze(t,reducer(operation));
  assert.ok(!result.complete || detector(result,'state-mutation').length>0,JSON.stringify(result));
});

for(const operation of [
    `state.items.map.call(state.items,item=>item)[0].id='changed'`,
    `state.items.map.apply(state.items,[item=>item])[0].id='changed'`
  ]) test(`tentative map callback descendants survive ${operation}`, t => {
    const result=analyze(t,reducer(operation));
    assert.ok(!result.complete || detector(result,'state-mutation').length>0,JSON.stringify(result));
});

test('mixed definite method and ordinary state data does not erase real-method projection refusal', t => {
  const result=analyze(t,reducer(`const mixed=action.flag?[history].values:state.values; const copy=[...mixed]; copy[0].back()`));
  assert.ok(!result.complete || detector(result,'history-write').length>0,JSON.stringify(result));
});

test('literal own methods named map and values retain ordinary local callback execution', t => {
  const result=analyze(t, `const own={map(callback){return callback(history)},values(){return [history]}}; own.map(route=>route.back()); own.values()[0].back();`);
  complete(result);assert.equal(detector(result,'history-write').length,2);
});


for(const [label,mutation] of [
  ['reassigned global alias',`let ambient; ambient=globalThis; ambient.Error=class Replacement {constructor(){this.route=history;}};`],
  ['reassigned Error alias',`let Native; Native=Error; Native.prototype.route=history;`],
  ['computed Reflect set',`Reflect['set'](globalThis,'Error',class Replacement {constructor(){this.route=history;}});`],
  ['destructured Reflect set',`const {set}=Reflect; set(globalThis,'Error',class Replacement {constructor(){this.route=history;}});`]
]) test(`native Error compromise via ${label} remains detected or refused`, t => {
  const result=analyze(t,`${mutation} class BusinessError extends Error {} new BusinessError().route.back();`);
  assert.ok(!result.complete || result.findings.length>0,JSON.stringify(result));
});
