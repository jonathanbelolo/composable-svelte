import {afterEach,it,expect,vi} from 'vitest';
import {mount,hydrate,unmount,tick,flushSync,createRawSnippet} from 'svelte';
import Fixture from './fixtures/ApplicationRouting.svelte';
import {initial,makeDefinition,reducer,type State,type Action,type Dependencies} from './fixtures/ApplicationRoutingModel.js';
import {ApplicationHost,defineApplication,type ApplicationInstance} from '../src/lib/application/index.js';
import serverHTML from './fixtures/application-routing-ssr.html?raw';
const cleanups:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const stop of cleanups.splice(0).reverse())await stop();vi.restoreAllMocks();});
function locationAt(url:string,state:unknown=null){const oldURL=location.href,oldState=history.state;history.replaceState(state,'',url);cleanups.push(()=>history.replaceState(oldState,'',oldURL));}
function setup({url='/server',snapshot=initial(),fragment='native',failure,hydrateHTML=false,definitionOverride,initiallyVisible}:{url?:string;snapshot?:State;fragment?:'native'|'route';failure?:Dependencies['failure'];hydrateHTML?:boolean;initiallyVisible?:boolean;definitionOverride?:ReturnType<typeof makeDefinition>}={}){
 const target=document.createElement('div');if(hydrateHTML)target.innerHTML=serverHTML;document.body.append(target);const original=target.querySelector('[data-route]');const events:string[]=[];let active=0;let app!:ApplicationInstance<State,Action>;
 const props={initialURL:url,snapshot,initiallyVisible,definitionOverride:definitionOverride??makeDefinition(fragment),dependencies:{events,failure,service:{start(){active++;return()=>{active--;};}}},onApp:(value:ApplicationInstance<State,Action>)=>{app=value;}};
 const component=hydrateHTML?hydrate(Fixture,{target,props}):mount(Fixture,{target,props});let destroyed=false;const destroy=async()=>{if(destroyed)return;destroyed=true;await unmount(component);target.remove();};cleanups.push(destroy);return{target,component,app,events,original,destroy,get active(){return active;}};
}
it('actual server markup is adopted before differing browser URL and startup decisions',async()=>{locationAt('/browser');const f=setup({url:'https://server.example/server',hydrateHTML:true});expect(f.events).toEqual([]);expect(f.original?.textContent).toBe('/server');await tick();expect(f.target.querySelector('[data-route]')).toBe(f.original);expect(f.events).toEqual(['navigate:/browser','start:/browser']);expect(f.active).toBe(1);});
it('equivalent absolute injected URL preserves loaded route without a duplicate action',async()=>{locationAt('/server');const f=setup({url:'https://server.example/parent/../server',snapshot:initial('/server',true)});await tick();expect(f.events).toEqual([]);expect(f.app.store.state.visits).toBe(0);expect(f.active).toBe(0);});
it.each([['/blocked','/server',['navigate:/blocked','start:/server']],['/invalid','/server',['start:/server']],['/redirect','/canonical',['navigate:/redirect','start:/canonical']]] as const)('browser %s is a declared veto/invalid/redirect decision',async(url,accepted,events)=>{locationAt(url);const f=setup();await tick();expect(f.app.store.state.url).toBe(accepted);expect(location.pathname).toBe(accepted);expect(f.events).toEqual(events);});
it('application navigation writes once, rejected application action writes nothing',async()=>{locationAt('/server');const push=vi.spyOn(history,'pushState');const f=setup();await tick();f.app.store.dispatch({type:'navigate',url:'/next'});expect(push).toHaveBeenCalledOnce();f.app.store.dispatch({type:'navigate',url:'/blocked'});expect(push).toHaveBeenCalledOnce();expect(location.pathname).toBe('/next');});
it('temporary host detach retires browser listener and remount reconciles without startup replay',async()=>{locationAt('/server');const f=setup();await tick();f.component.hide();await tick();history.replaceState(null,'','/detached');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));expect(f.app.store.state.url).toBe('/server');f.component.show();await tick();expect(f.events).toEqual(['start:/server','navigate:/detached']);expect(f.active).toBe(1);f.component.hide();await tick();f.component.show();await tick();expect(f.events).toEqual(['start:/server','navigate:/detached']);});
it('native fragment-only change bypasses business request while owned fragment is a route',async()=>{locationAt('/server#first');const f=setup({url:'/server#other'});await tick();expect(f.events).toEqual(['start:/server']);const changed=new Promise<void>(resolve=>window.addEventListener('hashchange',()=>resolve(),{once:true}));location.hash='second';await changed;expect(f.events).toEqual(['start:/server']);expect(location.hash).toBe('#second');});
it('route-owned fragment difference reconciles before startup',async()=>{locationAt('/server#new');const f=setup({url:'/server#old',snapshot:initial('/server#old'),fragment:'route'});await tick();expect(f.events).toEqual(['navigate:/server#new','start:/server#new']);});
it.each(['decision','action'] as const)('startup %s failure retires actual Host resources and root',async failure=>{locationAt('/incoming');vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});const f=setup({failure});expect(()=>flushSync()).toThrow(`startup ${failure} failed`);await tick();expect(f.active).toBe(0);const before=f.events.slice();history.replaceState(null,'','/late');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));f.app.store.dispatch({type:'navigate',url:'/ignored'});expect(f.events).toEqual(before);});
it('unsupported metadata fails attachment before startup without retaining browser ownership',async()=>{locationAt('/server',new Date());vi.spyOn(console,'error').mockImplementation(()=>{});const failed=setup();expect(()=>flushSync()).toThrow('plain-record or null');await tick();expect(failed.events).toEqual([]);history.replaceState(null,'','/server');const next=setup();await tick();expect(next.events).toEqual(['start:/server']);expect(next.active).toBe(1);});
it('competing routed root fails without destroying the first browser authority',async()=>{locationAt('/server');vi.spyOn(console,'error').mockImplementation(()=>{});const first=setup();await tick();const second=setup();expect(()=>flushSync()).toThrow('already owns');await tick();first.app.store.dispatch({type:'navigate',url:'/first-alive'});expect(location.pathname).toBe('/first-alive');expect(first.active).toBe(1);expect(second.active).toBe(0);});
it('unmount before attachment performs no browser writes or startup',async()=>{locationAt('/browser');const replace=vi.spyOn(history,'replaceState');const f=setup();await f.destroy();await tick();expect(replace).not.toHaveBeenCalled();expect(f.events).toEqual([]);});
it.each(['serialize','request','relativeURL','nullRequest'] as const)('malformed or throwing %s decision retires failed attachment without half-startup',async kind=>{
 locationAt('/incoming');vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
 const definitionOverride=defineApplication(reducer,{initialState:(url:string)=>initial(url),startup:state=>({type:'start',url:state.url}),routing:{fragment:'native',serialize:state=>{if(kind==='serialize')throw new Error('serialize failed');return state.url;},request:url=>{if(kind==='request')throw new Error('request failed');if(kind==='nullRequest')return null as never;return{action:{type:'navigate',url},expectedURL:kind==='relativeURL'?'ambiguous':url};}}});
 const f=setup({definitionOverride});expect(()=>flushSync()).toThrow();await tick();expect(f.active).toBe(0);expect(f.events).toEqual([]);history.replaceState(null,'','/after-failure');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));expect(f.events).toEqual([]);const next=setup({url:'/after-failure',snapshot:initial('/after-failure')});await tick();expect(next.events).toEqual(['start:/after-failure']);
});
it('accepted Back and Forward preserve entry count rather than echoing application pushes',async()=>{
 locationAt('/server');const f=setup();await tick();f.app.store.dispatch({type:'navigate',url:'/one'});f.app.store.dispatch({type:'navigate',url:'/two'});const length=history.length;const push=vi.spyOn(history,'pushState');
 const back=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));history.back();await back;await vi.waitFor(()=>expect(f.app.store.state.url).toBe('/one'));
 const forward=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));history.forward();await forward;await vi.waitFor(()=>expect(f.app.store.state.url).toBe('/two'));expect(history.length).toBe(length);expect(push).not.toHaveBeenCalled();
});
it('vetoed known-chain Back returns to accepted entry without a new push',async()=>{
 locationAt('/server');const f=setup();await tick();f.app.store.dispatch({type:'navigate',url:'/one'});f.app.store.dispatch({type:'navigate',url:'/two'});f.app.store.dispatch({type:'lock'});const length=history.length;const push=vi.spyOn(history,'pushState');const back=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));history.back();await back;await vi.waitFor(()=>expect(location.pathname).toBe('/two'));expect(f.app.store.state.url).toBe('/two');expect(f.events.filter(event=>event==='navigate:/one')).toHaveLength(2);expect(history.length).toBe(length);expect(push).not.toHaveBeenCalled();
});
it('matching injected request URL trusts preloaded canonical snapshot without re-requesting it',async()=>{locationAt('/redirect');const f=setup({url:'https://server.example/redirect',snapshot:initial('/canonical',true)});await tick();expect(f.events).toEqual([]);expect(f.app.store.state.url).toBe('/canonical');expect(location.pathname).toBe('/canonical');});
it('invalid post-attachment write policy cannot silently push or destroy accepted business state',async()=>{
 locationAt('/server');vi.spyOn(console,'error').mockImplementation(()=>{});const push=vi.spyOn(history,'pushState');const definitionOverride=defineApplication(reducer,{initialState:(url:string)=>initial(url),startup:state=>({type:'start',url:state.url}),routing:{fragment:'native',serialize:state=>state.url,request:url=>({action:{type:'navigate',url},expectedURL:url}),writePolicy:()=> 'invalid' as never}});const f=setup({definitionOverride});await tick();f.app.store.dispatch({type:'navigate',url:'/accepted'});expect(f.app.store.state.url).toBe('/accepted');expect(location.pathname).toBe('/server');expect(push).not.toHaveBeenCalled();expect(f.active).toBe(1);
});
it('queued actual Host startup failure destroys its root after the original mount stack returned',async()=>{
 locationAt('/incoming');vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});const f=setup({initiallyVisible:false,failure:'decision'});
 const claimTarget=document.createElement('div');document.body.append(claimTarget);const first=mount(ApplicationHost,{target:claimTarget,props:{app:f.app,children:createRawSnippet(()=>({render:()=>'<span>claim</span>'}))}});await unmount(first);claimTarget.remove();expect(f.events).toEqual([]);
 let requested=false;const stop=f.app.store.subscribe(state=>{if(state.url==='/trigger'&&!requested){requested=true;f.component.show();flushSync();}});cleanups.push(stop);
 let failure:unknown;try{f.app.store.dispatch({type:'navigate',url:'/trigger'});}catch(error){failure=error;}expect(failure).toBeInstanceOf(Error);expect((failure as Error).message).toContain("startup decision failed");expect(f.events).toEqual(['navigate:/trigger','navigate:/incoming']);expect(f.active).toBe(0);const before=f.events.slice();f.app.store.dispatch({type:'navigate',url:'/must-not-run'});history.replaceState(null,'','/must-not-deliver');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));expect(f.events).toEqual(before);
 const other=setup({url:'/must-not-deliver',snapshot:initial('/must-not-deliver')});await tick();expect(other.events).toEqual(['start:/must-not-deliver']);expect(other.active).toBe(1);
});

