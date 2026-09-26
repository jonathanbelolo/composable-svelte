import {it,expect,vi} from 'vitest';
import {mount,hydrate,unmount,tick} from 'svelte';
import Fixture from './fixtures/Host0bFixture.svelte';
import html from './fixtures/host0b-ssr.html?raw';
it('accepts child action before host mount and replaces then removes captured targets',async()=>{
 const container=document.createElement('div');document.body.append(container);const events:string[]=[];
 const app=mount(Fixture,{target:container,props:{onEvent:event=>events.push(event)}});await tick();
 expect(events).toEqual(['register:false']);expect(container.querySelector<HTMLElement>('[data-target]')!.style.opacity).toBe('0.3');
 expect(app.resourceCount()).toBe(2);app.replace();await tick();expect(events).toEqual(['register:false','unregister','register:true']);expect(app.resourceCount()).toBe(2);expect(container.querySelector<HTMLElement>('[data-target]')!.style.opacity).toBe('0.4');
 app.remove();await tick();expect(container.querySelector('[data-target]')).toBeNull();expect(app.resourceCount()).toBe(1);await unmount(app);expect(app.resourceCount()).toBe(0);container.remove();
});
it('hydrates actual server markup without correction writes or entrance replay',async()=>{
 const container=document.createElement('div');container.innerHTML=html;document.body.append(container);
 const original=container.querySelector<HTMLElement>('[data-target]')!;const set=vi.spyOn(original.style,'setProperty');const animate=vi.spyOn(Element.prototype,'animate');
 const app=hydrate(Fixture,{target:container});await tick();expect(container.querySelector('[data-target]')).toBe(original);expect(original.style.opacity).toBe('0.3');expect(set).not.toHaveBeenCalled();expect(animate).not.toHaveBeenCalled();
 await unmount(app);expect(app.resourceCount()).toBe(0);set.mockRestore();animate.mockRestore();container.remove();
});

import ApplicationHost from '../src/lib/application/ApplicationHost.svelte';
import {createRawSnippet} from 'svelte';
import {createStore} from '../src/lib/store.svelte.js';
import {rendererOwner} from '../src/lib/application/renderer/owner.js';
import {definition} from './fixtures/Host0bModel.js';
it('rejects a second mounted host without displacing the first root claim',async()=>{
 const store=createStore({initialState:{child:{opacity:'0.3'}},...definition});const owner=rendererOwner(store,definition.execution);const container=document.createElement('div');document.body.append(container);
 const children=createRawSnippet(()=>({render:()=>'<span>host</span>'}));const first=mount(ApplicationHost,{target:container,props:{owner,children}});await tick();
 expect(()=>mount(ApplicationHost,{target:container,props:{owner,children}})).toThrow('already');expect(store._runtime!.resourceScope.size).toBe(1);await unmount(first);expect(store._runtime!.resourceScope.size).toBe(0);store.destroy();container.remove();
});

import Borrowed from './fixtures/Host0bBorrowed.svelte';
it('failed child initialization releases the exact host claim before retry',async()=>{
 const store=createStore({initialState:{child:{opacity:'0.3'}},...definition});const owner=rendererOwner(store,definition.execution);const container=document.createElement('div');document.body.append(container);
 expect(()=>mount(Borrowed,{target:container,props:{owner,fail:true}})).toThrow('child setup failed');expect(store._runtime!.resourceScope.size).toBe(0);
 const retry=mount(Borrowed,{target:container,props:{owner}});await tick();expect(store._runtime!.resourceScope.size).toBe(1);await unmount(retry);expect(store._runtime!.resourceScope.size).toBe(0);store.destroy();container.remove();
});
