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
import { buildValueFlow } from './semantic-flow.mjs';
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


test('A1 recursive interface changing arguments preserves authority or refuses', t => {
 const f=fixture(t,`export {}; interface Chain<T> { value:T; next:Chain<History> }; declare const chain:Chain<number>;`);
 assert.ok(f.has(f.authority.member(f.authority.member(f.value('chain'),'next'),'value'),'history') || f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});
test('A2 mutual recursion changing arguments preserves authority or refuses', t => {
 const f=fixture(t,`export {}; type Left<T>={value:T;right:Right}; type Right={left:Left<History>}; declare const chain:Left<number>;`);
 const history=f.authority.member(f.authority.member(f.authority.member(f.value('chain'),'right'),'left'),'value');
 assert.ok(f.has(history,'history') || f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});
test('A3 recursive generic ordinary wrappers remain quiet and finite', t => {
 const f=fixture(t,`export {}; type Chain<T>={value:T;next:Chain<T[]>}; declare const data:Chain<number>;`);
 for(let pass=0;pass<4;pass++)f.seeder.apply();assert.deepEqual(f.seeder.errors,[]);assert.equal(f.value('data').size,0);
});
test('A4 ambient nested ordinary type with a builtin name remains ordinary', t => {
 const f=fixture(t,`export {}; declare namespace Outer { namespace Inner { type History={label:string}; } } declare const data:Outer.Inner.History;`);
 assert.equal(f.value('data').size,0);assert.deepEqual(f.seeder.errors,[]);
});
test('A5 named local data import cannot masquerade as a namespace anchor',t=>{
 const f=fixture(t,`import type {Data} from './data'; declare const value:Data;`,{'data.ts':`export interface Data {title:string}`});assert.equal(f.value('value').size,0);assert.deepEqual(f.seeder.errors,[]);
});
test('A6 class reducer initializer reports actual callback without touching same-name local', t => {
 const f=fixture(t,`import type {Reducer} from '@composable-svelte/core'; let field=0; class Widget {field:Reducer<any,any> = ((s)=>[s,{}]);}`);
 const flow=buildValueFlow(f.context);const reports=[];const seeder=createTypeSeeds(f.context,flow,{onReducer(node,value){reports.push({node,value:new Set(value)});}});
 let settled=false;for(let pass=0;pass<10;pass++){const before=flow.revision;seeder.apply();flow.solve();if(before===flow.revision){settled=true;break;}}assert.ok(settled);
 const field=f.context.nodes.map(r=>r.node).find(ts.isPropertyDeclaration);assert.ok(field?.initializer);
 const report=reports.filter(r=>r.node===field.initializer).at(-1);assert.ok(report);assert.deepEqual(report.value,flow.value(field.initializer));assert.ok([...report.value].some(a=>flow.domain.describe(a).kind==='function'));
 const local=f.context.symbols.bindings.find(b=>b.name==='field'&&!b.typeOnly);assert.ok(local);assert.ok(![...flow.bindingValue(local)].some(a=>flow.domain.describe(a).kind==='authority'));
 const count=reports.length;seeder.apply();flow.solve();seeder.apply();assert.equal(reports.length,count);assert.deepEqual(flow.errors,[]);assert.deepEqual(seeder.errors,[]);
});
test('A7 multiple infer names stay local with ordinary inputs and false-branch outer authority retained',t=>{
 const f=fixture(t,`export {}; type Pair<T>=T extends [infer Location,infer History]?[Location,History]:History; declare const result:Pair<[number,string]>;`);
 // Branch joining intentionally retains the false History branch; inferred tuple
 // entries must not independently introduce Location authority.
 assert.equal(f.has(f.value('result'),'location'),false);assert.equal(f.has(f.value('result'),'history'),true);assert.deepEqual(f.seeder.errors,[]);
});
test('A8 repeated recursive refusal diagnostics remain deterministic', t=>{
 const f=fixture(t,`export {}; type Chain={nav:History;next:Chain}; declare const chain:Chain;`);const errors=f.seeder.errors;assert.ok(errors.length>0);
 for(let pass=0;pass<5;pass++)f.seeder.apply();assert.deepEqual(f.seeder.errors,errors);
});
