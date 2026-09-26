import {it,expect,vi,afterEach} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import type {Store} from '@composable-svelte/core';
import type {AppState,AppAction} from '../src/app/app.types.js';
const captured=vi.hoisted(()=>({store:null as Store<AppState,AppAction>|null}));
vi.mock('@composable-svelte/core',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('@composable-svelte/core')>();
 return {...actual,createStore:(...args:Parameters<typeof actual.createStore>)=>{
  const store=actual.createStore(...args);captured.store=store as Store<AppState,AppAction>;return store;
 }};
});
import App from '../src/app/App.svelte';
afterEach(()=>{captured.store?.destroy();captured.store=null;vi.restoreAllMocks();vi.useRealTimers();});
it('the demo owns its store, disables pending submission, and retires dismissal on unmount',async()=>{
 vi.useFakeTimers();const target=document.createElement('div');document.body.append(target);const component=mount(App,{target});flushSync();const store=captured.store!;const destroy=vi.spyOn(store,'destroy');
 const values={name:'Jane Doe',email:'jane@example.com',message:'A sufficiently detailed question.'};
 for(const [field,value] of Object.entries(values))store.dispatch({type:'contactForm',action:{type:'setFieldValue',field:field as keyof typeof values,value}});
 store.dispatch({type:'contactForm',action:{type:'submissionStarted'}});flushSync();expect(target.querySelector<HTMLButtonElement>('[data-testid="submit-button"]')!.disabled).toBe(true);
 await vi.advanceTimersByTimeAsync(1000);flushSync();expect(target.querySelector('[data-testid="success-message"]')?.textContent).toContain('Jane Doe');expect(vi.getTimerCount()).toBeGreaterThan(0);
 await unmount(component);expect(destroy).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);target.remove();
});
