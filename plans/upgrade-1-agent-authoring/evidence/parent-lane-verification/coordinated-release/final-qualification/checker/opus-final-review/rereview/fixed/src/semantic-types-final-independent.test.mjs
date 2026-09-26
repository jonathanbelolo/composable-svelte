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

const changingRecursive = `export {}; type Chain<T> = { value: T; next: Chain<History> }; declare const chain: Chain<number>; chain.next.value.pushState({}, '', '/escaped');`;
test('R1 changing recursive arguments cannot erase history authority without refusal',t=>{
 const f=fixture(t,changingRecursive);const next=f.authority.member(f.value('chain'),'next');const value=f.authority.member(next,'value');
 t.diagnostic(JSON.stringify({errors:f.seeder.errors,chain:[...f.value('chain')],nextValue:[...value]}));
 assert.ok(f.has(value,'history') || f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});
test('R1 end-to-end changing recursive argument cannot report complete clean routing analysis',t=>{
 const direct=fixture(t,changingRecursive.replace('Chain<number>','Chain<History>')).analyze();
 assert.ok(direct.errors.length>0 || direct.findings.some(f=>f.rule==='routing/no-manual-browser-authority'));
 const result=fixture(t,changingRecursive).analyze();t.diagnostic(JSON.stringify({complete:result.complete,errors:result.errors,findings:result.findings,limitations:result.limitations}));
 assert.ok(!result.complete || result.findings.some(f=>f.rule==='routing/no-manual-browser-authority'));
});
test('R2 ordinary class/interface merging remains data without authority diagnostics',t=>{
 const f=fixture(t,`export {}; class Props {} interface Props { title: string }; declare const value: Props;`);
 assert.equal(f.value('value').size,0);assert.deepEqual(f.seeder.errors,[]);
});
test('R2 authority-bearing class/interface merge is still refused',t=>{
 const f=fixture(t,`export {}; class Props {} interface Props { target: History }; declare const value: Props;`);
 assert.ok(f.has(f.authority.member(f.value('value'),'target'),'history')||f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});
test('R3 changing recursive ordinary data stays quiet',t=>{
 const f=fixture(t,`export {}; type Chain<T> = { value:T; next:Chain<string> }; declare const chain:Chain<number>;`);
 assert.equal(f.value('chain').size,0);assert.deepEqual(f.seeder.errors,[]);
});
test('R4 nested namespace-qualified authority is preserved or explicitly refused',t=>{
 const f=fixture(t,`export {}; declare namespace Outer { namespace Inner { type Nav = History; } } declare const nav:Outer.Inner.Nav; nav.pushState({},'', '/nested');`);
 const result=f.analyze();t.diagnostic(JSON.stringify({errors:f.seeder.errors,complete:result.complete,findings:result.findings,analysisErrors:result.errors}));
 assert.ok(f.has(f.value('nav'),'history') || f.seeder.errors.some(e=>e.code==='unsupported-authority-type') || !result.complete);
});
test('R5 class field reducer annotation does not pollute outer lexical binding',t=>{
 const f=fixture(t,`import type {Reducer} from '@composable-svelte/core'; let field=0; class Widget {field:Reducer<any,any> = ((s)=>[s,{}]);}`);
 const field=f.value('field');assert.equal(f.has(field,'reducer'),false);assert.deepEqual(f.seeder.errors,[]);
});
test('R6 interface merges are order-independent for current direct members',t=>{
 for(const declarations of [`interface Props {label:string} interface Props {nav:History}`,`interface Props {nav:History} interface Props {label:string}`]){
  const f=fixture(t,`export {}; ${declarations}; declare const value:Props;`);assert.ok(f.has(f.authority.member(f.value('value'),'nav'),'history'));assert.deepEqual(f.seeder.errors,[]);
 }
});
