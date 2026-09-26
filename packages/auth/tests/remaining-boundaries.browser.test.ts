import {describe,it,expect,vi,afterEach} from 'vitest';
import {mount,unmount,flushSync,type Component} from 'svelte';
import {createStore,Effect} from '@composable-svelte/core';
import OneTimeCodeInput from '../src/lib/components/OneTimeCodeInput.svelte';
import ChangeEmailForm from '../src/lib/components/ChangeEmailForm.svelte';
import ConnectedAccountsPanel from '../src/lib/components/ConnectedAccountsPanel.svelte';
import ResetPasswordForm from '../src/lib/components/ResetPasswordForm.svelte';
import Guard from './fixtures/RemainingGuard.svelte';
import {createMockAuthDeps} from '../src/lib/testing/index.js';
import {changeEmailReducer,createInitialChangeEmailState} from '../src/lib/flows/change-email/reducer.js';
import {connectedAccountsReducer,createInitialConnectedAccountsState} from '../src/lib/flows/connected-accounts/reducer.js';
import {createInitialOAuthStartState} from '../src/lib/flows/oauth-start/reducer.js';
import {resetPasswordReducer,createInitialResetPasswordState} from '../src/lib/flows/reset-password/reducer.js';
import {createInitialSessionState} from '../src/lib/session/reducer.js';
import type {SessionState} from '../src/lib/session/types.js';
const cleanups:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const c of cleanups.reverse())await c();cleanups.length=0;});
function render<P extends Record<string,unknown>,E extends Record<string,unknown>>(component:Component<P,E>,props:P){const target=document.createElement('div');document.body.append(target);const instance=mount(component,{target,props});flushSync();cleanups.push(async()=>{await unmount(instance);target.remove();});return{target,instance};}
const deps=createMockAuthDeps();
describe('actual mounted auth edges',()=>{
 it.each([true,false])('code input mode follows oneTimeCode=%s',oneTimeCode=>{const {target}=render(OneTimeCodeInput,{id:'code',name:'code',value:'',oneTimeCode,oninput:()=>{}});expect(target.querySelector('input')?.inputMode).toBe(oneTimeCode?'numeric':'text');});
 it('account reconciliation does not announce a local change; later successes do',()=>{const store=createStore({initialState:createInitialChangeEmailState(),reducer:changeEmailReducer,dependencies:deps});cleanups.push(()=>store.destroy());const changed=vi.fn();render(ChangeEmailForm,{flowStore:store,pendingEmail:'existing@example.com',onChanged:changed});expect(changed).not.toHaveBeenCalled();store.dispatch({type:'changeRequestSucceeded',email:'new@example.com'});flushSync();expect(changed).toHaveBeenCalledTimes(1);store.dispatch({type:'pendingEmailObserved',email:null});flushSync();store.dispatch({type:'changeRequestSucceeded',email:'new@example.com'});flushSync();expect(changed).toHaveBeenCalledTimes(2);});
 it('unlink notification follows new identities, not pruning or equal-length replacement',()=>{const store=createStore({initialState:createInitialConnectedAccountsState(),reducer:connectedAccountsReducer,dependencies:{...deps,unlinkOAuthProvider:()=>new Promise<void>(()=>{})}});cleanups.push(()=>store.destroy());const changed=vi.fn();render(ConnectedAccountsPanel,{store,oauthStore:{state:createInitialOAuthStartState(),dispatch:()=>{}},onUnlinked:changed});store.dispatch({type:'unlinkRequested',provider:'github'});store.dispatch({type:'unlinkSucceeded',provider:'github'});flushSync();store.dispatch({type:'unlinkRequested',provider:'google'});store.dispatch({type:'unlinkSucceeded',provider:'google'});flushSync();expect(changed).toHaveBeenCalledTimes(2);store.dispatch({type:'providersObserved',providers:['google']});flushSync();expect(changed).toHaveBeenCalledTimes(2);store.dispatch({type:'providersObserved',providers:[]});store.dispatch({type:'unlinkRequested',provider:'github'});store.dispatch({type:'unlinkSucceeded',provider:'github'});flushSync();expect(changed).toHaveBeenCalledTimes(3);});
 it('anonymous callbacks cannot acquire incidental reactive dependencies',()=>{const initial:SessionState={...createInitialSessionState(),status:'anonymous'};const store=createStore<SessionState,{type:'replace';state:SessionState}>({initialState:initial,reducer:(_s,a)=>[a.state,Effect.none()],dependencies:{}});cleanups.push(()=>store.destroy());const callback=vi.fn();const {instance}=render(Guard,{store,onAnonymous:callback});expect(callback).toHaveBeenCalledTimes(1);instance.bump();flushSync();expect(callback).toHaveBeenCalledTimes(1);store.dispatch({type:'replace',state:{...initial,status:'unresolved'}});flushSync();store.dispatch({type:'replace',state:initial});flushSync();expect(callback).toHaveBeenCalledTimes(2);});
 it('replacement token clears stale presentation and reaches the actual flow',()=>{const state={...createInitialResetPasswordState('old'),error:{code:'token_expired' as const,message:'expired'}};const store=createStore({initialState:state,reducer:resetPasswordReducer,dependencies:deps});cleanups.push(()=>store.destroy());const {target}=render(ResetPasswordForm,{flowStore:store,sessionStore:{dispatch:()=>{}},token:'new',onRequestNewLink:()=>{}});expect(store.state.token).toBe('new');expect(store.state.error).toBeNull();expect(target.querySelector('input[type=password]')).not.toBeNull();});
});
