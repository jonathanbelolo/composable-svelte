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


for (const [name, source] of [
  ['reflection call', `Reflect.set.call(Reflect,globalThis,'Error',class Replacement {route=history});`],
  ['bound reflection', `const assign=Object.assign.bind(null,globalThis); assign({Error:class Replacement {route=history}});`],
  ['prototype destructuring', `const {prototype}=Error; prototype.route=history;`],
]) test(`root review refuses native base change through ${name}`, t => {
  const result=analyze(t,source+`class BusinessError extends Error {} new BusinessError().route.back();`);
  assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.construct==='class-inheritance'));
});
test('root review tracks a bound native-array callback browser authority', t => {
 const result=analyze(t,reducer(`const mapped=[].map.bind(state.items, item=>{history.back();return item}); mapped();`));
 complete(result); assert.ok(result.findings.some(f=>f.rule==='reducers/pure-decisions' && f.detector==='impure-primitive')); assert.deepEqual(result.limitations,[]);
});
