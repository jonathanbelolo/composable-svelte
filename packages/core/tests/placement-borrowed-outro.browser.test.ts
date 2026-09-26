import {it,expect,vi} from 'vitest';
import {mount,unmount,tick} from 'svelte';
import {createStore} from '../src/lib/store.svelte.js';
import {composition,initial,rowsSlot} from './fixtures/FeatureViewsModel.js';
import Fixture from './fixtures/PlacementBorrowedOutro.svelte';
import {expectConsole} from './helpers/console.js';
it('shares borrowed layout activity across relocation and reversal, while rejecting a truly live duplicate',async()=>{
 const store=createStore({initialState:initial(0),...composition,dependencies:{step:1,trace:[]}});
 const target=document.createElement('div');document.body.append(target);
 const component=mount(Fixture,{target,props:{store}});
 try{
  await tick();
  const first=target.querySelector('[data-location="first"]')!;
  const move=target.querySelector<HTMLButtonElement>('[data-move]')!;
  move.click();await tick();await tick();await tick();
  expect(first.isConnected).toBe(true);
  await vi.waitFor(()=>expect(first.getAnimations().length).toBeGreaterThan(0));
  store.dispatch(rowsSlot.at(1).wrap({type:'increment'}));await tick();
  expect(target.querySelector('[data-location="second"] [data-row="row1"]')?.getAttribute('data-count')).toBe('2');
  move.click();await tick();await tick();await tick();
  expect(target.querySelector('[data-location="first"]')).toBe(first);
  store.dispatch(rowsSlot.at(1).wrap({type:'increment'}));await tick();
  expect(first.querySelector('[data-row="row1"]')?.getAttribute('data-count')).toBe('3');
  expectConsole('error');
  target.querySelector<HTMLButtonElement>('[data-duplicate]')!.click();
  await tick();await tick();await tick();
  expect(target.querySelector('[data-location="duplicate"]')).not.toBeNull();
  await vi.waitFor(()=>expect(target.querySelectorAll('[data-location="duplicate"] [data-row]')).toHaveLength(0));
  expect(first.querySelector('[data-row="row1"]')).not.toBeNull();
  store.dispatch(rowsSlot.at(1).wrap({type:'increment'}));await tick();
  expect(first.querySelector('[data-row="row1"]')?.getAttribute('data-count')).toBe('4');
 }finally{await unmount(component);store.destroy();target.remove();}
});

import Owned from './fixtures/PlacementOwnedLayoutOutro.svelte';
import type {ApplicationInstance} from '../src/lib/application/index.js';
import type {Root,Action} from './fixtures/FeatureViewsModel.js';
import type {TargetRegistry} from '../src/lib/application/renderer/target-registry.js';
it('registry-owned sibling layouts relocate, reverse, and retire the outgoing scope',async()=>{
 const target=document.createElement('div');document.body.append(target);
 let app!:ApplicationInstance<Root,Action>,registry!:TargetRegistry;
 const component=mount(Owned,{target,props:{onApp:value=>app=value,onRegistry:value=>registry=value}});
 try{
  await tick();const first=target.querySelector('[data-location="first"]')!;
  const move=target.querySelector<HTMLButtonElement>('[data-move]')!;
  move.click();await tick();await tick();await tick();
  await vi.waitFor(()=>expect(first.getAnimations().length).toBeGreaterThan(0));
  expect(registry.isAttached).toBe(true);
  app.store.dispatch(rowsSlot.at(1).wrap({type:'increment'}));await tick();
  expect(target.querySelector('[data-location="second"] [data-row="row1"]')?.getAttribute('data-count')).toBe('2');
  move.click();await tick();await tick();await tick();
  expect(target.querySelector('[data-location="first"]')).toBe(first);
  app.store.dispatch(rowsSlot.at(1).wrap({type:'increment'}));await tick();
  expect(first.querySelector('[data-row="row1"]')?.getAttribute('data-count')).toBe('3');
  await vi.waitFor(async()=>{
   for(const animation of target.getAnimations({subtree:true}))animation.finish();
   await tick();expect(target.querySelectorAll('[data-location]')).toHaveLength(1);
  });
  expect(registry.isAttached).toBe(true);
 }finally{await unmount(component);target.remove();}
});
