import {afterEach, expect, it, vi} from 'vitest';
import {connectManagedHistory,browserHistoryPort,type TraversalResult} from '../../src/lib/routing/managed-history.js';
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0).reverse())cleanup();vi.restoreAllMocks();});
function setup(settle:(url:string,reply:(result:TraversalResult)=>void)=>void){
 const original={url:location.href,state:history.state};cleanups.push(()=>history.replaceState(original.state,'',original.url));history.replaceState({user:'retained'},'','/managed-base');let id=0;const report=vi.fn();
 const connection=connectManagedHistory({port:browserHistoryPort(window),acceptedURL:'/managed-base',id:()=>`browser-${++id}`,report,traverse:settle})!;cleanups.push(()=>connection.dispose());return{connection,report};
}
function back(){return new Promise<void>(resolve=>{window.addEventListener('popstate',()=>resolve(),{once:true});history.back();});}
it('canonicalized native Back reaches the previous entry on its next press',async()=>{
 const {connection}=setup((url,reply)=>reply({outcome:'accepted',acceptedURL:url.split('?')[0]!}));connection.accepted('/managed-one?tracking=x');connection.accepted('/managed-two');const length=history.length;
 await back();expect(location.pathname).toBe('/managed-one');expect(location.search).toBe('');expect(history.length).toBe(length);await back();expect(location.pathname).toBe('/managed-base');
});
it('native rejection returns to the recorded entry without a second business request',async()=>{
 const requested=vi.fn();const {connection}=setup((url,reply)=>{requested(url);reply({outcome:'rejected',acceptedURL:'/managed-two'});});connection.accepted('/managed-one');connection.accepted('/managed-two');
 const returned=new Promise<void>(resolve=>{const listener=()=>{if(location.pathname==='/managed-two'){window.removeEventListener('popstate',listener);resolve();}};window.addEventListener('popstate',listener);cleanups.push(()=>window.removeEventListener('popstate',listener));});
 await back();await returned;expect(requested).toHaveBeenCalledOnce();expect(location.pathname).toBe('/managed-two');
});
it('two wrapper objects for the same Window cannot claim two connections',()=>{
 const {connection,report}=setup(()=>{});const second=connectManagedHistory({port:browserHistoryPort(window),acceptedURL:'/collision',id:()=> 'second',report,traverse:()=>{}});expect(second).toBeUndefined();expect(location.pathname).toBe('/managed-base');connection.dispose();
 const replacement=connectManagedHistory({port:browserHistoryPort(window),acceptedURL:'/replacement',id:()=> 'replacement',report,traverse:()=>{}});expect(replacement).toBeDefined();cleanups.push(()=>replacement!.dispose());
});
it('native traversal response loses authority after connection disposal',async()=>{
 let reply:((result:TraversalResult)=>void)|undefined;const {connection}=setup((_url,settle)=>{reply=settle;});connection.accepted('/managed-one');await back();connection.dispose();reply!({outcome:'redirected',acceptedURL:'/late'});expect(location.pathname).toBe('/managed-base');
});

