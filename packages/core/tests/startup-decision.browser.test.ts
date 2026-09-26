import {it,expect} from 'vitest';
import {mount,hydrate,unmount,tick} from 'svelte';
import Host from './fixtures/StartupDecisionHost.svelte';
import {createDecisionModel} from './fixtures/StartupDecisionModel.js';
it('mounted host evaluates startup from the accepted state and remount does not repeat it',async()=>{
 const events:string[]=[];const model=createDecisionModel(events);const target=document.createElement('div');document.body.append(target);expect(events).toEqual([]);model.store.dispatch({type:'go',route:'/accepted'});const app=mount(Host,{target,props:{model}});await tick();expect(events).toEqual(['decide:/accepted']);expect(target.querySelector('[data-decision-boot]')?.textContent).toBe('/accepted');await unmount(app);model.store.dispatch({type:'go',route:'/later'});const again=mount(Host,{target,props:{model}});await tick();expect(events).toEqual(['decide:/accepted']);await unmount(again);model.store.destroy();target.remove();
});
it('destroying root before mount cannot evaluate the factory',()=>{
 const events:string[]=[];const model=createDecisionModel(events);model.store.destroy();expect(()=>model.owner.claim()).toThrow('destroyed');expect(events).toEqual([]);
});

import serverHTML from './fixtures/startup-decision-ssr.html?raw';
it('actual server markup hydrates before the deferred startup decision',async()=>{
 const events:string[]=[];const model=createDecisionModel(events);const target=document.createElement('div');target.innerHTML=serverHTML;document.body.append(target);const original=target.querySelector('[data-decision-route]');expect(events).toEqual([]);const app=hydrate(Host,{target,props:{model}});expect(target.querySelector('[data-decision-route]')).toBe(original);await tick();expect(events).toEqual(['decide:/server']);expect(target.querySelector('[data-decision-route]')).toBe(original);expect(target.querySelector('[data-decision-boot]')?.textContent).toBe('/server');await unmount(app);model.store.destroy();target.remove();
});
