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

for (const field of ['entries', 'values', 'keys', 'map']) {
  test(`ordinary reducer data field ${field} supports copying and dynamic indexing`, t => {
    const result = analyze(t, reducer(`const copy = [...state.${field}]; const item = copy[action.index]; const id = item.id; copy[action.index] = copy[action.other]`));
    complete(result);
    assert.deepEqual(result.findings, []);
  });
}

test('plain object method-name fields retain ordinary data and real stored authority', t => {
  const clean = analyze(t, `const record = {entries: [{id: 'a'}], values: [{id: 'b'}], map: [{id:'c'}]};
  for (const item of [...record.entries, ...record.values, ...record.map]) {const id = item.id;}`);
  complete(clean);
  assert.deepEqual(clean.findings, []);
});

test('method-name data fields preserve stored browser authority', t => {
  const authority = analyze(t, `const record = {entries: [history]}; const methods = [...record.entries]; methods[0].back();`);
  complete(authority);
  assert.equal(detector(authority, 'history-write').length, 1);
});

test('actual and extracted array methods still preserve mutation and child identity', t => {
  const mutated = analyze(t, reducer(`const push = state.items.push; push({id:'new'}); state.items.map(item => item)[0].id = 'changed'`));
  complete(mutated);
  assert.equal(detector(mutated, 'state-mutation').length, 2);
});

test('fresh arrays from method-name fields remain independently mutable', t => {
  const fresh = analyze(t, reducer(`const copy = [...state.entries]; copy.push({id:'new'}); copy.sort((a,b)=>0); const mapped = state.entries.map(item=>({...item})); mapped[0].id = 'fresh'`));
  complete(fresh);
  assert.deepEqual(fresh.findings, []);
});

test('direct native Error subclass keeps constructor and own-method authority flow', t => {
  const clean = analyze(t, `export class RecordNotFoundError extends Error {
    constructor(message='Record not found') {super(message);this.name='RecordNotFoundError';}
    describe(){return this.message;}
  } const error = new RecordNotFoundError('missing'); error.describe();`);
  complete(clean);
  assert.deepEqual(clean.findings, []);
});

test('native Error subclass own constructor and methods retain browser authority', t => {
  const tracked = analyze(t, `class BusinessError extends Error {
    constructor(route){super('failed');this.route=route;}
    back(){this.route.back();}
  } new BusinessError(history).back();`);
  complete(tracked);
  assert.equal(detector(tracked, 'history-write').length, 1);
});

test('shadowed Error, generic inheritance and native cause authority cannot disappear', t => {
  for (const source of [
    `class Error {route(){return history;}} class Child extends Error {} new Child().route().back();`,
    `class Base {route(){return history;}} class Child extends Base {} new Child().route().back();`
  ]) {
    const result = analyze(t, source);
    assert.equal(result.complete, false);
    assert.ok(result.errors.some(e => e.construct === 'class-inheritance'));
  }
  const cause = analyze(t, `class BusinessError extends Error {constructor(){super('failed',{cause:history});}}
  new BusinessError().cause.back();`);
  assert.ok(!cause.complete || detector(cause, 'history-write').length > 0,
    'Error options authority must propagate or fail explicitly');
});


test('real array iterators and extracted methods keep authority elements', t => {
  const result = analyze(t, `const routes = [history]; const values = routes.values; const entries = routes.entries;
  values()[0].back(); entries()[0][1].back(); const mapped = routes.map(item => item); mapped[0].back();`);
  complete(result);
  assert.equal(detector(result, 'history-write').length, 3);
});

test('computed access on actual callable and browser authority is still explicit', t => {
  for (const source of [
    `const method = [].push; const result = method[unknownKey];`,
    `const route = history; const result = route[unknownKey];`
  ]) {
    const result = analyze(t, source);
    assert.equal(result.complete, false);
    assert.ok(result.errors.some(e => e.construct === 'computed-authority-access'));
  }
});

test('implicit native Error constructors cannot erase an options cause', t => {
  const result = analyze(t, `class BusinessError extends Error {}
  new BusinessError('failed', {cause:history}).cause.back();`);
  assert.ok(!result.complete || detector(result, 'history-write').length > 0);
});

test('native Error super member access does not silently resolve to this', t => {
  const result = analyze(t, `class BusinessError extends Error {label(){return super.toString();}}
  new BusinessError('failed').label();`);
  assert.equal(result.complete, false, 'inherited super member semantics require explicit support or refusal');
});

test('native Error alternate constructor return cannot erase browser authority', t => {
  const result = analyze(t, `class BusinessError extends Error {constructor(){super('failed');return history;}}
  new BusinessError().back();`);
  assert.ok(!result.complete || detector(result, 'history-write').length > 0);
});

test('reassigned native Error identity cannot gain the native-base exemption', t => {
  const result = analyze(t, `Error = class {route(){return history;}};
  class BusinessError extends Error {} new BusinessError().route().back();`);
  assert.equal(result.complete, false);
});

test('native Error base mutation through aliases, destructuring and global reflection is refused', t => {
  for (const mutation of [
    `const prototype = Error.prototype; prototype.route = history;`,
    `({Error} = {Error: class Replacement {}});`,
    `Object.assign(globalThis, {Error: class Replacement {}});`,
    `Reflect.set(window, 'Error', class Replacement {});`
  ]) {
    const result = analyze(t, `${mutation} class BusinessError extends Error {} new BusinessError();`);
    assert.equal(result.complete, false, mutation);
    assert.ok(result.errors.some(e => e.construct === 'class-inheritance'), mutation);
  }
});

test('ordinary native Error construction does not invalidate a direct native subclass', t => {
  const result = analyze(t, `const ordinary = Error('message');
  class BusinessError extends Error {constructor(){super('business');}}
  const business = new BusinessError();`);
  complete(result);
});