import {createStore} from '../../src/lib/store.svelte.js';
import {integrate} from '../../src/lib/navigation/integrate.js';
import {optionalSlot} from '../../src/lib/navigation/managed-integration.js';
import {Effect} from '../../src/lib/effect.js';
import type {Reducer} from '../../src/lib/types.js';
import type {PresentationAction} from '../../src/lib/navigation/types.js';
import {bindManagedRoute} from '../../src/lib/routing/managed-binding.js';
it('actual managed slot accepts native Back without echoing a canonicalization push',async()=>{
 type C={url:string};type CA={type:'go';url:string};type S={route:C|null};type A={type:'route';action:PresentationAction<CA>};
 const slot=optionalSlot<S,A>()('route');const child:Reducer<C,CA>=(_state,action)=>[{url:action.url.split('?')[0]!},Effect.none()];const core:Reducer<S,A>=state=>[state,Effect.none()];const definition=integrate(core).managed().with(slot,child).build();
 const original={url:location.href,state:history.state};cleanups.push(()=>history.replaceState(original.state,'',original.url));history.replaceState({user:'kept'},'','/managed-base');
 const store=createStore({initialState:{route:{url:'/managed-base'}},...definition});cleanups.push(()=>store.destroy());let serial=0;
 const binding=bindManagedRoute({store,composition:definition,slot,port:browserHistoryPort(window),initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url.split('?')[0]!}),id:()=>`managed-${++serial}`,report:event=>{if(event.type==='historyFailure')throw event.error;}})!;cleanups.push(()=>binding.dispose());
 const push=vi.spyOn(history,'pushState');store.dispatch(slot.wrap({type:'go',url:'/managed-one'}));history.replaceState(history.state,'','/managed-one?tracking=x');store.dispatch(slot.wrap({type:'go',url:'/managed-two'}));
 await back();expect(store.state.route?.url).toBe('/managed-one');expect(location.search).toBe('');await back();expect(store.state.route?.url).toBe('/managed-base');expect(push).toHaveBeenCalledTimes(2);
});
it('native entry keys track legacy push, replace, traversal and forward pruning',async()=>{
 const original={url:location.href,state:history.state};cleanups.push(()=>history.replaceState(original.state,'',original.url));const port=browserHistoryPort(window);history.replaceState(null,'','/key-base');const base=port.read().entryKey;expect(typeof base).toBe('string');expect(port.liveEntryKeys!()).toContain(base);
 history.pushState(null,'','/key-next');const next=port.read().entryKey;expect(next).not.toBe(base);history.replaceState({changed:true},'','/key-replaced');expect(port.read().entryKey).toBe(next);
 await back();expect(port.read().entryKey).toBe(base);history.pushState(null,'','/key-branch');expect(port.liveEntryKeys!()).not.toContain(next);expect(port.liveEntryKeys!()).toContain(port.read().entryKey);
});
it('a copied framework marker in native history cannot authorize an exact rollback',async()=>{
 const {connection,report}=setup((_url,reply)=>reply({outcome:'rejected',acceptedURL:'/managed-two'}));connection.accepted('/managed-one');history.pushState({...history.state,user:'copied'},'','/copied-entry');connection.accepted('/managed-two');const go=vi.spyOn(history,'go');await back();expect(go).not.toHaveBeenCalled();expect(location.pathname).toBe('/managed-two');expect(history.state.user).toBe('copied');expect(report).toHaveBeenCalledWith(expect.objectContaining({type:'historyRebased',visitedURL:'/copied-entry'}));
});
it('exact native traversal rejects a pruned key without visiting another entry',async()=>{
 const original={url:location.href,state:history.state};cleanups.push(()=>history.replaceState(original.state,'',original.url));const port=browserHistoryPort(window);history.replaceState(null,'','/prune-base');history.pushState(null,'','/prune-old');const old=port.read().entryKey!;await back();history.pushState(null,'','/prune-new');const current=port.read().entryKey;
 await expect(port.traverseTo!(old)).rejects.toBeInstanceOf(DOMException);expect(port.read().entryKey).toBe(current);expect(location.pathname).toBe('/prune-new');
});

