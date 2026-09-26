import {it,expect} from 'vitest';
import {mount,hydrate,unmount,tick} from 'svelte';
import Host from './fixtures/RootRouteHost.svelte';
import {createRootRouteModel} from './fixtures/RootRouteModel.js';
import {browserHistoryPort} from '../src/lib/routing/managed-history.js';
import serverHTML from './fixtures/root-route-ssr.html?raw';
it('actual hydration keeps injected DOM before browser reconciliation and route-aware startup',async()=>{
 const oldURL=location.href,oldState=history.state;history.replaceState(null,'','/incoming');const events:string[]=[];const model=createRootRouteModel(events,browserHistoryPort(window));const target=document.createElement('div');target.innerHTML=serverHTML;document.body.append(target);const original=target.querySelector('[data-root-route]');
 const app=hydrate(Host,{target,props:{model}});try{expect(events).toEqual([]);expect(original?.textContent).toBe('/server');await tick();expect(events).toEqual(['go:/incoming','startup:/incoming']);expect(target.querySelector('[data-root-route]')).toBe(original);expect(original?.textContent).toBe('/incoming');expect(target.querySelector('[data-root-startup]')?.textContent).toBe('/incoming');}finally{await unmount(app);model.store.destroy();target.remove();history.replaceState(oldState,'',oldURL);}
});
it('unmount retires root route listener and remount reconciles without repeating startup',async()=>{
 const oldURL=location.href,oldState=history.state;history.replaceState(null,'','/one');const events:string[]=[];const model=createRootRouteModel(events,browserHistoryPort(window));const target=document.createElement('div');document.body.append(target);let app=mount(Host,{target,props:{model}});
 try{await tick();await unmount(app);history.replaceState(null,'','/two');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));expect(model.store.state.url).toBe('/one');app=mount(Host,{target,props:{model}});await tick();expect(model.store.state.url).toBe('/two');expect(events).toEqual(['go:/one','startup:/one','go:/two']);}finally{await unmount(app);model.store.destroy();target.remove();history.replaceState(oldState,'',oldURL);}
});
