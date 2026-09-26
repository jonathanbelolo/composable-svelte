import {it,expect,vi} from 'vitest';
import {mount,unmount,tick,flushSync,createRawSnippet} from 'svelte';
import Fixture from './fixtures/ApplicationBasic.svelte';
import {ApplicationHost,type ApplicationInstance} from '../src/lib/application/index.js';
import type {State,Action} from './fixtures/ApplicationBasicModel.js';
function setup(count=0,step=1,fail=false){const target=document.createElement('div');document.body.append(target);const events:string[]=[];let app!:ApplicationInstance<State,Action>;const component=mount(Fixture,{target,props:{initialCount:count,dependencies:{step,events},fail,onApp:value=>{app=value;}}});return {target,events,app,component};}
it('counter DI and independent instances retain reactive state and own cleanup',async()=>{
 const a=setup(2,3),b=setup(10,7);await tick();a.target.querySelector('button')!.click();await tick();expect(a.target.querySelector('button')!.textContent).toBe('5');expect(b.target.querySelector('button')!.textContent).toBe('10');expect(a.events).toEqual(['start']);expect(b.events).toEqual(['start']);
 await unmount(a.component);expect(a.events).toEqual(['start','cleanup']);expect(b.events).toEqual(['start']);await unmount(b.component);expect(b.events).toEqual(['start','cleanup']);a.target.remove();b.target.remove();
});
it('host remount does not restart same root lifetime and root remains usable while unhosted',async()=>{
 const a=setup();await tick();a.component.hide();await tick();a.app.store.dispatch({type:'increment'});expect(a.app.store.state.count).toBe(1);a.component.show();await tick();expect(a.events).toEqual(['start']);expect(a.target.querySelector('button')!.textContent).toBe('1');await unmount(a.component);expect(a.events).toEqual(['start','cleanup']);a.target.remove();
});
it('unmount before mount activation never starts pending startup',async()=>{
 const a=setup();await unmount(a.component);await tick();expect(a.events).toEqual([]);a.target.remove();
});
it('duplicate host leaves first live host intact',async()=>{
 const a=setup();await tick();const target=document.createElement('div');document.body.append(target);const children=createRawSnippet(()=>({render:()=>'<span>duplicate</span>'}));expect(()=>mount(ApplicationHost,{target,props:{app:a.app,children}})).toThrow('already');a.app.store.dispatch({type:'increment'});expect(a.app.store.state.count).toBe(1);await unmount(a.component);expect(a.events).toEqual(['start','cleanup']);a.target.remove();target.remove();
});
it('FIFO reducer error aborts failed turn, drains unrelated queued work and then reports',async()=>{
 const a=setup();await tick();const trace:number[]=[];let queued=false;const off=a.app.store.subscribe(state=>{trace.push(state.count);if(state.count===1&&!queued){queued=true;a.app.store.dispatch({type:'explode'});a.app.store.dispatch({type:'increment'});}});
 expect(()=>a.app.store.dispatch({type:'increment'})).toThrow('reducer exploded');expect(a.app.store.state.count).toBe(2);expect(trace).toEqual([0,1,2]);off();await unmount(a.component);a.target.remove();
});
it('failed child initialization retires the captured app root',()=>{
 const target=document.createElement('div');document.body.append(target);let app!:ApplicationInstance<State,Action>;expect(()=>mount(Fixture,{target,props:{dependencies:{step:1,events:[]},fail:true,onApp:value=>{app=value;}}})).toThrow('application child failed');const before=app.store.state;const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});try{app.store.dispatch({type:'increment'});expect(app.store.state).toBe(before);}finally{warn.mockRestore();target.remove();}
});

it('accepts structurally typed prototype options and snapshot values',async()=>{
 const target=document.createElement('div');document.body.append(target);const events:string[]=[];
 let dependencyReads=0;
 class Initial {get state(){return {count:7,loaded:true};}}
 class Options {get dependencies(){dependencyReads++;return {step:3,events};}get initial(){return new Initial();}}
 const component=mount(Fixture,{target,props:{dependencies:{step:0,events},options:new Options()}});await tick();target.querySelector('button')!.click();await tick();expect(target.querySelector('button')!.textContent).toBe('10');expect(dependencyReads).toBe(1);expect(events).toEqual([]);await unmount(component);target.remove();
});

import Recovery from './fixtures/ApplicationRecovery.svelte';
it('a handled later child render error does not retire business state',async()=>{
 const target=document.createElement('div');document.body.append(target);const events:string[]=[];let app!:ApplicationInstance<State,Action>;
 const component=mount(Recovery,{target,props:{dependencies:{step:1,events},onApp:value=>{app=value;}}});await tick();app.store.dispatch({type:'increment'});await tick();expect(target.textContent).toContain('Recover');app.store.dispatch({type:'increment'});expect(app.store.state.count).toBe(2);expect(events).toEqual(['start']);await unmount(component);expect(events).toEqual(['start','cleanup']);target.remove();
});

it('rejects effectful root dispatch before first Host claim without starting work',()=>{
 const target=document.createElement('div');document.body.append(target);const events:string[]=[];
 expect(()=>mount(Fixture,{target,props:{dependencies:{step:1,events},onApp:app=>app.store.dispatch({type:'start'})}})).toThrow('use initialState or startup');expect(events).toEqual([]);target.remove();
});
it('allows descendant initialization actions after Host claim and before mount',async()=>{
 const target=document.createElement('div');document.body.append(target);const events:string[]=[];
 const component=mount(Fixture,{target,props:{dependencies:{step:3,events},descendant:true}});expect(events).toEqual([]);expect(target.querySelector('button')!.textContent).toBe('3');await tick();expect(events).toEqual(['start']);await unmount(component);expect(events).toEqual(['start','cleanup']);target.remove();
});

import {lazyDefinition,failedStartupDefinition,decisions} from './fixtures/ApplicationLazyModel.js';
it('evaluates startup once from state accepted after descendant setup',async()=>{
 decisions.length=0;const target=document.createElement('div');document.body.append(target);const events:string[]=[];
 const component=mount(Fixture,{target,props:{dependencies:{step:3,events},descendant:true,definitionOverride:lazyDefinition}});expect(decisions).toEqual([]);await tick();expect(decisions).toEqual([3]);expect(events).toEqual(['start']);component.hide();await tick();component.show();await tick();expect(decisions).toEqual([3]);await unmount(component);expect(events).toEqual(['start','cleanup']);target.remove();
});

it('failed startup attachment unwinds the owned root',async()=>{
 const target=document.createElement('div');document.body.append(target);const events:string[]=[];let app!:ApplicationInstance<State,Action>;
 const component=mount(Fixture,{target,props:{dependencies:{step:1,events},definitionOverride:failedStartupDefinition,onApp:value=>{app=value;}}});
 expect(()=>flushSync()).toThrow('startup decision failed');const before=app.store.state;const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});try{app.store.dispatch({type:'increment'});expect(app.store.state).toBe(before);}finally{warning.mockRestore();await unmount(component);target.remove();}expect(events).toEqual([]);
});
