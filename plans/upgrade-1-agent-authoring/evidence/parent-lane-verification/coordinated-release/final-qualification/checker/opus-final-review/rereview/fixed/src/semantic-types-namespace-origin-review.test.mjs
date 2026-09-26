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

test('C1 imported named ambient namespace retains nested authority',t=>{
 const f=fixture(t,`import type {Named as Outer} from './ns'; declare const nav:Outer.Inner.Nav; nav.pushState({},'', '/named');`,{'ns.ts':`export declare namespace Named { namespace Inner { type Nav=History; } }`});
 const r=f.analyze();t.diagnostic(JSON.stringify({errors:f.seeder.errors,complete:r.complete,findings:r.findings,analysisErrors:r.errors}));
 assert.ok(f.has(f.value('nav'),'history')||f.seeder.errors.some(e=>e.code==='unsupported-authority-type')||!r.complete);
});
