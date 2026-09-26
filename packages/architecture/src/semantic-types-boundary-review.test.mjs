import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {createValueDomain} from './taint-values.mjs';
import {createAuthorityValues} from './authority-values.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createTypeSeeds} from './semantic-types.mjs';

function setupContext(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-types-opus-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({
      name: 'fixture',
      dependencies: {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'}
    }),
    'tsconfig.json': '{}',
    'node_modules/svelte/package.json': JSON.stringify({name:'svelte',version:'5.57.0',exports:{'.':'./index.js'}}),
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: '0.13.0-next.1',
      exports: {
        '.': './index.js',
        './application': './application.js'
      }
    }),
    ...files
  };
  for (const [name, value] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), value);
  }
  const graph = buildGraph({
    projectRoot,
    roots: Object.keys(files),
    tsconfig: 'tsconfig.json',
    opaquePackages: [{name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'}, {name:'svelte',version:'5.57.0',provenance:'registry'}]
  });
  assert.deepEqual(graph.errors, []);
  return buildSemanticContext({projectRoot, graph});
}

function createMockFlow() {
  const domain = createValueDomain();
  const authority = createAuthorityValues(domain);
  const bindingValues = new Map();
  const nodeValues = new Map();
  return {
    domain,
    authority,
    value(node) { return nodeValues.get(node) ?? domain.empty(); },
    seedBinding(binding, val) {
      const existing = bindingValues.get(binding) ?? domain.empty();
      bindingValues.set(binding, domain.join(existing, val));
    },
    seedNode(node, val) {
      const existing = nodeValues.get(node) ?? domain.empty();
      nodeValues.set(node, domain.join(existing, val));
    },
    bindingValues,
    nodeValues
  };
}

function stabilize(seeder, flow, maxPasses = 10) {
  let passes = 0;
  while (passes < maxPasses) {
    const before = flow.revision;
    seeder.apply();
    flow.solve();
    passes++;
    if (flow.revision === before) return passes;
  }
  assert.fail(`type/flow fixed point did not converge within ${maxPasses} passes`);
}

function hasAtom(domain, value, kind, id) {
  if (!value || !(value instanceof Set)) return false;
  return [...value].some((atom) => {
    const described = domain.describe(atom);
    return described.kind === kind && (id === undefined || described.id === id);
  });
}


function classify(t, source, others = {}) {
 const context=setupContext(t, {'entry.ts':source,...others});
 assert.equal(context.complete,true,JSON.stringify(context.errors));
 const flow=createMockFlow(), seeder=createTypeSeeds(context,flow);seeder.apply();
 const byName=name=>[...flow.bindingValues].filter(([binding])=>binding.name===name).map(([,value])=>value);
 const authorityAt=(name,id)=>byName(name).some(value=>hasAtom(flow.domain,value,'authority',id));
 return {context,flow,seeder,byName,authorityAt};
}
test('review: mutual recursive authority is refused while pure recursive data stays quiet', t => {
 const authority=classify(t,`import type {Store} from '@composable-svelte/core';
 type Left={right:Right}; type Right={left:Left;store:Store<any,any>}; let value:Left;`);
 const diagnostic=authority.seeder.errors.some(error=>error.code==='unsupported-authority-type');
 const value=authority.byName('value')[0]??authority.flow.domain.empty();
 const right=authority.flow.authority.member(value,'right');
 const left=authority.flow.authority.member(right,'left');
 const deeper=authority.flow.authority.member(authority.flow.authority.member(left,'right'),'store');
 assert.ok(diagnostic||hasAtom(authority.flow.domain,deeper,'authority','store'));
 const data=classify(t,`export {}; type Left={right?:Right}; type Right={left?:Left;label:string}; let value:Left;`);
 assert.deepEqual(data.seeder.errors,[]);assert.equal(data.byName('value').length,0);
});
test('review: conditional infer shadows only the true branch, retaining the false outer type', t => {
 const f=classify(t,`export {}; type Select<T> = T extends {item:infer Location} ? Location : Location;
 let value:Select<{other:number}>; type Plain<T> = T extends {item:infer Element} ? Element : never; let plain:Plain<{item:number}>;`);
 assert.equal(f.authorityAt('value','location'),true);
 assert.equal(f.authorityAt('plain','element'),false);assert.deepEqual(f.seeder.errors,[]);
});
test('review: same-scope interfaces merge without borrowing a nested scope declaration', t => {
 const f=classify(t,`import type {Store} from '@composable-svelte/core';
 interface Props {title:string;} let outside:Props;
 function inner(){interface Props{label:string;} interface Props{store:Store<any,any>;} let inside:Props;}`);
 assert.equal(f.byName('outside').length,0);
 const inside=f.byName('inside')[0]??f.flow.domain.empty();
 assert.ok(hasAtom(f.flow.domain,f.flow.authority.member(inside,'store'),'authority','store'));
});
test('review: script builtin augmentation differs from nested and module-local interfaces', t => {
 const script=classify(t,`interface History{local:true;} let historyValue:History; function nested(){interface History{nested:true;} let nestedValue:History;}`);
 assert.ok(script.authorityAt('historyValue','history')||script.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
 assert.equal(script.authorityAt('nestedValue','history'),false);
 const module=classify(t,`export {}; interface History{local:true;} let historyValue:History;`);
 assert.equal(module.authorityAt('historyValue','history'),false);assert.deepEqual(module.seeder.errors,[]);
});
test('review: imported value-only function preserves DOM type but imported class shadows it', t => {
 const fn=classify(t,`import {Location} from './helpers'; let loc:Location;`,{'helpers.ts':`export function Location(){return 'data';}`});
 assert.equal(fn.authorityAt('loc','location'),true);assert.deepEqual(fn.seeder.errors,[]);
 const cls=classify(t,`import {Location} from './helpers'; let loc:Location;`,{'helpers.ts':`export class Location{data=1;}`});
 assert.equal(cls.authorityAt('loc','location'),false);assert.deepEqual(cls.seeder.errors,[]);
});
test('review: class-interface merge cannot silently erase an authority-bearing declaration', t => {
 const f=classify(t,`import type {Store} from '@composable-svelte/core'; class Props{} interface Props{store:Store<any,any>;} let value:Props;`);
 const val=f.byName('value')[0]??f.flow.domain.empty();
 assert.ok(hasAtom(f.flow.domain,f.flow.authority.member(val,'store'),'authority','store')||f.seeder.errors.some(e=>e.code==='unsupported-authority-type'));
});

test('review: merged interfaces inside an ambient namespace retain all members', t => {
 const f=classify(t,`import type {Store} from '@composable-svelte/core';
 declare namespace Local {interface Props{title:string;} interface Props{store:Store<any,any>;} }
 let value:Local.Props;`);
 const val=f.byName('value')[0]??f.flow.domain.empty();
 assert.ok(hasAtom(f.flow.domain,f.flow.authority.member(val,'store'),'authority','store'));
 assert.deepEqual(f.seeder.errors,[]);
});
test('review: component-local interfaces are not global script augmentation', t => {
 const f=classify(t,'export {};',{'App.svelte':`<script lang="ts">interface History{local:true;} let local:History;</script>`});
 assert.equal(f.authorityAt('local','history'),false);assert.deepEqual(f.seeder.errors,[]);
});

test('review: value-only local shadow preserves an imported namespace in type position', t => {
 const f=classify(t,`import type * as Types from './types'; function f(){const Types=0; let value:Types.AppStore;}`,
 {'types.ts':`import type {Store} from '@composable-svelte/core'; export type AppStore=Store<any,any>;`});
 assert.equal(f.authorityAt('value','store'),true);assert.deepEqual(f.seeder.errors,[]);
});
