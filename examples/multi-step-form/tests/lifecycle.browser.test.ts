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
afterEach(()=>vi.useRealTimers());
it('the mounted demo destroys its real store and clears pending final submission',async()=>{
 vi.useFakeTimers();const target=document.createElement('div');document.body.append(target);
 const component=mount(App,{target});flushSync();const store=captured.store!;const destroy=vi.spyOn(store,'destroy');
 const step=target.querySelector('[data-testid="step-personalInfo"]');
 expect(step?.getAttribute('aria-label')).toBe('Personal Information, Step 1');
 expect(step?.getAttribute('aria-current')).toBe('step');
 const person={firstName:'Jane',lastName:'Smith',email:'jane@example.com',phone:'123-456-7890'};
 for(const [field,value] of Object.entries(person))store.dispatch({type:'personalInfoForm',action:{type:'setFieldValue',field:field as keyof typeof person,value}});
 store.dispatch({type:'nextStep'});await vi.advanceTimersByTimeAsync(300);flushSync();expect(store.state.currentStep).toBe('address');
 expect(step?.getAttribute('aria-label')).toBe('Personal Information, Step 1');
 expect(step?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
 expect(step?.getAttribute('aria-current')).toBeNull();
 const address={street:'123 Main Street',city:'Boston',state:'MA',zipCode:'02101'};
 for(const [field,value] of Object.entries(address))store.dispatch({type:'addressForm',action:{type:'setFieldValue',field:field as keyof typeof address,value}});
 store.dispatch({type:'nextStep'});await vi.advanceTimersByTimeAsync(300);flushSync();expect(store.state.currentStep).toBe('review');
 store.dispatch({type:'submitOnboarding'});expect(store.state.isSubmitting).toBe(true);expect(vi.getTimerCount()).toBeGreaterThan(0);
 await unmount(component);expect(destroy).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);target.remove();
});