function nativeBinding(fragment:'route'|'native'='native') {
 const original={url:location.href,state:history.state};cleanups.push(()=>history.replaceState(original.state,'',original.url));history.replaceState(null,'','/fragment-base');
 type C={url:string};type CA={type:'go';url:string};type S={route:C|null};type A={type:'route';action:PresentationAction<CA>};
 const calls:string[]=[];const child:Reducer<C,CA>=(state,action)=>{calls.push(action.url);return[action.url.includes('blocked')?state:{url:action.url.split('?')[0]!},Effect.none()];};const core:Reducer<S,A>=state=>[state,Effect.none()];const route=optionalSlot<S,A>()('route');const composition=integrate(core).managed().with(route,child).build();const store=createStore({initialState:{route:{url:'/fragment-base'}},...composition});cleanups.push(()=>store.destroy());let id=0;
 const binding=bindManagedRoute({store,composition,slot:route,port:browserHistoryPort(window),fragment,initial:'accepted-state',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url.split('?')[0]!}),id:()=>`fragment-${++id}`,report:()=>{}})!;cleanups.push(()=>binding.dispose());return{store,route,calls,binding};
}
function nextHash(){return new Promise<void>(resolve=>window.addEventListener('hashchange',()=>resolve(),{once:true}));}
it('native direct fragments and their paired events do not invoke a feature reducer',async()=>{
 const f=nativeBinding();const hash=nextHash();location.hash='anchor';await hash;expect(f.calls).toEqual([]);expect(f.store.state.route?.url).toBe('/fragment-base');expect(location.hash).toBe('#anchor');
});
it('native Back and Forward across fragment entries preserve native hash without feature actions',async()=>{
 const f=nativeBinding();let hash=nextHash();location.hash='one';await hash;hash=nextHash();location.hash='two';await hash;hash=nextHash();history.back();await hash;expect(location.hash).toBe('#one');hash=nextHash();history.forward();await hash;expect(location.hash).toBe('#two');expect(f.calls).toEqual([]);
});
it('native anchors retain browser scrolling and application writes preserve the active hash',async()=>{
 const f=nativeBinding();const wrapper=document.createElement('div');wrapper.innerHTML='<a href="#native-scroll-target">Jump</a><div style="height:1500px"></div><div id="native-scroll-target">Target</div>';document.body.append(wrapper);cleanups.push(()=>{wrapper.remove();window.scrollTo(0,0);});const hash=nextHash();wrapper.querySelector('a')!.click();await hash;expect(window.scrollY).toBeGreaterThan(0);expect(f.calls).toEqual([]);f.store.dispatch(f.route.wrap({type:'go',url:'/fragment-next'}));expect(location.pathname).toBe('/fragment-next');expect(location.hash).toBe('#native-scroll-target');
});
it('route-owned direct fragment receives one feature decision for paired native events',async()=>{
 const f=nativeBinding('route');const hash=nextHash();location.hash='owned';await hash;expect(f.calls).toEqual(['/fragment-base#owned']);expect(f.store.state.route?.url).toBe('/fragment-base#owned');
});
it('route plus fragment traversal canonicalizes the route and preserves native fragment',async()=>{
 const f=nativeBinding();history.pushState(null,'','/fragment-next?tracking=1#section');history.pushState(null,'','/other');const pop=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));history.back();await pop;expect(f.calls).toEqual(['/fragment-next?tracking=1']);expect(f.store.state.route?.url).toBe('/fragment-next');expect(location.pathname+location.search+location.hash).toBe('/fragment-next#section');
});
it('programmatic native history writes emit no routing events',async()=>{
 const f=nativeBinding();const pop=vi.fn(),hash=vi.fn();window.addEventListener('popstate',pop);window.addEventListener('hashchange',hash);cleanups.push(()=>{window.removeEventListener('popstate',pop);window.removeEventListener('hashchange',hash);});history.pushState(null,'','/silent#one');history.replaceState(null,'','/silent#two');await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));expect(pop).not.toHaveBeenCalled();expect(hash).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it('a route-owned fragment may be vetoed without a duplicate feature request',async()=>{
 const f=nativeBinding('route');const hash=nextHash();location.hash='blocked';await hash;expect(f.calls).toEqual(['/fragment-base#blocked']);expect(f.store.state.route?.url).toBe('/fragment-base');expect(location.hash).toBe('');
});
it('Back to a previously delivered entry after an own push is a new native transaction',async()=>{
 const f=nativeBinding();f.store.dispatch(f.route.wrap({type:'go',url:'/fragment-a'}));f.store.dispatch(f.route.wrap({type:'go',url:'/fragment-b'}));await back();expect(f.store.state.route?.url).toBe('/fragment-a');f.store.dispatch(f.route.wrap({type:'go',url:'/fragment-b'}));await back();expect(location.pathname).toBe('/fragment-a');expect(f.store.state.route?.url).toBe('/fragment-a');expect(f.calls.filter(url=>url==='/fragment-a')).toHaveLength(3);
});
