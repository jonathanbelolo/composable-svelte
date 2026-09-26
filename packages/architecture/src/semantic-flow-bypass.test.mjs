import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
function fixture(t,source) {
 const projectRoot=mkdtempSync(join(tmpdir(),'flow-bypass-'));t.after(()=>rmSync(projectRoot,{recursive:true,force:true}));
 for(const [name,text]of Object.entries({'package.json':'{"name":"fixture"}','tsconfig.json':'{}','entry.ts':source})){mkdirSync(dirname(join(projectRoot,name)),{recursive:true});writeFileSync(join(projectRoot,name),text);}
 const graph=buildGraph({projectRoot,roots:['entry.ts'],tsconfig:'tsconfig.json',opaquePackages:[]});assert.deepEqual(graph.errors,[]);
 const context=buildSemanticContext({projectRoot,graph});const flow=buildValueFlow(context);
 const binding=name=>{const matches=context.symbols.bindings.filter(b=>b.name===name);assert.equal(matches.length,1);return matches[0];};
 return {context,flow,binding,has:(name,kind,id)=>[...flow.bindingValue(binding(name))].some(a=>{const d=flow.domain.describe(a);return d.kind===kind&&(!id||d.id===id);})};
}
test('for-of element binding retains reducer descendant aliases',(t)=>{
 const f=fixture(t,'function reducer(state){for(const item of state.items){const output=item;}}');f.flow.seedBinding(f.binding('state'),f.flow.domain.atom('state','input'));f.flow.solve();
 assert.deepEqual(f.flow.errors,[]);assert.ok(f.has('output','state','input'));
});
test('getters cannot erase a routing authority without an analysis error',(t)=>{
 const f=fixture(t,'class Box { get value(){return history;} } const output=new Box().value;');
 assert.ok(f.has('output','authority','history')||!f.flow.complete,'getter authority must propagate or analysis must refuse');
});
test('inherited methods cannot disappear into a clean flow result',(t)=>{
 const f=fixture(t,'class Base {read(){return history;}} class Child extends Base {} const output=new Child().read();');
 assert.ok(f.has('output','authority','history')||!f.flow.complete,'class inheritance must be modeled or explicitly unsupported');
});
test('array iteration callback receives original descendant state',(t)=>{
 const f=fixture(t,'function reducer(state){state.items.forEach(item=>{const output=item;});}');f.flow.seedBinding(f.binding('state'),f.flow.domain.atom('state','input'));f.flow.solve();
 assert.ok(f.has('output','state','input')||!f.flow.complete,'callback state cannot silently vanish');
});
test('Object.assign fresh copy retains state descendants while container stays fresh',(t)=>{
 const f=fixture(t,'function reducer(state){const copy=Object.assign({},state);const output=copy.items;}');f.flow.seedBinding(f.binding('state'),f.flow.domain.atom('state','input'));f.flow.solve();
 assert.ok(f.has('output','state','input')||!f.flow.complete,'Object.assign must preserve descendants or refuse');
 if(f.flow.complete)assert.equal(f.has('copy','state','input'),false);
});
