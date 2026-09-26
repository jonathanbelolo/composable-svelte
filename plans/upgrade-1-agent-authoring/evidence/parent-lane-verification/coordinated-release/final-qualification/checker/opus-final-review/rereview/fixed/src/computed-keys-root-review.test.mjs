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
    'node_modules/@composable-svelte/core/index.d.ts': `export type Reducer<S,A,D>=(state:S,action:A,deps:D)=>readonly [S,unknown]; export declare const Effect:{none():unknown};`,
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const roots = options.roots ?? ['entry.ts'];
  const graph = buildGraph({projectRoot, roots, tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.57.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph, ...options.analysis});
}

const quiet=r=>{assert.equal(r.complete,true,JSON.stringify(r.errors));assert.deepEqual(r.findings,[]);};
const refuses=r=>{assert.equal(r.complete,false);assert.ok(r.errors.some(e=>e.construct==='ComputedPropertyName'),JSON.stringify(r.errors));};
const manual=r=>{assert.ok(r.limitations.some(l=>l.code==='opaque-property-key-coercion'),JSON.stringify(r));};
const run=(t,source,extra={})=>fixture(t,{'entry.ts':source,...extra});
const io=r=>assert.ok(r.findings.some(f=>f.detector==='module-load-io'),JSON.stringify(r));

test('root: capability survives a dynamic overwrite on a copied container',t=>{
 const result=run(t,`declare const key:string; const base={safe:()=>1}; const copy={...base,[key]:()=>fetch('/bad')}; copy.safe();`); io(result); manual(result);
});
test('root: source of dynamic key is retained as manual evidence even when annotations assert purity',t=>{
 const result=run(t,`declare function remote():any; const key=remote() as string; export const value={[key]:42};`); manual(result);
});
test('root: primitive and coercion object callers cannot erase known coercion risk',t=>{
 const result=run(t,`function make(key){return {[key]:1}}; make('safe'); make({toString(){fetch('/bad');return 'x'}}); make('safe-again');`); refuses(result);
});
