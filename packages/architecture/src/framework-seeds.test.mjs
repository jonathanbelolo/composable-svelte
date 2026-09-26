import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createFrameworkSeeds} from './framework-seeds.mjs';
function fixture(t,source) {
 const projectRoot=mkdtempSync(join(tmpdir(),'framework-seeds-'));t.after(()=>rmSync(projectRoot,{recursive:true,force:true}));
 const files={'package.json':'{"name":"fixture","dependencies":{"@composable-svelte/core":"0.13.0-next.1"}}','tsconfig.json':'{}','entry.ts':source,'node_modules/@composable-svelte/core/package.json':JSON.stringify({name:'@composable-svelte/core',version:'0.13.0-next.1',exports:{'.':'./index.js','./application':'./application.js','./navigation':'./navigation.js'}})};
 for(const [name,text]of Object.entries(files)){mkdirSync(dirname(join(projectRoot,name)),{recursive:true});writeFileSync(join(projectRoot,name),text);}
 const graph=buildGraph({projectRoot,roots:['entry.ts'],tsconfig:'tsconfig.json',opaquePackages:[{name:'@composable-svelte/core',version:'0.13.0-next.1',provenance:'registry'}]});assert.deepEqual(graph.errors,[]);
 const context=buildSemanticContext({projectRoot,graph});const seeds=createFrameworkSeeds(context);const flow=buildValueFlow(context,{onInvoke:seeds.onInvoke});
 assert.deepEqual(flow.errors,[]);assert.equal(flow.complete,true);
 const ids=(map)=>new Set([...map.values()].flatMap(r=>[...r.value]).filter(a=>flow.domain.describe(a).kind==='function').map(a=>flow.domain.describe(a).id));
 const fn=(name)=>[...context.functions.values()].find(f=>f.node.name?.text===name)?.id;
 return {context,seeds,flow,ids,fn};
}
test('real reducer and pure callbacks distinguished from deferred Effect body',(t)=>{
 const f=fixture(t,`import {Effect} from '@composable-svelte/core'; import {defineApplication} from '@composable-svelte/core/application'; function run(){return Effect.none();} function reducer(state,action){return [state,Effect.run(run)];} function serialize(state){return '/';} const app=defineApplication(reducer,{routing:{serialize}});`);
 assert.ok(f.ids(f.seeds.reducers).has(f.fn('reducer')));assert.ok(f.ids(f.seeds.effects).has(f.fn('run')));assert.ok(f.ids(f.seeds.decisions).has(f.fn('serialize')));assert.equal(f.ids(f.seeds.reducers).has(f.fn('run')),false);
 const state=f.context.symbols.bindings.find(b=>b.name==='state'&&b.scope===f.context.functions.get(f.fn('reducer')).scope);
 assert.ok([...f.flow.bindingValue(state)].some(a=>f.flow.domain.describe(a).kind==='state'));
});
test('same named application functions have no framework role',(t)=>{
 const f=fixture(t,'function defineApplication(x){return x;} function reducer(state){return state;} defineApplication(reducer);');assert.equal(f.ids(f.seeds.reducers).size,0);
});
test('store dependency closures are wiring while reducer is decision entry',(t)=>{
 const f=fixture(t,`import {createStore} from '@composable-svelte/core'; function reducer(state){return [state];} function load(){return fetch('/');} createStore({reducer,dependencies:{load}});`);
 assert.ok(f.ids(f.seeds.reducers).has(f.fn('reducer')));assert.ok(f.ids(f.seeds.wiring).has(f.fn('load')));assert.equal(f.ids(f.seeds.reducers).has(f.fn('load')),false);
});
test('builder child reducers and build result retain public composition identity',(t)=>{
 const f=fixture(t,`import {ManagedIntegrationBuilder} from '@composable-svelte/core/application'; function parent(s){return [s];} function child(s){return [s];} const result=new ManagedIntegrationBuilder(parent).with({},child).build();`);
 assert.ok(f.ids(f.seeds.reducers).has(f.fn('parent')));assert.ok(f.ids(f.seeds.reducers).has(f.fn('child')));
 const b=f.context.symbols.bindings.find(b=>b.name==='result');assert.ok([...f.flow.bindingValue(b)].some(a=>f.flow.domain.describe(a).id==='composition'));
});
