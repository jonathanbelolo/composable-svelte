import {it,expect,vi} from 'vitest';
const fault=vi.hoisted(()=>({rejectNext:false}));
vi.mock('svelte',async importOriginal=>{
 const original=await importOriginal<typeof import('svelte')>();
 return {...original,tick:()=>{
  if(fault.rejectNext){fault.rejectNext=false;return Promise.reject(new Error('unrelated flush rejection'));}
  return original.tick();
 }};
});
import {tick} from 'svelte';
import {createStore} from '../src/lib/store.svelte.js';
import {composition,initial,rowsSlot} from './fixtures/FeatureViewsModel.js';
import {defineViews} from '../src/lib/application/view-definition.js';
import {bindViewDefinition} from '../src/lib/application/view-binding.js';
import {PlacementScope} from '../src/lib/application/renderer/placement.svelte.js';
import {expectConsole} from './helpers/console.js';
it('a rejected borrowed scheduling flush cannot retire the valid incumbent sibling',async()=>{
 const store=createStore({initialState:initial(0),...composition,dependencies:{step:1,trace:[]}});
 const definition=defineViews(composition,{workspace:{headless:true},worker:{headless:true},rows:{headless:true}});
 const views=bindViewDefinition(store,definition);
 const first=new PlacementScope(views,undefined);let second:PlacementScope|undefined;let third:PlacementScope|undefined;
 try{
  first.activate();await tick();await tick();expect(first.live).toBe(true);
  expectConsole('error',2);fault.rejectNext=true;
  second=new PlacementScope(views,undefined);second.activate();
  third=new PlacementScope(views,undefined);third.activate();
  await tick();await tick();await tick();
  await vi.waitFor(()=>expect(third!.live).toBe(false));
  expect(fault.rejectNext).toBe(false);expect(second.live).toBe(false);expect(first.live).toBe(true);
  store.dispatch(rowsSlot.at(2).wrap({type:'increment'}));
  expect(store.state.rows[1]?.state.count).toBe(3);
 }finally{fault.rejectNext=false;third?.dispose();second?.dispose();first.dispose();store.destroy();}
});

import Row from './fixtures/PlacementStructureRow.svelte';
it('owner-less internal handle collections still validate dynamic missing outlets',async()=>{
 const store=createStore({initialState:initial(0),...composition,dependencies:{step:1,trace:[]}});
 const definition=defineViews(composition,{workspace:{headless:true},worker:{headless:true},rows:{render:Row}});
 const views={...bindViewDefinition(store,definition)};
 const scope=new PlacementScope(views,undefined);
 try{
  const release=scope.claim(views.rows);scope.verify();scope.activate();await tick();await tick();
  expect(scope.live).toBe(true);expectConsole('error');release();await tick();await tick();
  expect(scope.live).toBe(false);
 }finally{scope.dispose();store.destroy();}
});
