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
import {registrationFormConfig} from '../src/features/registration/registration.config.js';
afterEach(()=>{captured.store?.destroy();captured.store=null;vi.restoreAllMocks();vi.useRealTimers();});
it('unmount destroys the real owner and suppresses an in-flight submit result',async()=>{
 vi.useFakeTimers();const target=document.createElement('div');document.body.append(target);const component=mount(App,{target});flushSync();
 const store=captured.store!;const destroy=vi.spyOn(store,'destroy');const success=vi.spyOn(registrationFormConfig,'onSubmitSuccess');
 const values={username:'unique_person',email:'unique@example.com',password:'Password123',confirmPassword:'Password123'};
 for(const [field,value] of Object.entries(values))store.dispatch({type:'registrationForm',action:{type:'setFieldValue',field:field as keyof typeof values,value}});
 store.dispatch({type:'registrationForm',action:{type:'submitTriggered'}});await vi.advanceTimersByTimeAsync(600);flushSync();
 expect(store.state.registrationForm.isSubmitting).toBe(true);
 const button=target.querySelector<HTMLButtonElement>('[data-testid="submit-button"]')!;expect(button.disabled).toBe(true);
 const atUnmount=store.state;await unmount(component);expect(destroy).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(1500);expect(store.state).toBe(atUnmount);expect(success).not.toHaveBeenCalled();target.remove();
});

it('success identifies the submitted account, even if fields change during the request',async()=>{
 vi.useFakeTimers();const target=document.createElement('div');document.body.append(target);const component=mount(App,{target});flushSync();const store=captured.store!;
 try {
  const values={username:'original_person',email:'original@example.com',password:'Password123',confirmPassword:'Password123'};
  for(const [field,value] of Object.entries(values))store.dispatch({type:'registrationForm',action:{type:'setFieldValue',field:field as keyof typeof values,value}});
  store.dispatch({type:'registrationForm',action:{type:'submitTriggered'}});await vi.advanceTimersByTimeAsync(600);expect(store.state.registrationForm.isSubmitting).toBe(true);
  store.dispatch({type:'registrationForm',action:{type:'setFieldValue',field:'username',value:'later_person'}});
  // A stale start must not overwrite the in-flight business snapshot.
  store.dispatch({type:'registrationForm',action:{type:'submissionStarted',validationId:999}});
  await vi.advanceTimersByTimeAsync(1000);flushSync();expect(store.state.registeredUser).toEqual({username:'original_person',email:'original@example.com'});
  expect(target.querySelector('[data-testid="success-state"]')?.textContent).toContain('original_person');
 } finally {await unmount(component);target.remove();}
});
