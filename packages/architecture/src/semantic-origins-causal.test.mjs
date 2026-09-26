import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {compile} from 'svelte/compiler';
import {buildGraph} from './graph.mjs';
import {parseSemanticModules} from './semantic-parse.mjs';
import {buildSymbols} from './symbols.mjs';
import {buildOrigins} from './semantic-origins.mjs';

function actual(t, files) {
  const projectRoot=mkdtempSync(join(tmpdir(),'origins-opus-'));
  t.after(()=>rmSync(projectRoot,{recursive:true,force:true}));
  const all={'package.json':JSON.stringify({name:'fixture'}),'tsconfig.json':'{}',...files};
  for(const [name,text] of Object.entries(all)){mkdirSync(dirname(join(projectRoot,name)),{recursive:true});writeFileSync(join(projectRoot,name),text);}
  const graph=buildGraph({projectRoot,roots:Object.keys(files),tsconfig:'tsconfig.json',opaquePackages:[]});
  assert.deepEqual(graph.errors,[]);
  const parsed=parseSemanticModules({projectRoot,graph});assert.deepEqual(parsed.errors,[]);
  const symbols=buildSymbols({modules:parsed.modules});assert.deepEqual(symbols.errors,[]);
  return {modules:parsed.modules,symbols,graph,origins:buildOrigins({modules:parsed.modules,symbols,graph})};
}

test('O1 component defaults resolve directly and through named barrel reexports, never stars',t=>{
  const c=actual(t,{
    'Child.svelte':'<p>child</p>',
    'named.ts':"export {default as Button} from './Child.svelte';",
    'star.ts':"export * from './Child.svelte';",
    'entry.ts':"import Child from './Child.svelte'; import {Button} from './named'; import Missing from './star';"
  });
  assert.deepEqual(c.origins.resolveExport('Child.svelte','default'),[{kind:'component',path:'Child.svelte'}]);
  assert.deepEqual(c.origins.resolveExport('named.ts','Button'),[{kind:'component',path:'Child.svelte'}]);
  assert.deepEqual(c.origins.exportNames('star.ts'),[]);
  assert.ok(c.origins.errors.some(e=>e.construct==='unresolved-import-origin'&&e.path==='entry.ts'));
});

test('O3 exported declarations resolve their module binding with actual symbols',t=>{
  const c=actual(t,{'entry.ts':'export function filter(items, filter) { return items.filter(filter); } export class Store { value=1; }'});
  for(const name of ['filter','Store']){
    const value=c.origins.resolveExport('entry.ts',name)[0];
    assert.equal(value.kind,'binding');assert.equal(value.binding.scope.kind,'module');assert.equal(value.binding.name,name);
  }
});

test('O5 compiler-valid top-level snippets exported from module script resolve their binding',t=>{
  const source='<script module>export { row };</script>{#snippet row(item)}<li>{item.name}</li>{/snippet}';
  assert.deepEqual(compile(source,{filename:'Rows.svelte'}).warnings,[]);
  const c=actual(t,{
    'Rows.svelte':source,
    'entry.ts':"import {row} from './Rows.svelte'; export {row};"
  });
  assert.deepEqual(c.origins.errors,[]);
  const value=c.origins.resolveExport('Rows.svelte','row');
  assert.equal(value.length,1);assert.equal(value[0].kind,'binding');assert.equal(value[0].binding.name,'row');
  assert.deepEqual(c.origins.resolveExport('entry.ts','row'),value);
});

test('O5 compiler rejects an exported snippet that captures instance state',()=>{
  const source='<script module>export { row };</script><script>let prefix="x";</script>{#snippet row(item)}<li>{prefix}{item.name}</li>{/snippet}';
  assert.throws(()=>compile(source,{filename:'Rows.svelte'}),error=>error?.code==='snippet_invalid_export');
});

test('O6 namespace exports require an inspected semantic module target',t=>{
  const c=actual(t,{'target.ts':'export const x=1;','barrel.ts':"export * as ns from './target';"});
  const edge=c.graph.modules.find(m=>m.path==='barrel.ts').edges.find(e=>e.specifier==='./target');
  edge.target={type:'module',path:'ghost.ts'};
  const origins=buildOrigins({modules:c.modules,symbols:c.symbols,graph:c.graph});
  assert.ok(origins.errors.some(e=>e.construct==='unresolved-module-origin'&&e.path==='barrel.ts'));
  assert.deepEqual(origins.resolveExport('barrel.ts','ns'),[]);
});

test('O4/O6 cyclic and diamond stars terminate, enumerate, and report ambiguity eagerly',t=>{
  const files={'left.ts':'export const x=1;','right.ts':'export const x=2;','ambiguous.ts':"export * from './left'; export * from './right';"};
  for(let i=0;i<16;i++) files[`cycle${i}.ts`]=`export * from './cycle${(i+1)%16}';${i===0?" export * from './left';":''}`;
  const c=actual(t,files);
  assert.deepEqual(c.origins.exportNames('cycle8.ts'),['x']);
  assert.equal(c.origins.resolveExport('cycle8.ts','x').length,1);
  assert.ok(c.origins.errors.some(e=>e.construct==='ambiguous-star-export'&&e.path==='ambiguous.ts'));
  assert.ok(Object.isFrozen(c.origins.errors));
  assert.deepEqual([...c.origins.resolveAll('ambiguous.ts').keys()],['x']);
});

test('O2/C1 reject duplicate binding identities and module paths',t=>{
  const c=actual(t,{'a.ts':'export const a=1;','b.ts':'export const b=2;'});
  assert.equal(new Set(c.symbols.bindings.map(x=>x.id)).size,c.symbols.bindings.length);
  assert.throws(()=>buildOrigins({modules:[c.modules[0],c.modules[0]],symbols:c.symbols,graph:{modules:[]}}),/Duplicate or invalid semantic module path/);
  const one=c.symbols.bindings[0], two={...one};
  assert.throws(()=>buildOrigins({modules:c.modules,symbols:{...c.symbols,bindings:[one,two]},graph:{modules:[]}}),/Duplicate or invalid binding id/);
});
