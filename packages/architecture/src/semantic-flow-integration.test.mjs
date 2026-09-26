// Independent integration controls: real source graph, not pre-tainted AST stubs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';

function fixture(t,files,options) {
 const projectRoot=mkdtempSync(join(tmpdir(),'flow-independent-'));
 t.after(()=>rmSync(projectRoot,{recursive:true,force:true}));
 const all={'package.json':'{"name":"fixture"}','tsconfig.json':'{}',...files};
 for(const [name,source] of Object.entries(all)) {mkdirSync(dirname(join(projectRoot,name)),{recursive:true});writeFileSync(join(projectRoot,name),source);}
 const graph=buildGraph({projectRoot,roots:Object.keys(files),tsconfig:'tsconfig.json',opaquePackages:[]});
 assert.deepEqual(graph.errors,[]);
 const context=buildSemanticContext({projectRoot,graph});assert.deepEqual(context.errors,[]);
 const flow=buildValueFlow(context,options);flow.solve();
 const binding=(name)=>{const matches=context.symbols.bindings.filter(b=>b.name===name);assert.equal(matches.length,1,`unique ${name}`);return matches[0];};
 const kinds=(value)=>[...value].map(a=>flow.domain.describe(a));
 return {context,flow,binding,kinds,has:(value,kind,id)=>kinds(value).some(a=>a.kind===kind&&a.id===id)};
}
function complete(f){assert.deepEqual(f.flow.errors,[]);assert.equal(f.flow.complete,true);}

test('cross-module helper aliases and local barrel return preserve history authority',(t)=>{
 const f=fixture(t,{'a.ts':'export function identity(x) { return x; }','b.ts':'export {identity as pass} from "./a";','entry.ts':'import {pass} from "./b"; const output = pass(window.history);'});
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});

test('same-spelled domain values and shadowed globals stay ordinary data',(t)=>{
 const f=fixture(t,{'entry.ts':'const history={pushState(){return 42;}}; function call(location){ return location; } const output=call(history); output.pushState();'});
 complete(f);assert.equal(f.kinds(f.flow.bindingValue(f.binding('output'))).some(a=>a.kind==='authority'),false);
});

test('rest then destructuring transfers the second actual argument',(t)=>{
 const f=fixture(t,{'entry.ts':'function pick(first,...rest){ const [{handle}]=rest; return handle; } const output=pick(1,{handle:history});'});
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});

test('shallow copies remove container state identity but retain nested aliases',(t)=>{
 const f=fixture(t,{'entry.ts':'function reducer(state){ const copy={...state}; const nested=copy.items; const array=[...state.items]; const child=array[0]; return copy; }'});
 f.flow.seedBinding(f.binding('state'),f.flow.domain.atom('state','input'));f.flow.solve();complete(f);
 assert.equal(f.has(f.flow.bindingValue(f.binding('copy')),'state','input'),false);
 assert.ok(f.has(f.flow.bindingValue(f.binding('nested')),'state','input'));
 assert.equal(f.has(f.flow.bindingValue(f.binding('array')),'state','input'),false);
 assert.ok(f.has(f.flow.bindingValue(f.binding('child')),'state','input'));
});

test('class field aliases survive construction and method return',(t)=>{
 const f=fixture(t,{'entry.ts':'class Controller { handle; constructor(value){this.handle=value;} read(){return this.handle;} } const c=new Controller(history); const output=c.read();'});
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});

test('literal dynamic import namespace preserves returned exported authority',(t)=>{
 const f=fixture(t,{'authority.ts':'export const handle=history;','entry.ts':'const module = await import("./authority"); const output=module.handle;'});
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});

test('recursive local calls converge without losing propagated authorities',(t)=>{
 const f=fixture(t,{'entry.ts':'function left(value){ return value || right(value); } function right(value){return left(value);} const output=left(history);'});
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});

test('dynamic computed authority access is an analysis error with original source span',(t)=>{
 const f=fixture(t,{'entry.ts':'const key="history"; const output=window[key];'});
 assert.equal(f.flow.complete,false);
 const error=f.flow.errors.find(e=>e.construct==='computed-authority-access');assert.ok(error);
 assert.equal(error.path,'entry.ts');assert.ok(error.span.start.offset>=0);assert.ok(error.span.end.offset>error.span.start.offset);
});

test('late seed is reflected by a second solve and value queries',(t)=>{
 const f=fixture(t,{'entry.ts':'function identity(x){return x;} const output=identity(input); let input;'});
 assert.equal(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'),false);
 f.flow.seedBinding(f.binding('input'),f.flow.authority.authority('history'));f.flow.solve();complete(f);
 assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
 const read=f.context.nodes.find(r=>ts.isIdentifier(r.node)&&r.node.text==='output'&&r.node.parent?.name===r.node);
 assert.ok(read);assert.ok(f.has(f.flow.value(read.node),'authority','history'));
});


test('destructured browser method preserves its authority receiver',(t)=>{
 const f=fixture(t,{'entry.ts':'const {pushState: navigate}=history; navigate({}, "", "/");'});
 complete(f);const value=f.flow.bindingValue(f.binding('navigate'));
 assert.ok([...value].some(a=>f.flow.authority.methodParts(a)?.[1]==='pushState'));
});

test('node seeding participates inside nested expressions, not only root queries',(t)=>{
 const f=fixture(t,{'entry.ts':'const output=getProps().store;'});
 const call=f.context.nodes.find(r=>ts.isCallExpression(r.node));assert.ok(call);
 const props=f.flow.domain.allocate('typed-props');f.flow.domain.write(props,'store',f.flow.authority.authority('store'));
 f.flow.seedNode(call.node,props);f.flow.solve();complete(f);
 assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','store'));
});

test('unknown authority projection cannot silently become complete',(t)=>{
 const f=fixture(t,{'entry.ts':'let x=window; x=x[key];'});
 assert.equal(f.flow.complete,false);
 assert.ok(f.flow.errors.some(e=>e.construct==='computed-authority-access'));
});

test('object rest is a new container retaining unexcluded authority properties',(t)=>{
 const f=fixture(t,{'entry.ts':'const object={skip:1,handle:history}; const {skip,...rest}=object; const output=rest.handle;'});
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});

test('direct authority spread reaches extracted descendants or explicitly refuses analysis',(t)=>{
 const f=fixture(t,{'entry.ts':'const copy={...window}; const output=copy.history;'});
 // Supported projection is expected with the repaired value domain.
 complete(f);assert.ok(f.has(f.flow.bindingValue(f.binding('output')),'authority','history'));
});
