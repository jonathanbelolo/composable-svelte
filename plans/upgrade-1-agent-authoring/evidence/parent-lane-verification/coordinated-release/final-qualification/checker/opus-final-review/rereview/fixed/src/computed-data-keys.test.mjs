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

test('data fields and contextual reducer keys retain explicit manual obligations',t=>{
 const reducer=run(t,`import {Effect,type Reducer} from '@composable-svelte/core';
 interface Entry{id:string; title:string} type State={records:Record<string,Entry>};
 type Action={type:'received';entry:Entry};
 export const reducer:Reducer<State,Action,{}>=(state,action)=>[
 {...state,records:{...state.records,[action.entry.id]:action.entry}},Effect.none()];`);quiet(reducer);manual(reducer);
 const simple=run(t,`export function record(key:string,value:number){return {[key]:value};}`);quiet(simple);manual(simple);
});
test('const key aliases and numeric primitive keys are supported',t=>{
 quiet(run(t,`function data(action:{entry:{id:string}}){const child=action.entry;return {[child.id]:1};}`));
 quiet(run(t,`const key=1;const result={[key]:2};`));
});
test('untracked key types remain explicit manual obligations rather than type proof',t=>{
 for(const type of ['any','unknown','object','String','{toString():string}']) {const result=run(t,`function data(key:${type}){return {[key]:1}}`);quiet(result);manual(result);}
});
test('implicit coercion objects remain refused including hidden conversion hooks',t=>{
 for(const method of ["toString(){fetch('/coerce');return 'x'}","valueOf(){fetch('/coerce');return 1}","[Symbol.toPrimitive](){fetch('/coerce');return 'x'}"])
  refuses(run(t,`const key={${method}};const result={[key]:1};`));
});
test('known objects hidden by asserted primitive types remain refused',t=>{
 refuses(run(t,`const value={toString(){fetch('/coerce');return 'x'}};const key=value as unknown as string;const result={[key]:1};`));
 refuses(run(t,`let key:string='a';key=({toString(){fetch('/x');return 'x'}} as any);const result={[key]:1}`));
});
test('asserted unknown sources and overwritten keys remain explicit manual obligations',t=>{
 for(const source of [
  `declare function get():unknown;const key=get() as string;const result={[key]:1};`,
  `function data(key:unknown){const alias=key as string;return {[alias]:1}}`,
  `function data(key:string){key=unknownKey() as string;return {[key]:1}}declare function unknownKey():unknown;`
 ]) {const result=run(t,source);assert.equal(result.complete,true,JSON.stringify(result.errors));manual(result);}
});
test('key expression side effects are still analyzed',t=>{
 const result=run(t,`declare const key:string;const record={[(fetch('/key'),key)]:1};`);
 assert.equal(result.complete,true,JSON.stringify(result.errors));manual(result);io(result);
});
test('dynamic values preserve callable capabilities through static reads',t=>{
 io(run(t,`const key='run';const record={[key]:fetch};record.run('/bad');`));
 io(run(t,`const key='run';const record={[key]:()=>fetch('/bad')};record.run();`));
});
test('dynamic capability values survive spreads and key collisions',t=>{
 io(run(t,`declare const key:string;const first={[key]:fetch};const second={...first,safe:()=>1};second.run('/bad');`));
 io(run(t,`declare const key:string;const first={run:()=>1,[key]:fetch};first.run('/bad');`));
});
test('computed __proto__ stores an own callable data field rather than changing prototype',t=>{
 io(run(t,`const key='__proto__';const record={[key]:fetch};record.__proto__('/bad');`));
});
test('late object arguments invalidate apparently primitive parameter keys',t=>{
 refuses(run(t,`function data(key:string){return {[key]:1}}data({toString(){fetch('/bad');return 'x'}} as any);`));
});
test('computed methods and unsupported expression forms remain explicit limitations',t=>{
 refuses(run(t,`declare const key:string;const record={[key](){return 1}};`));
 const indexed=run(t,`function data(keys:string[]){return {[keys[0]]:1}}`);quiet(indexed);manual(indexed);
});
test('an asserted opaque assignment to a key field cannot acquire primitive proof',t=>{
 const result=run(t,`declare function external():unknown;function data(action:{id:string}){action.id=external() as string;return {[action.id]:1}}`);assert.equal(result.complete,true,JSON.stringify(result.errors));manual(result);
});