it('immediate Host unmount releases the synchronous claim before effects run',async()=>{
 locationAt('/server');const f=setup({initiallyVisible:false});
 const target=document.createElement('div');document.body.append(target);cleanups.push(()=>target.remove());
 const children=createRawSnippet(()=>({render:()=>'<span>borrowed</span>'}));
 const first=mount(ApplicationHost,{target,props:{app:f.app,children}});
 await unmount(first);expect(f.events).toEqual([]);
 const second=mount(ApplicationHost,{target,props:{app:f.app,children}});cleanups.push(()=>unmount(second));
 await tick();expect(f.events).toEqual(['start:/server']);expect(f.active).toBe(1);
});
it('Host preserves table fragment markup without invalid DOM wrappers',async()=>{
 locationAt('/server');const f=setup({initiallyVisible:false});const target=document.createElement('tbody');const table=document.createElement('table');table.append(target);document.body.append(table);cleanups.push(()=>table.remove());
 const children=createRawSnippet(()=>({render:()=>'<tr><td>content</td></tr>'}));
 const host=mount(ApplicationHost,{target,props:{app:f.app,children}});await tick();expect(target.querySelectorAll('tr')).toHaveLength(1);expect(target.querySelector('td')?.textContent).toBe('content');expect(target.firstElementChild).toBe(target.querySelector('tr'));expect(target.children).toHaveLength(1);
 await unmount(host);expect(target.children).toHaveLength(0);
});
it('Host unmount releases native browser authority exactly once',async()=>{
 locationAt('/server');const f=setup({initiallyVisible:false});const target=document.createElement('tbody');const table=document.createElement('table');table.append(target);document.body.append(table);cleanups.push(()=>table.remove());
 const children=createRawSnippet(()=>({render:()=>'<tr><td>content</td></tr>'}));
 const host=mount(ApplicationHost,{target,props:{app:f.app,children}});await tick();expect(f.active).toBe(1);
 await unmount(host);history.replaceState(null,'','/detached');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));expect(f.events).toEqual(['start:/server']);
 const next=setup({url:'/detached',snapshot:initial('/detached')});await tick();expect(next.events).toEqual(['start:/detached']);expect(next.active).toBe(1);
});
