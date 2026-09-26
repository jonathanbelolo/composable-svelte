import {describe,it,expect,vi,afterEach} from 'vitest';
import {createStore} from '@composable-svelte/core';
import {appReducer} from '../src/app/app.reducer.js';
import {createInitialAppState} from '../src/app/app.state.js';
import type {AppState} from '../src/app/app.types.js';
const person={firstName:'Jane',lastName:'Smith',email:'jane@example.com',phone:'123-456-7890'};
const address={street:'123 Main Street',city:'Boston',state:'MA',zipCode:'02101'};
const stores: Array<{destroy():void}>=[];
afterEach(()=>{for(const store of stores.splice(0))store.destroy();vi.useRealTimers();});
function fixture(initialState=createInitialAppState()){
 const store=createStore({initialState,reducer:appReducer,dependencies:{},ssr:{deferEffects:false}});stores.push(store);return store;
}
function completed():AppState{
 const state=createInitialAppState();return {...state,currentStep:'review',personalInfoForm:{...state.personalInfoForm,data:person},addressForm:{...state.addressForm,data:address},completedData:{personalInfo:person,address}};
}
describe('wizard integration with public form lifetimes',()=>{
 it('awaits async zip validation, rejects unserviceable data, then accepts a corrected submission',async()=>{
  vi.useFakeTimers();const state=createInitialAppState();const store=fixture({...state,currentStep:'address',completedData:{personalInfo:person,address:null},addressForm:{...state.addressForm,data:{...address,zipCode:'00000'}}});
  store.dispatch({type:'nextStep'});
  expect(store.state.currentStep).toBe('address');expect(store.state.addressForm.isValidating).toBe(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(store.state.currentStep).toBe('address');expect(store.state.addressForm.fields.zipCode?.error).toContain('serviceable');
  store.dispatch({type:'addressForm',action:{type:'setFieldValue',field:'zipCode',value:'02101'}});
  store.dispatch({type:'nextStep'});await vi.advanceTimersByTimeAsync(300);
  expect(store.state.currentStep).toBe('review');expect(store.state.completedData.address?.zipCode).toBe('02101');
 });
 it('does not advance on a stale child success rejected by the form reducer',()=>{
  const state=createInitialAppState();const store=fixture({...state,personalInfoForm:{...state.personalInfoForm,data:person,submissionId:5}});
  store.dispatch({type:'personalInfoForm',action:{type:'submissionSucceeded',submissionId:4}});
  expect(store.state.currentStep).toBe('personalInfo');expect(store.state.completedData.personalInfo).toBeNull();
 });
 it('invalidates edited completion and prevents skipping to review or final submission',()=>{
  const store=fixture(completed());store.dispatch({type:'goToStep',step:'personalInfo'});
  store.dispatch({type:'personalInfoForm',action:{type:'setFieldValue',field:'firstName',value:'Changed'}});
  expect(store.state.completedData.personalInfo).toBeNull();store.dispatch({type:'goToStep',step:'review'});expect(store.state.currentStep).toBe('personalInfo');
  store.dispatch({type:'submitOnboarding'});expect(store.state.isSubmitting).toBe(false);expect(store.state.submitError).toContain('complete');
 });
 it('starts exactly one pending final submission and completes using approved data',async()=>{
  vi.useFakeTimers();const store=fixture(completed());let starts=0;store.subscribeToActions?.(a=>{if(a.type==='submissionSucceeded')starts++;});
  store.dispatch({type:'submitOnboarding'});expect(store.state.isSubmitting).toBe(true);store.dispatch({type:'submitOnboarding'});
  expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(1500);
  expect(starts).toBe(1);expect(store.state.submittedData).toEqual({personalInfo:person,address});
 });
 it('reset cancels the framework delay and atomically resets child form data',async()=>{
  vi.useFakeTimers();const store=fixture(completed());store.dispatch({type:'submitOnboarding'});expect(vi.getTimerCount()).toBe(1);
  store.dispatch({type:'resetOnboarding'});expect(vi.getTimerCount()).toBe(0);expect(store.state.personalInfoForm.data.firstName).toBe('');
  await vi.advanceTimersByTimeAsync(1500);expect(store.state.submissionComplete).toBe(false);expect(store.state.currentStep).toBe('personalInfo');
 });
 it('reset cancels in-flight form validation and rejects its stale terminal action',async()=>{
  vi.useFakeTimers();const state=createInitialAppState();const store=fixture({...state,personalInfoForm:{...state.personalInfoForm,data:person}});
  store.dispatch({type:'nextStep'});expect(store.state.personalInfoForm.isValidating).toBe(true);const retired=store.state.personalInfoForm.submissionId ?? 0;
  store.dispatch({type:'resetOnboarding'});await vi.advanceTimersByTimeAsync(300);
  store.dispatch({type:'personalInfoForm',action:{type:'submissionSucceeded',submissionId:retired}});
  expect(store.state.completedData.personalInfo).toBeNull();expect(store.state.currentStep).toBe('personalInfo');
 });
 it('destroy releases the final delay instead of leaving an application timer',()=>{
  vi.useFakeTimers();const store=fixture(completed());store.dispatch({type:'submitOnboarding'});expect(vi.getTimerCount()).toBe(1);store.destroy();expect(vi.getTimerCount()).toBe(0);
 });
});
