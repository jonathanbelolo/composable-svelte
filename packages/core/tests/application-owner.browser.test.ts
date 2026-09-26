import {afterEach,it,expect,vi} from 'vitest';
import {mount,hydrate,unmount,tick,createRawSnippet} from 'svelte';
import {ApplicationRoot,ApplicationHost,defineApplication,type ApplicationInstance} from '../src/lib/application/index.js';
import {definition,reducer,type State,type Action,type Dependencies} from './fixtures/ApplicationBasicModel.js';
import OwnedNested from './fixtures/ApplicationOwnedNested.svelte';
import OwnedTable from './fixtures/ApplicationOwnedTable.svelte';
import OwnedFailure from './fixtures/ApplicationOwnedFailure.svelte';
import ownerHTML from './fixtures/application-owner-ssr.html?raw';
import OwnedLookup from './fixtures/ApplicationOwnedLookup.svelte';
import Lookup from './fixtures/ApplicationLookup.svelte';
import RoutingFixture from './fixtures/ApplicationRouting.svelte';
import type {State as RouteState,Action as RouteAction} from './fixtures/ApplicationRoutingModel.js';
const cleanup:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const stop of cleanup.splice(0).reverse())await stop();vi.restoreAllMocks();});
function target(){const node=document.createElement('div');document.body.append(node);cleanup.push(()=>node.remove());return node;}
it.each([false,true])('early owner unmount permanently retires retained root, with Host=%s',async withHost=>{
 const node=target();const events:string[]=[];let app!:ApplicationInstance<State,Action>;let host:ReturnType<typeof mount>|undefined;
 const children=createRawSnippet<[ApplicationInstance<State,Action>]>((read)=>{app=read();return{render:()=>'<span>owner</span>',setup:element=>{if(withHost)host=mount(ApplicationHost,{target:element,props:{app,children:createRawSnippet(()=>({render:()=>'<span>host</span>'}))}});return()=>{if(host)void unmount(host);};}};});
 const root=mount(ApplicationRoot<State,Action,Dependencies,number>,{target:node,props:{definition,options:{dependencies:{step:1,events},initial:{input:0}},children}});
 await unmount(root);expect(events).toEqual([]);expect(()=>mount(ApplicationHost,{target:target(),props:{app,children:createRawSnippet(()=>({render:()=>'<span>late</span>'}))}})).toThrow('destroyed root');
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});const before=app.store.state;try{app.store.dispatch({type:'increment'});}catch(error){expect(String(error)).toContain('first ApplicationHost');}expect(app.store.state).toBe(before);expect(events).toEqual([]);expect(warning).toHaveBeenCalledTimes(withHost?1:0);
});
it('exact original public routed leak no longer starts service after immediate owner removal',async()=>{
 const old=location.href;history.replaceState(null,'','/server');cleanup.push(()=>history.replaceState(null,'',old));const events:string[]=[];let active=0;let app!:ApplicationInstance<RouteState,RouteAction>;
 const component=mount(RoutingFixture,{target:target(),props:{initialURL:'/server',dependencies:{events,service:{start(){active++;return()=>{active--;};}}},onApp:(value:ApplicationInstance<RouteState,RouteAction>)=>{app=value;}}});await unmount(component);
 expect(()=>mount(ApplicationHost,{target:target(),props:{app,children:createRawSnippet(()=>({render:()=>'<span>retained</span>'}))}})).toThrow('destroyed root');expect(events).toEqual([]);expect(active).toBe(0);
});
it('context lookup returns exact root, temporary Host removal preserves it, and root replacement retires it',async()=>{
 const events:string[]=[];const instances:ApplicationInstance<State,Action>[]=[];const lookups:ApplicationInstance<State,Action>[]=[];
 const component=mount(OwnedLookup,{target:target(),props:{dependencies:{step:1,events},onApp:(app:ApplicationInstance<State,Action>)=>instances.push(app),onLookup:(app:ApplicationInstance<State,Action>)=>lookups.push(app)}});cleanup.push(()=>unmount(component));await tick();const first=instances[0]!;expect(lookups[0]).toBe(first);first.store.dispatch({type:'increment'});component.hide();await tick();component.show();await tick();expect(lookups.at(-1)).toBe(first);expect(first.store.state.count).toBe(1);expect(events).toEqual(['start']);
 component.changeInput();await tick();expect(instances.at(-1)).toBe(first);expect(first.store.state.count).toBe(1);component.replace();await tick();const second=instances.at(-1)!;expect(second).not.toBe(first);expect(lookups.at(-1)).toBe(second);const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});const before=second.store.state;first.store.dispatch({type:'increment'});expect(second.store.state).toBe(before);expect(warning).toHaveBeenCalledOnce();expect(events).toEqual(['start','cleanup','start']);
});
it('missing and mismatched contextual lookup fail without creating another instance',async()=>{
 expect(()=>mount(Lookup,{target:target(),props:{onApp:()=>{throw new Error('must not resolve');}}})).toThrow('containing ApplicationRoot');
 const other=defineApplication(reducer,{initialState:(count:number)=>({count,loaded:false})});const events:string[]=[];let retained:ApplicationInstance<State,Action>|undefined;
 expect(()=>mount(OwnedLookup,{target:target(),props:{dependencies:{step:1,events},onApp:(app:ApplicationInstance<State,Action>)=>{retained=app;},onLookup:()=>{},expected:other}})).toThrow('different application definition');expect(events).toEqual([]);expect(()=>mount(ApplicationHost,{target:target(),props:{app:retained!,children:createRawSnippet(()=>({render:()=>'<span>late</span>'}))}})).toThrow('destroyed root');
});

