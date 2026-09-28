import '../src/styles.css';
import { afterEach, it, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import type { AppAction, AppState, AppDependencies } from '../src/model.js';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import { settle, waitFor } from './support/observe.js';
let cleanup: (()=>Promise<void>) | undefined;
afterEach(async()=>{await cleanup?.();cleanup=undefined;});
const q=(s:string)=>document.querySelector<HTMLElement>(s)!;
const click=(s:string)=>userEvent.click(page.elementLocator(q(s)));
const fill=(s:string)=>userEvent.fill(page.elementLocator(q('[data-curator-notes]')),s);
async function fixture(){
 const requests:{resolve:()=>void,reject:(e:Error)=>void,notes:string}[]=[]; const trace:string[]=[];
 const deps:AppDependencies={trace,saveCuratorWork:(_id,notes)=>new Promise<void>((resolve,reject)=>requests.push({resolve,reject,notes}))};
 const target=document.createElement('div');document.body.append(target);let app!:ApplicationInstance<AppState,AppAction>;
 const component=mount(App,{target,props:{url:'/',dependencies:deps,onApp:(a:ApplicationInstance<AppState,AppAction>)=>{app=a;}}});
 cleanup=async()=>{await unmount(component);target.remove();};await settle();
 return {app,requests,trace,status:()=>app.store.state.curatorPresentation.status};
}
it('trusted failure/retry and edits during save preserve the draft, then one successful bridge close',async()=>{
 const f=await fixture();await click('[data-open-curator="cloud"]');await waitFor(()=>f.status()==='presented');
 await fill('Draft A');await click('[data-curator-save-close]');await waitFor(()=>f.requests.length===1);
 f.requests[0]!.reject(new Error('Offline'));await waitFor(()=>!!q('[data-save-error]'));
 expect(q('[data-save-error]').textContent).toContain('Offline');expect(f.status()).toBe('presented');expect(f.app.store.state.curator!.isSaving).toBe(false);
 await click('[data-curator-save-close]');await waitFor(()=>f.requests.length===2);await fill('Draft B');f.requests[1]!.resolve();
 await waitFor(()=>!f.app.store.state.curator!.isSaving);expect(f.app.store.state.curator!.spec.curatorNotes).toBe('Draft B');expect(f.status()).toBe('presented');expect(f.app.store.state.curator!.isDirty).toBe(true);
 await click('[data-curator-save-close]');await waitFor(()=>f.requests.length===3);f.requests[2]!.resolve();await waitFor(()=>f.status()==='idle');
 expect(f.trace.filter(t=>t==='curator:commitSavedClose')).toHaveLength(1);
});
it('trusted save then full discard dismissal retains the late successful saved revision',async()=>{
 const f=await fixture();await click('[data-open-curator="cloud"]');await waitFor(()=>f.status()==='presented');
 await fill('Late saved revision');await click('[data-curator-save]');await waitFor(()=>f.requests.length===1);
 await userEvent.keyboard('{Escape}');await waitFor(()=>f.app.store.state.confirmAlertPresentation.status==='presented');
 await click('[data-confirm-discard]');await waitFor(()=>f.status()==='idle');f.requests[0]!.resolve();await settle();
 console.log('ASTRA_MOUNTED_LATE',JSON.stringify({status:f.status(),catalog:f.app.store.state.specs.cloud!.curatorNotes,trace:f.trace}));
 expect(f.app.store.state.specs.cloud!.curatorNotes).toBe('Late saved revision');expect(f.status()).toBe('idle');
});
it('trusted reopen and second save cannot be rolled back by the first late result',async()=>{
 const f=await fixture();await click('[data-open-curator="cloud"]');await waitFor(()=>f.status()==='presented');
 await fill('Old revision');await click('[data-curator-save]');await waitFor(()=>f.requests.length===1);
 await userEvent.keyboard('{Escape}');await waitFor(()=>f.app.store.state.confirmAlertPresentation.status==='presented');await click('[data-confirm-discard]');await waitFor(()=>f.status()==='idle'&&f.app.store.state.confirmAlertPresentation.status==='idle');
 await click('[data-open-curator="cloud"]');await waitFor(()=>f.status()==='presented');await fill('New revision');await click('[data-curator-save]');await waitFor(()=>f.requests.length===2);
 f.requests[1]!.resolve();await waitFor(()=>!f.app.store.state.curator!.isSaving);f.requests[0]!.resolve();await settle();
 console.log('ASTRA_MOUNTED_ORDER',JSON.stringify({catalog:f.app.store.state.specs.cloud!.curatorNotes,draft:f.app.store.state.curator!.spec.curatorNotes,trace:f.trace}));
 expect(f.app.store.state.specs.cloud!.curatorNotes).toBe('New revision');
});
