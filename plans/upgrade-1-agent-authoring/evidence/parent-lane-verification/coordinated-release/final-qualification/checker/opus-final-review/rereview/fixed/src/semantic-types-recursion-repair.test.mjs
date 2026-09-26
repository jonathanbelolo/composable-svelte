import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { buildGraph } from './graph.mjs';
import { buildSemanticContext } from './semantic-context.mjs';
import { createValueDomain } from './taint-values.mjs';
import { createAuthorityValues } from './authority-values.mjs';
import { createTypeSeeds } from './semantic-types.mjs';
import { analyzeSemantics } from './semantics.mjs';

function fixture(t, source, extra = {}) {
 const root = mkdtempSync(join(tmpdir(), 'independent-types-final-'));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 const files = { 'package.json': JSON.stringify({name:'witness', dependencies:{'@composable-svelte/core':'0.13.0-next.1',svelte:'5.57.0'}}), 'tsconfig.json':'{}',
 'node_modules/@composable-svelte/core/package.json':JSON.stringify({name:'@composable-svelte/core',version:'0.13.0-next.1',exports:{'.':'./index.js','./application':'./application.js'}}),
 'node_modules/svelte/package.json':JSON.stringify({name:'svelte',version:'5.57.0',exports:{'.':'./index.js'}}),
 'entry.ts': source, ...extra };
 for (const [name, value] of Object.entries(files)) { mkdirSync(dirname(join(root,name)),{recursive:true}); writeFileSync(join(root,name),value); }
 const graph = buildGraph({projectRoot:root, roots:['entry.ts'],tsconfig:'tsconfig.json',opaquePackages:[{name:'@composable-svelte/core',version:'0.13.0-next.1',provenance:'registry'},{name:'svelte',version:'5.57.0',provenance:'registry'}]});
 assert.deepEqual(graph.errors,[]); const context=buildSemanticContext({projectRoot:root,graph}); assert.equal(context.complete,true,JSON.stringify(context.errors));
 const domain=createValueDomain(), authority=createAuthorityValues(domain), values=new Map();
 const flow={domain,authority,value:()=>domain.empty(),seedNode:()=>{},seedBinding(binding,value){values.set(binding,domain.join(values.get(binding)??domain.empty(),value));}};
 const seeder=createTypeSeeds(context,flow);seeder.apply();
 const value=name=>domain.join(...[...values].filter(([b])=>b.name===name).map(([,v])=>v));
 const has=(v,id)=>[...v].some(a=>{const d=domain.describe(a);return d.kind==='authority'&&d.id===id;});
 return {root,graph,context,domain,authority,seeder,value,has,analyze:()=>analyzeSemantics({projectRoot:root,graph})};
}


test('recursive omitted defaults cannot introduce unreported authority', t => {
 const f=fixture(t,`export {}; type Chain<T=History>={value:T;next:Chain}; declare const value:Chain<number>; value.next.value.back();`);
 assert.ok(f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
 assert.equal(f.analyze().complete,false);
});

test('recursive shifted generic parameters refuse eventual authority but retain ordinary data', t => {
 for(const [argument,expected] of [['History',true],['string',false]]) {
  const f=fixture(t,`export {}; type Chain<A,B>={value:A;next:Chain<B,${argument}>}; declare const value:Chain<number,number>;`);
  assert.equal(f.seeder.errors.some(e=>e.code==='unsupported-authority-type'),expected);
 }
});

test('nested recursive type arguments remain finite without rejecting empty data', t => {
 for(const [argument,expected] of [['History',true],['number',false]]) {
  const f=fixture(t,`export {}; type Chain<T>={value:T;next:Chain<Chain<T>>}; declare const value:Chain<${argument}>;`);
  assert.equal(f.seeder.errors.some(e=>e.code==='unsupported-authority-type'),expected);
 }
});

test('merged class fields retain an explicit authority boundary and permit scalar data', t => {
 for(const [member,expected] of [["title!:string; count=1",false],["target!:History",true]]) {
  const f=fixture(t,`export {}; class Props{${member}} interface Props{label:string}; declare const value:Props;`);
  assert.equal(f.seeder.errors.some(e=>e.code==='unsupported-authority-type'),expected);
 }
});

test('local barrel imports preserve pure class/interface merge identity', t => {
 const f=fixture(t,`import type {Props} from './barrel'; declare const value:Props;`,{
  'props.ts':`export class Props{} export interface Props{title:string}`,
  'barrel.ts':`export type {Props} from './props';`
 });
 assert.deepEqual(f.seeder.errors,[]);assert.equal(f.value('value').size,0);
});

test('dotted and locally imported ambient namespace paths retain authority', t => {
 for(const f of [
  fixture(t,`export {}; declare namespace Outer.Inner{type Nav=History;} declare const value:Outer.Inner.Nav;`),
  fixture(t,`import type * as Types from './types'; declare const value:Types.Outer.Inner.Nav;`,{
   'types.ts':`export declare namespace Outer{namespace Inner{type Nav=History;}}`
  })
 ]) assert.ok(f.has(f.value('value'),'history')||f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});

test('recursive defaults containing another recursive instantiation retain authority refusal', t => {
 const f=fixture(t,`export {}; type Chain<T=Chain<History>>={value:T;next:Chain}; declare const value:Chain<number>; value.next.value.value.back();`);
 assert.ok(f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});