it('nested roots using one definition resolve nearest instances without crossing sibling contexts',async()=>{
 const outer:string[]=[];const inner:string[]=[];const apps:ApplicationInstance<State,Action>[]=[];
 const component=mount(OwnedNested,{target:target(),props:{outer:{step:1,events:outer},inner:{step:5,events:inner},onLookup:(app:ApplicationInstance<State,Action>)=>apps.push(app)}});await tick();expect(apps).toHaveLength(3);expect(apps[0]).toBe(apps[2]);expect(apps[0]).not.toBe(apps[1]);apps[0]!.store.dispatch({type:'increment'});apps[1]!.store.dispatch({type:'increment'});expect(apps.map(app=>app.store.state.count)).toEqual([2,15,2]);await unmount(component);expect(outer).toEqual(['start','cleanup']);expect(inner).toEqual(['start','cleanup']);
});
it('actual server root markup hydrates without replacing content and starts once',async()=>{
 const node=target();node.innerHTML=ownerHTML;const button=node.querySelector('button');const events:string[]=[];const apps:ApplicationInstance<State,Action>[]=[];
 const component=hydrate(OwnedLookup,{target:node,props:{dependencies:{step:1,events},onApp:(app:ApplicationInstance<State,Action>)=>apps.push(app),onLookup:()=>{}}});expect(events).toEqual([]);await tick();expect(node.querySelector('button')).toBe(button);expect(events).toEqual(['start']);await unmount(component);expect(events).toEqual(['start','cleanup']);
});
it('owned root preserves table row semantics without visual wrapper',async()=>{
 const table=document.createElement('table');const body=document.createElement('tbody');table.append(body);document.body.append(table);cleanup.push(()=>table.remove());const events:string[]=[];
 const component=mount(OwnedTable,{target:body,props:{dependencies:{step:1,events}}});await tick();expect(body.children).toHaveLength(1);const row=body.querySelector(':scope > tr:first-child');expect(row).toBe(body.firstElementChild);expect(body.querySelectorAll('tr')).toHaveLength(1);expect(row?.querySelector('td')?.textContent).toBe('0');await unmount(component);expect(events).toEqual(['start','cleanup']);
});
it('initial child failure before any Host destroys retained root synchronously',()=>{
 const events:string[]=[];let app:ApplicationInstance<State,Action>|undefined;
 expect(()=>mount(OwnedFailure,{target:target(),props:{dependencies:{step:1,events},onApp:(value:ApplicationInstance<State,Action>)=>{app=value;}}})).toThrow('application child failed');expect(events).toEqual([]);expect(()=>mount(ApplicationHost,{target:target(),props:{app:app!,children:createRawSnippet(()=>({render:()=>'<span>late</span>'}))}})).toThrow('destroyed root');
});
