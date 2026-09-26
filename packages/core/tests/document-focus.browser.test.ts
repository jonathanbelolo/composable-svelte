import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { focusTrap } from '../src/lib/actions/focusTrap.js';
import { enrollLayer, requestNavigationFocus, type DismissalIdentity, type LayerHandle } from '../src/lib/actions/dismissalCoordinator.js';
import { candidates, deepActive } from '../src/lib/actions/focusEligibility.js';
const cleanup: (() => void)[] = [];
function region(html = '<button>First</button><button>Last</button>') {
 const node = document.createElement('section'); node.innerHTML = html; document.body.append(node);
 cleanup.push(() => node.remove()); return node;
}
function trap(node: HTMLElement) { const action = focusTrap(node); cleanup.push(action.destroy); return action; }
afterEach(async () => { for (const release of cleanup.splice(0).reverse()) release(); await tick(); });
it('baseline: destroying before initial focus cannot steal from a newer authority', async () => {
 const old = region(), newer = region('<button>New</button>');
 const action = trap(old); action.destroy(); newer.querySelector('button')!.focus();
 await new Promise(resolve => setTimeout(resolve, 10));
 expect(document.activeElement).toBe(newer.querySelector('button'));
});
it('baseline: an empty dialog focuses its boundary and prevents Tab escape', async () => {
 const node = region('<p>No controls</p>'); trap(node); await tick();
 expect(document.activeElement).toBe(node);
 const event = new KeyboardEvent('keydown', {key:'Tab',bubbles:true,cancelable:true}); node.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(true);
});
it('baseline: fixed position controls receive initial focus', async () => {
 const node = region('<button style="position:fixed;top:20px">Fixed</button>'); trap(node); await tick();
 await expect.poll(()=>document.activeElement).toBe(node.firstElementChild);
});
it('orders native controls, radio groups, fieldsets and positive tabindex', () => {
 const node = region('<button tabindex="2">Second</button><button tabindex="1">First</button><fieldset disabled><legend><button>Legend</button></legend><input></fieldset><input type="radio" name="focus-test-radio" checked><input type="radio" name="focus-test-radio"><div contenteditable="true">Edit</div><div inert><button>Inert</button></div><div hidden><button>Hidden</button></div>');
 expect(candidates(node).map(element=>element.textContent || element.tagName)).toEqual(['First','Second','Legend','INPUT','Edit']);
});
it('includes open shadow controls and preserves hidden/inert ancestor filtering', () => {
 const node=region('<div></div>'); const host=node.firstElementChild!; const shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML='<button>Shadow</button>'; expect(candidates(node)).toEqual([shadow.querySelector('button')]);
 host.setAttribute('inert',''); expect(candidates(node)).toEqual([]);
});
it('coalesces accepted navigation ahead of an old trigger restore', async () => {
 const trigger=region('<button>Trigger</button>').firstElementChild as HTMLButtonElement;trigger.focus();
 const node=region(), page=region('<button>Page</button>').firstElementChild as HTMLButtonElement;
 const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 handle.release();requestNavigationFocus(document,{live:()=>true,target:()=>page});await tick();
 expect(document.activeElement).toBe(page);
});
it('new modal outranks accepted navigation and old restoration',async()=>{
 const old=region(),next=region('<button>Modal</button>'),page=region('<button>Page</button>').firstElementChild as HTMLButtonElement;
 const a=enrollLayer({node:old,focus:{node:old,modal:true}});cleanup.push(()=>a.release(false));await tick();a.release();
 requestNavigationFocus(document,{live:()=>true,target:()=>page});const b=enrollLayer({node:next,focus:{node:next,modal:true}});cleanup.push(()=>b.release(false));await tick();
 expect(document.activeElement).toBe(next.firstElementChild);
});
it('retired navigation intent does not focus and new explicit target is a positive control',async()=>{
 const node=region(); const first=node.firstElementChild as HTMLButtonElement,last=node.lastElementChild as HTMLButtonElement;first.focus();
 const cancel=requestNavigationFocus(document,{live:()=>true,target:()=>last});cancel();await tick();expect(document.activeElement).toBe(first);
 requestNavigationFocus(document,{live:()=>true,target:()=>last});await tick();expect(document.activeElement).toBe(last);
});
it('same-node identity replacement retires old initial focus until explicit refresh',async()=>{
 const node=region(),outside=region('<button>Outside</button>').firstElementChild as HTMLButtonElement;let identity=1;
 const handle=enrollLayer({node,identity:()=>identity,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));identity=2;outside.focus();await tick();expect(document.activeElement).toBe(outside);
 handle.refresh();await tick();expect(document.activeElement).toBe(node.firstElementChild);
});
it('a reentrant focus handler can retire its owner without stale fallback',async()=>{
 const node=region();let handle:LayerHandle;const outside=region('<button>New owner</button>').firstElementChild as HTMLButtonElement;
 node.firstElementChild!.addEventListener('focus',()=>{handle.release(false);outside.focus();},{once:true});
 handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();expect(document.activeElement).toBe(outside);
});
it('temporary empty-boundary tabindex preserves a newer author write',async()=>{
 const node=region('Empty');const action=trap(node);await tick();expect(node.getAttribute('tabindex')).toBe('-1');
 node.setAttribute('tabindex','0');action.destroy();await tick();expect(node.getAttribute('tabindex')).toBe('0');
});
it('Tab cycles the top modal only and programmatic focus outside returns inside',async()=>{
 const a=region(),b=region(),outside=region('<button>Outside</button>').firstElementChild as HTMLButtonElement;
 const first=trap(a);await tick();const second=trap(b);await tick();
 (b.lastElementChild as HTMLButtonElement).focus();b.lastElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
 expect(deepActive(document)).toBe(b.firstElementChild);outside.focus();expect(deepActive(document)).toBe(b.firstElementChild);
 second.destroy();await tick();expect(a.contains(document.activeElement)).toBe(true);first.destroy();
});

import { mount, unmount } from 'svelte';
import Nested from './test-components/DocumentFocusNested.svelte';
it.each(['modal','popover'] as const)('initial actual nested %s receives focus despite child-first action enrollment',async innerKind=>{
 const target=region('');const instance=mount(Nested,{target,props:{innerKind}});cleanup.push(()=>{void unmount(instance);});await tick();
 await expect.poll(()=>(document.activeElement as HTMLElement).hasAttribute('data-inner-first')).toBe(true);
 const inner=document.querySelector<HTMLElement>('[data-inner]')!;
 (inner.lastElementChild as HTMLButtonElement).click();await tick();
 expect(document.querySelector('[data-inner]')).toBeNull();await expect.poll(()=>(document.activeElement as HTMLElement).hasAttribute('data-outer-first')).toBe(true);
});
it('passive portaled descendant belongs to modal containment without a second trap',async()=>{
 const node=region(),portal=region('<button>Menu</button>');const parent={parent:undefined};
 const a=enrollLayer({node,ancestry:parent,focus:{node,modal:true}});cleanup.push(()=>a.release(false));await tick();
 const b=enrollLayer({node:portal,ancestry:{parent},focus:{node:portal,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));await tick();
 (portal.firstElementChild as HTMLButtonElement).focus();expect(document.activeElement).toBe(portal.firstElementChild);
 portal.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(node.firstElementChild);
});
it('last owner releases document listeners synchronously before pending focus flush',async()=>{
 const node=region();const remove=vi.spyOn(document,'removeEventListener');cleanup.push(()=>remove.mockRestore());
 const handle=enrollLayer({node,focus:{node,modal:true}});handle.release(false);
 expect(remove.mock.calls.filter(([type])=>['focusin','keydown','pointerdown'].includes(type))).toHaveLength(3);await tick();
});
it('focus operations are isolated to the actual iframe document',async()=>{
 const iframe=document.createElement('iframe');document.body.append(iframe);cleanup.push(()=>iframe.remove());
 const other=iframe.contentDocument!;other.body.innerHTML='<section><button>Other</button></section>';
 const node=other.querySelector('section')!;const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 expect(other.activeElement).toBe(node.firstElementChild);
 const main=region('<button>Main</button>');(main.firstElementChild as HTMLButtonElement).focus();expect(document.activeElement).toBe(main.firstElementChild);
});
it('open-shadow positive tab order remains scoped to its host',async()=>{
 const node=region('<button tabindex="2">Light positive</button><div></div>');const host=node.lastElementChild!;
 const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<button tabindex="1">Shadow positive</button>';
 trap(node);await tick();expect(deepActive(document)).toBe(node.firstElementChild);
 node.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(deepActive(document)).toBe(shadow.firstElementChild);
});

import { hydrate } from 'svelte';
import serverHTML from './fixtures/document-focus-ssr.html?raw';
it('hydrates actual server markup and focuses the nested owner once after attachment',async()=>{
 const target=region(serverHTML);const existing=target.querySelector('[data-inner-first]');const errors=vi.spyOn(console,'warn');cleanup.push(()=>errors.mockRestore());
 const instance=hydrate(Nested,{target});cleanup.push(()=>{void unmount(instance);});await tick();
 expect(document.querySelector('[data-inner-first]')).toBe(existing);await expect.poll(()=>document.activeElement).toBe(existing);
 expect(errors.mock.calls.filter(args=>String(args[0]).includes('hydration'))).toHaveLength(0);
});
it('navigation focuses a declared programmatically focusable heading',async()=>{
 const target=region('<h1 tabindex="-1">Page title</h1>').firstElementChild as HTMLElement;
 requestNavigationFocus(document,{live:()=>true,target:()=>target});await tick();expect(document.activeElement).toBe(target);expect(target.getAttribute('tabindex')).toBe('-1');
});
it('a removed trigger falls back to the connected document without leaking tabindex',async()=>{
 const trigger=region('<button>Removed</button>').firstElementChild as HTMLButtonElement;trigger.focus();const node=region();const action=trap(node);await tick();trigger.remove();action.destroy();await tick();expect(document.activeElement).toBe(document.body);expect(document.body.hasAttribute('tabindex')).toBe(false);
});
it('a focus failure cannot erase a reentrantly queued newer accepted navigation',async()=>{
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});cleanup.push(()=>error.mockRestore());
 const failure=new Error('host focus failed'),node=region(),page=region('<button>New route</button>').firstElementChild as HTMLButtonElement;let handle:LayerHandle;
 const button=node.firstElementChild as HTMLButtonElement;button.focus=()=>{handle.release(false);requestNavigationFocus(document,{live:()=>true,target:()=>page});throw failure;};
 handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await expect.poll(()=>document.activeElement).toBe(page);
 expect(error).toHaveBeenCalledTimes(1);expect(error).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:',failure);
});
it('N-14a a caught invalid modal enrollment inside navigation target resolution cannot dispose the active coordinator or erase the newer navigation',async()=>{
 const page=button('Page'),invalid=region(),failure=vi.fn();
 requestNavigationFocus(document,{live:()=>true,target:()=>{
  try{enrollLayer({node:invalid,identity:failure,focus:{node:invalid,modal:true,contain:false,returnFocus:failure}});}catch{/* expected contract rejection */}
  return page;
 }});
 await expect.poll(()=>document.activeElement).toBe(page);expect(failure).not.toHaveBeenCalled();
 const node=region(),handle=modalLayer(node);await tick();expect(document.activeElement).toBe(node.firstElementChild);
});

it('throwing initial focus metadata does not enroll document listeners',()=>{
 const add=vi.spyOn(document,'addEventListener');cleanup.push(()=>add.mockRestore());const node=region();
 expect(()=>enrollLayer({node,focus:{node,modal:true,returnFocus:()=>{throw new Error('invalid target');}}})).toThrow('invalid target');
 expect(add.mock.calls.filter(([type])=>['focusin','keydown','pointerdown'].includes(type))).toHaveLength(0);
});
it('a modal created by navigation target resolution supersedes that target',async()=>{
 const page=region('<button>Page</button>').firstElementChild as HTMLButtonElement,node=region();
 requestNavigationFocus(document,{live:()=>true,target:()=>{const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));return page;}});
 await expect.poll(()=>document.activeElement).toBe(node.firstElementChild);
});
it.each([false,true])('W-05a released modal restores its trigger (focus-less enrollment in the same tick: %s; false is the control)',async enroll=>{
 const trigger=region('<button>Trigger</button>').firstElementChild as HTMLButtonElement;trigger.focus();
 const node=region();const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 expect(document.activeElement).toBe(node.firstElementChild);handle.release();
 if(enroll){const extra=enrollLayer({node:region('')});cleanup.push(()=>extra.release(false));}
 await tick();expect(document.activeElement).toBe(trigger);
});
it.each([false,true])('W-05b outside focus returns to the Tab-moved control (focus-less enrollment inside its focus handler: %s; false is the control)',async enroll=>{
 const node=region(),outside=region('<button>Outside</button>').firstElementChild as HTMLButtonElement;let enrolled=false;
 const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();expect(document.activeElement).toBe(node.firstElementChild);
 if(enroll)node.lastElementChild!.addEventListener('focus',()=>{enrolled=true;const extra=enrollLayer({node:region('')});cleanup.push(()=>extra.release(false));},{once:true});
 node.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
 expect(document.activeElement).toBe(node.lastElementChild);expect(enrolled).toBe(enroll);
 outside.focus();expect(document.activeElement).toBe(node.lastElementChild);
});
it('W-03a refresh of an unrelated passive layer keeps the released modal trigger restore',async()=>{
 const trigger=region('<button>Trigger</button>').firstElementChild as HTMLButtonElement;trigger.focus();
 const a=region(),b=region('<button>Passive</button>');let identity=1;
 const released=enrollLayer({node:a,focus:{node:a,modal:true}});cleanup.push(()=>released.release(false));
 const passive=enrollLayer({node:b,identity:()=>identity,focus:{node:b,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>passive.release(false));
 await tick();expect(document.activeElement).toBe(a.firstElementChild);
 released.release();identity=2;passive.refresh();await tick();expect(document.activeElement).toBe(trigger);
});
it('W-03a control: refresh of the newer modal authority takes initial focus over the armed restore',async()=>{
 const trigger=region('<button>Trigger</button>').firstElementChild as HTMLButtonElement;trigger.focus();
 const a=region(),b=region('<button>Authority</button>');let identity=1;
 const released=enrollLayer({node:a,focus:{node:a,modal:true}});cleanup.push(()=>released.release(false));await tick();
 expect(document.activeElement).toBe(a.firstElementChild);
 const authority=enrollLayer({node:b,identity:()=>identity,focus:{node:b,modal:true}});cleanup.push(()=>authority.release(false));
 released.release();identity=2;authority.refresh();await tick();expect(document.activeElement).toBe(b.firstElementChild);
});
it('W-03c refresh after identity churn leaves focus that is already inside the region unchanged',async()=>{
 const node=region(),last=node.lastElementChild as HTMLButtonElement;let identity=1;
 const handle=enrollLayer({node,identity:()=>identity,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 expect(document.activeElement).toBe(node.firstElementChild);last.focus();expect(document.activeElement).toBe(last);
 const moved=vi.spyOn(node.firstElementChild as HTMLButtonElement,'focus');cleanup.push(()=>moved.mockRestore());
 identity=2;handle.refresh();await tick();expect(document.activeElement).toBe(last);expect(moved).not.toHaveBeenCalled();
});
it('W-03c control: refresh with focus outside the stale region focuses the first control',async()=>{
 const node=region(),outside=region('<button>Outside</button>').firstElementChild as HTMLButtonElement;let identity=1;
 const handle=enrollLayer({node,identity:()=>identity,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 (node.lastElementChild as HTMLButtonElement).focus();expect(document.activeElement).toBe(node.lastElementChild);
 identity=2;outside.focus();expect(document.activeElement).toBe(outside);
 handle.refresh();await tick();expect(document.activeElement).toBe(node.firstElementChild);
});
it('W-09 synthetic focusin on a layer in a createHTMLDocument() document does not throw',()=>{
 const other=document.implementation.createHTMLDocument();other.body.innerHTML='<section><button>Other</button></section>';
 const add=vi.spyOn(other,'addEventListener');cleanup.push(()=>add.mockRestore());const node=other.querySelector('section')!;
 const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));
 const listener=add.mock.calls.find(([type])=>type==='focusin')![1] as EventListener;const thrown:unknown[]=[];
 // dispatchEvent reports listener exceptions instead of rethrowing them, so rerun the enrolled listener during the real dispatch.
 other.addEventListener('focusin',event=>{try{listener(event);}catch(error){thrown.push(error);}},{once:true});
 node.firstElementChild!.dispatchEvent(new FocusEvent('focusin',{bubbles:true,composed:true}));expect(thrown).toEqual([]);
});
it('W-09 control: the same synthetic focusin in the main document still redirects into the modal',async()=>{
 const node=region(),outside=region('<button>Outside</button>').firstElementChild as HTMLButtonElement;
 const handle=enrollLayer({node,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 const redirected=vi.spyOn(node.firstElementChild as HTMLButtonElement,'focus');cleanup.push(()=>redirected.mockRestore());
 outside.dispatchEvent(new FocusEvent('focusin',{bubbles:true,composed:true}));
 expect(redirected).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(node.firstElementChild);
});
it('PKT2 control: stable-identity refresh is a focus no-op',async()=>{
 const node=region(),identity={};const handle=enrollLayer({node,identity:()=>identity,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 const first=node.firstElementChild as HTMLButtonElement,last=node.lastElementChild as HTMLButtonElement;last.focus();
 const firstFocus=vi.spyOn(first,'focus'),lastFocus=vi.spyOn(last,'focus');cleanup.push(()=>firstFocus.mockRestore(),()=>lastFocus.mockRestore());
 handle.refresh();await tick();expect(document.activeElement).toBe(last);expect(firstFocus).not.toHaveBeenCalled();expect(lastFocus).not.toHaveBeenCalled();
});

import Presentation from './test-components/DocumentFocusPresentation.svelte';
const kinds=['modal','sheet','drawer','alert','popover'] as const;
const button=(label:string)=>region(`<button>${label}</button>`).firstElementChild as HTMLButtonElement;
const escape=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
function modalLayer(node:HTMLElement,extra:{onEscape?:(event:KeyboardEvent)=>void;focusActive?:boolean}={}){
 const handle=enrollLayer({node,focus:{node,modal:true},...extra});cleanup.push(()=>handle.release(false));return handle;
}
it.each([true,false])('W-01a accepted navigation beats a focus-retired modal that keeps Escape above its dismissal-only parent (released in the retirement tick: %s)',async sameTick=>{
 button('Trigger').focus();const node=region(),page=button('Page'),parentEscape=vi.fn(),childEscape=vi.fn();
 const parent=enrollLayer({node:region(''),onEscape:parentEscape});cleanup.push(()=>parent.release(false));
 const child=modalLayer(node,{onEscape:childEscape});await tick();expect(document.activeElement).toBe(node.firstElementChild);
 child.setFocusActive(false);requestNavigationFocus(document,{live:()=>true,target:()=>page});
 if(!sameTick){await tick();expect(document.activeElement).toBe(page);}
 escape();expect(childEscape).toHaveBeenCalledTimes(1);expect(parentEscape).not.toHaveBeenCalled();expect(child.live).toBe(true);
 child.release();await tick();expect(document.activeElement).toBe(page);
 escape();expect(parentEscape).toHaveBeenCalledTimes(1);expect(childEscape).toHaveBeenCalledTimes(1);
});
it.each([false,true])('W-01a control: repeated retirement without navigation restores the trigger once (released in the same tick: %s)',async release=>{
 const trigger=button('Trigger');trigger.focus();const node=region(),handle=modalLayer(node);await tick();
 expect(document.activeElement).toBe(node.firstElementChild);handle.setFocusActive(false);handle.setFocusActive(false);
 if(release)handle.release();
 await tick();expect(document.activeElement).toBe(trigger);expect(handle.live).toBe(!release);
});
it.each(['surviving','new'] as const)('W-01a control: a %s modal outranks accepted navigation after focus retirement',async which=>{
 const under=region('<button>Under</button>'),node=region(),page=button('Page');
 if(which==='surviving'){modalLayer(under);await tick();}
 const child=modalLayer(node);await tick();expect(document.activeElement).toBe(node.firstElementChild);
 child.setFocusActive(false);requestNavigationFocus(document,{live:()=>true,target:()=>page});
 if(which==='new')modalLayer(under);
 await tick();expect(document.activeElement).toBe(under.firstElementChild);
});
it('W-01a control: reactivation is a fresh focus authority with a recaptured trigger',async()=>{
 const trigger=button('Trigger'),later=button('Later');trigger.focus();const node=region(),handle=modalLayer(node);await tick();
 (node.lastElementChild as HTMLButtonElement).focus();handle.setFocusActive(false);await tick();expect(document.activeElement).toBe(trigger);
 later.focus();handle.setFocusActive(true);handle.setFocusActive(true);await tick();expect(document.activeElement).toBe(node.firstElementChild);
 handle.release();await tick();expect(document.activeElement).toBe(later);
});
it('W-01a control: a layer enrolled focus-inactive neither takes focus nor cancels an armed restore until activated',async()=>{
 const trigger=button('Trigger');trigger.focus();const old=region(),node=region('<button>Dormant</button>'),released=modalLayer(old);await tick();
 released.release();const dormant=modalLayer(node,{focusActive:false});await tick();expect(document.activeElement).toBe(trigger);
 dormant.setFocusActive(true);await tick();expect(document.activeElement).toBe(node.firstElementChild);
});
it('W-01b outside focus is redirected before focus retirement and left alone after it',async()=>{
 const node=region(),outside=button('Outside'),handle=modalLayer(node);await tick();
 outside.focus();expect(document.activeElement).toBe(node.firstElementChild);
 handle.setFocusActive(false);outside.focus();expect(document.activeElement).toBe(outside);
 await tick();expect(document.activeElement).toBe(outside);expect(handle.live).toBe(true);
});
function present(kind:typeof kinds[number]){const app=mount(Presentation,{target:region(''),props:{kind}});cleanup.push(()=>{void unmount(app);});return app;}
const overlayFocused=()=>(document.activeElement as HTMLElement).hasAttribute('data-overlay-first');
it.each(kinds)('W-01c mounted %s entering dismissing yields focus to accepted navigation and stops redirecting',async kind=>{
 const page=button('Page'),outside=button('Outside'),app=present(kind);await expect.poll(overlayFocused).toBe(true);
 app.phase('dismissing');requestNavigationFocus(document,{live:()=>true,target:()=>page});await tick();
 expect(document.querySelector('[data-overlay]')).not.toBeNull();await expect.poll(()=>document.activeElement).toBe(page);
 outside.focus();await tick();expect(document.activeElement).toBe(outside);
});
it.each(kinds)('W-01d mounted %s whose store becomes null while dismissing does not pull focus back; a real replacement owner reactivates it (control)',async kind=>{
 const outside=button('Outside'),app=present(kind);await expect.poll(overlayFocused).toBe(true);
 app.phase('dismissing');await tick();outside.focus();expect(document.activeElement).toBe(outside);
 app.clearStore();await tick();await tick();
 expect(document.querySelector('[data-overlay]')).not.toBeNull();expect(document.activeElement).toBe(outside);
 app.replaceOwner();app.phase('presented');await tick();await expect.poll(overlayFocused).toBe(true);
 app.phase('dismissing');await tick();await expect.poll(()=>document.activeElement).toBe(outside);
});

import { createRawSnippet, untrack } from 'svelte';
import { Effect } from '../src/lib/effect.js';
import { createStore } from '../src/lib/store.svelte.js';
import { ManagedIntegrationBuilder, optionalSlot } from '../src/lib/navigation/managed-integration.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';
import type { Reducer } from '../src/lib/types.js';
import ModalPrimitive from '../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
import PopoverPrimitive from '../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
// Standalone primitives use the consumer shape of DocumentFocusNested.svelte (children({bindContent}) plus use:bindContent) through a raw
// snippet, so the hydrated fixture and its static server HTML keep their exact marker structure and node identity.
type BindContent=(node:HTMLElement)=>void|{destroy?:()=>void};
const standaloneContent=createRawSnippet<[{bindContent:BindContent}]>(slot=>({
 render:()=>'<section data-standalone><button data-standalone-first>Standalone first</button><button data-standalone-last>Standalone last</button></section>',
 setup:node=>{const bound=untrack(()=>slot().bindContent(node as HTMLElement));return()=>{if(typeof bound==='object')bound.destroy?.();};}
}));
type DummyChild=Record<string,never>;type DummyChildAction={type:'noop'};
type DummyRoot={overlay:DummyChild|null};type DummyAction={type:'overlay';action:PresentationAction<DummyChildAction>};
const dummySlot=optionalSlot<DummyRoot,DummyAction>()('overlay');
const dummyChild:Reducer<DummyChild,DummyChildAction>=state=>[state,Effect.none()];
const dummyRoot:Reducer<DummyRoot,DummyAction>=(state,action)=>action.type==='overlay'&&action.action.type==='dismiss'?[{overlay:{}},Effect.none()]:[state,Effect.none()];
const dummyComposition=new ManagedIntegrationBuilder<DummyRoot,DummyAction,undefined>(dummyRoot).with(dummySlot,dummyChild).build();
function dummyPresentation(){
 const root=createStore({initialState:{overlay:{}},...dummyComposition}),store=dummyComposition.bind(root,dummySlot);
 if(!store){root.destroy();throw new Error('dummy presentation owner was not created');}
 return{root,store};
}
function standalone(kind:'modal'|'popover',disableClickOutside=false){
 const {root,store}=dummyPresentation(),target=region('');
 const app=kind==='modal'
  ?mount(ModalPrimitive,{target,props:{store,disableClickOutside,children:standaloneContent}})
  :mount(PopoverPrimitive,{target,props:{store,disableClickOutside,children:standaloneContent}});
 cleanup.push(()=>{void unmount(app);root.destroy();});
}
const standaloneControl=(which:'first'|'last')=>document.querySelector<HTMLButtonElement>(`[data-standalone-${which}]`)!;
const standaloneFocused=()=>document.activeElement===standaloneControl('first');
function tab(from:Element,shiftKey=false){const event=new KeyboardEvent('keydown',{key:'Tab',shiftKey,bubbles:true,cancelable:true});from.dispatchEvent(event);return event;}
it('DF-07 modal Tab capture cannot be bypassed by descendant bubble stopPropagation',async()=>{
 const node=region(),handle=modalLayer(node);await tick();const first=node.firstElementChild as HTMLButtonElement;
 first.addEventListener('keydown',event=>event.stopPropagation());const event=tab(first);
 expect(event.defaultPrevented).toBe(true);expect(document.activeElement).toBe(node.lastElementChild);expect(handle.live).toBe(true);
});
it('DF-07 an earlier document-capture preventDefault veto retains control of modal Tab',async()=>{
 const veto=(event:KeyboardEvent)=>{if(event.key==='Tab')event.preventDefault();};document.addEventListener('keydown',veto,true);cleanup.push(()=>document.removeEventListener('keydown',veto,true));
 const node=region(),handle=modalLayer(node);await tick();const first=node.firstElementChild as HTMLButtonElement;
 const event=tab(first);expect(event.defaultPrevented).toBe(true);expect(document.activeElement).toBe(first);expect(handle.live).toBe(true);
 document.removeEventListener('keydown',veto,true);
});
it.each(['ctrlKey','altKey','metaKey'] as const)('DF-07 modified modal Tab with %s remains native and does not move focus',async modifier=>{
 const node=region(),handle=modalLayer(node);await tick();const first=node.firstElementChild as HTMLButtonElement;first.focus();
 const event=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true,[modifier]:true});first.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(false);expect(document.activeElement).toBe(first);expect(handle.live).toBe(true);
});
it('DF-07 descendant bubble preventDefault cannot retroactively veto modal Tab capture authority',async()=>{
 const node=region(),handle=modalLayer(node);await tick();const first=node.firstElementChild as HTMLButtonElement;
 first.addEventListener('keydown',event=>event.preventDefault());const event=tab(first);
 expect(event.defaultPrevented).toBe(true);expect(document.activeElement).toBe(node.lastElementChild);expect(handle.live).toBe(true);
});
it.each([false,true])('DF-08 Tab skips a throwing focus candidate in direction and reports it once (reverse: %s)',async reverse=>{
 const reported=vi.spyOn(console,'error').mockImplementation(()=>{});cleanup.push(()=>reported.mockRestore());
 const node=region('<button>First</button><button>Fault</button><button>Last</button>'),handle=modalLayer(node);await tick();
 const first=node.children[0] as HTMLButtonElement,fault=node.children[1] as HTMLButtonElement,last=node.children[2] as HTMLButtonElement, failure=new Error('tab focus failed');
 fault.focus=()=>{throw failure;};(reverse?last:first).focus();reported.mockClear();const event=tab(reverse?last:first,reverse);
 expect(event.defaultPrevented).toBe(true);expect(document.activeElement).toBe(reverse?first:last);
 expect(reported).toHaveBeenCalledTimes(1);expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:',failure);expect(handle.live).toBe(true);
});
it('DF-08 focusin correction skips a throwing preferred candidate and falls back to the boundary only when all candidates fail',async()=>{
 const reported=vi.spyOn(console,'error').mockImplementation(()=>{});cleanup.push(()=>reported.mockRestore());
 const node=region(),outside=button('Outside'),handle=modalLayer(node);await tick();const first=node.firstElementChild as HTMLButtonElement,last=node.lastElementChild as HTMLButtonElement;
 const firstFailure=new Error('first focus failed');first.focus=()=>{throw firstFailure;};reported.mockClear();outside.focus();
 expect(document.activeElement).toBe(last);expect(reported).toHaveBeenCalledTimes(1);expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:',firstFailure);
 const lastFailure=new Error('last focus failed');last.focus=()=>{throw lastFailure;};reported.mockClear();outside.focus();
 expect(document.activeElement).toBe(node);expect(reported.mock.calls).toEqual([
  ['[Composable Svelte] Focus coordination failed:',lastFailure],
  ['[Composable Svelte] Focus coordination failed:',firstFailure]
 ]);expect(handle.live).toBe(true);
});
it('DF-08 a throwing event-time focus identity is reported once and skipped for a healthy lower modal, then recovers on the next event',async()=>{
 const reported=vi.spyOn(console,'error').mockImplementation(()=>{});cleanup.push(()=>reported.mockRestore());
 const lower=region('<button>Lower</button>'),upper=region('<button>Upper</button>'),outside=button('Outside'),lowerHandle=modalLayer(lower);await tick();
 let fault=false;const failure=new Error('focus identity failed'),upperHandle=enrollLayer({node:upper,identity:()=>{if(fault)throw failure;return 1;},focus:{node:upper,modal:true}});cleanup.push(()=>upperHandle.release(false));
 await tick();expect(document.activeElement).toBe(upper.firstElementChild);fault=true;reported.mockClear();outside.focus();
 expect(document.activeElement).toBe(lower.firstElementChild);expect(reported).toHaveBeenCalledTimes(1);expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:',failure);
 fault=false;reported.mockClear();outside.focus();expect(document.activeElement).toBe(upper.firstElementChild);expect(reported).not.toHaveBeenCalled();expect(lowerHandle.live).toBe(true);expect(upperHandle.live).toBe(true);
});
it('W-02a background focus stays outside a mounted standalone Popover with disableClickOutside',async()=>{
 const background=region('<input aria-label="Background">').firstElementChild as HTMLInputElement;standalone('popover',true);await expect.poll(standaloneFocused).toBe(true);
 background.focus();expect(document.activeElement).toBe(background);await tick();expect(document.activeElement).toBe(background);
 expect(document.querySelector('[data-standalone]')).not.toBeNull();
});
it('W-02a control: the same background focus beside a mounted Modal is redirected inside',async()=>{
 const background=region('<input aria-label="Background">').firstElementChild as HTMLInputElement;standalone('modal',true);await expect.poll(standaloneFocused).toBe(true);
 background.focus();expect(document.activeElement).toBe(standaloneControl('first'));await tick();expect(document.activeElement).toBe(standaloneControl('first'));
});
it('W-02b standalone Popover keeps the root focusTrap baseline: Tab and Shift+Tab wrap at its boundary',async()=>{
 standalone('popover');await expect.poll(standaloneFocused).toBe(true);const first=standaloneControl('first'),last=standaloneControl('last');
 last.focus();const forward=tab(last);expect(forward.defaultPrevented).toBe(true);expect(document.activeElement).toBe(first);
 const backward=tab(first,true);expect(backward.defaultPrevented).toBe(true);expect(document.activeElement).toBe(last);
});
it('W-02b control: a nested Popover-in-modal still Tab-cycles through the modal region instead of its own boundary',async()=>{
 const instance=mount(Nested,{target:region(''),props:{innerKind:'popover'}});cleanup.push(()=>{void unmount(instance);});
 await expect.poll(()=>(document.activeElement as HTMLElement).hasAttribute('data-inner-first')).toBe(true);
 const innerLast=document.querySelector('[data-inner]')!.lastElementChild as HTMLButtonElement,outerFirst=document.querySelector<HTMLButtonElement>('[data-outer-first]')!;
 innerLast.focus();expect(document.activeElement).toBe(innerLast);
 tab(innerLast);expect(document.activeElement).toBe(outerFirst);
 tab(outerFirst,true);expect(document.activeElement).toBe(innerLast);
});
it('W-02c outside Tab stays native when focus is outside a standalone non-modal Popover',async()=>{
 const background=region('<input aria-label="Background">').firstElementChild as HTMLInputElement;standalone('popover',true);await expect.poll(standaloneFocused).toBe(true);
 background.focus();expect(document.activeElement).toBe(background);
 const forward=tab(background);expect(forward.defaultPrevented).toBe(false);expect(document.activeElement).toBe(background);
 const backward=tab(background,true);expect(backward.defaultPrevented).toBe(false);expect(document.activeElement).toBe(background);
 expect(document.querySelector('[data-standalone]')!.contains(document.activeElement)).toBe(false);
 // Containment is the only new precondition: the same Popover still wraps once focus starts inside it.
 const last=standaloneControl('last');last.focus();const inside=tab(last);expect(inside.defaultPrevented).toBe(true);expect(document.activeElement).toBe(standaloneControl('first'));
});
it('W-02c control: a Modal keeps document-wide Tab capture for the same outside event target',async()=>{
 const background=region('<input aria-label="Background">').firstElementChild as HTMLInputElement;standalone('modal',true);await expect.poll(standaloneFocused).toBe(true);
 const first=standaloneControl('first'),last=standaloneControl('last');
 const forward=tab(background);expect(forward.defaultPrevented).toBe(true);expect(document.activeElement).toBe(last);
 const wrapped=tab(background);expect(wrapped.defaultPrevented).toBe(true);expect(document.activeElement).toBe(first);
 const backward=tab(background,true);expect(backward.defaultPrevented).toBe(true);expect(document.activeElement).toBe(last);
});
const spacer='<div style="height:600px"></div>';
function scroller(html:string){const node=region(html);node.style.cssText='height:120px;overflow-y:auto';return node;}
const settle=()=>new Promise(resolve=>setTimeout(resolve,50));
const inView=(box:HTMLElement,node:HTMLElement)=>{const outer=box.getBoundingClientRect(),inner=node.getBoundingClientRect();return inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;};
it('W-04a coordinator Tab and Shift+Tab scroll a below-fold control into view like native focus while initial focus does not',async()=>{
 const box=scroller('<button>Top</button>'+spacer+'<button>Bottom</button>'),top=box.firstElementChild as HTMLButtonElement,bottom=box.lastElementChild as HTMLButtonElement;
 bottom.focus();await expect.poll(()=>inView(box,bottom)).toBe(true);expect(box.scrollTop).toBeGreaterThan(0);bottom.blur();
 box.scrollTop=box.scrollHeight;const end=box.scrollTop;expect(end).toBeGreaterThan(0);
 modalLayer(box);await tick();expect(document.activeElement).toBe(top);await settle();expect(box.scrollTop).toBe(end);
 box.scrollTop=0;tab(top);expect(document.activeElement).toBe(bottom);await expect.poll(()=>inView(box,bottom)).toBe(true);expect(box.scrollTop).toBeGreaterThan(0);
 box.scrollTop=box.scrollHeight;tab(bottom,true);expect(document.activeElement).toBe(top);await expect.poll(()=>inView(box,top)).toBe(true);expect(box.scrollTop).toBeLessThan(end);
});
it('W-04a control: focusin correction back to a below-fold control does not scroll',async()=>{
 const box=scroller('<button>Top</button>'+spacer+'<button>Bottom</button>'),bottom=box.lastElementChild as HTMLButtonElement,outside=button('Outside');
 modalLayer(box);await tick();bottom.focus({preventScroll:true});expect(document.activeElement).toBe(bottom);
 box.scrollTop=0;outside.focus();expect(document.activeElement).toBe(bottom);await settle();expect(box.scrollTop).toBe(0);expect(inView(box,bottom)).toBe(false);
});
it.each([false,true])('W-04b restoring an off-screen trigger scrolls it into view (trigger inside a surviving modal: %s)',async surviving=>{
 const page=scroller(spacer+'<button>Trigger</button>'),trigger=page.lastElementChild as HTMLButtonElement;
 if(surviving){modalLayer(page);await tick();}else trigger.focus({preventScroll:true});
 expect(document.activeElement).toBe(trigger);expect(page.scrollTop).toBe(0);
 const node=region(),handle=modalLayer(node);await tick();expect(document.activeElement).toBe(node.firstElementChild);
 handle.release();await tick();expect(document.activeElement).toBe(trigger);
 await expect.poll(()=>inView(page,trigger)).toBe(true);expect(page.scrollTop).toBeGreaterThan(0);
});
it('W-04b control: accepted navigation to an off-screen target wins the release flush without scrolling',async()=>{
 const page=scroller(spacer+'<button>Trigger</button><button>Page target</button>'),trigger=page.children[1] as HTMLButtonElement,target=page.children[2] as HTMLButtonElement;
 trigger.focus({preventScroll:true});const node=region(),handle=modalLayer(node);await tick();expect(document.activeElement).toBe(node.firstElementChild);
 handle.release();requestNavigationFocus(document,{live:()=>true,target:()=>target});await tick();
 expect(document.activeElement).toBe(target);await settle();expect(page.scrollTop).toBe(0);expect(inView(page,target)).toBe(false);
});

import { flushSync } from 'svelte';
import { portal as portalAction } from '../src/lib/actions/portal.js';
import PortalOrderProbe from './test-components/PortalOrderProbe.svelte';
// PKT-5 (DISM-05/DF-11): a real iframe document is the adoption target. Focusing inside it can make the iframe the main activeElement,
// so main-document inertness is asserted through focus() spies and a focusin watch rather than document.activeElement alone.
function frame(html=''){
 const iframe=document.createElement('iframe');document.body.append(iframe);cleanup.push(()=>iframe.remove());
 const doc=iframe.contentDocument!;doc.body.innerHTML=html;return{iframe,doc};
}
type InnerAction=(node:HTMLElement)=>void|{destroy?:()=>void};
function probeApp(target:HTMLElement,variant:'same'|'child',inner?:InnerAction){
 const steps:[string,Document][]=[];
 const app=mount(PortalOrderProbe,{target:region(''),props:{target,variant,inner,log:(step:string,owner:Document)=>{steps.push([step,owner]);}}});
 cleanup.push(()=>{void unmount(app);});flushSync();return steps;
}
const owners=(steps:[string,Document][],doc:Document)=>steps.map(([,owner])=>owner===document?'main':owner===doc?'frame':'other');
const pointerDown=(target:EventTarget)=>target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
const frameEscape=(doc:Document)=>doc.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
const coordinatorTypes=['focusin','keydown','pointerdown'];
function ledger(doc:Document){
 const add=vi.spyOn(doc,'addEventListener'),remove=vi.spyOn(doc,'removeEventListener');cleanup.push(()=>{add.mockRestore();remove.mockRestore();});
 const pick=(calls:unknown[][])=>calls.map(([type])=>String(type)).filter(type=>coordinatorTypes.includes(type)).sort();
 return{added:()=>pick(add.mock.calls),removed:()=>pick(remove.mock.calls)};
}
it.each(['same','child'] as const)('W-11a %s-component inner action observes the mounting document before the outer use:portal adopts it into an iframe document',variant=>{
 const{doc}=frame(),steps=probeApp(doc.body,variant);
 expect(steps.map(([step])=>step)).toEqual(['inner','outer-before','outer-after']);expect(owners(steps,doc)).toEqual(['main','main','frame']);
 expect(document.querySelector('[data-probe-layer]')).toBeNull();expect(doc.querySelector('[data-probe-layer]')!.ownerDocument).toBe(doc);
});
it.each(['same','child'] as const)('W-11a control: %s-component same-document target logs the mounting document throughout',variant=>{
 const{doc}=frame(),steps=probeApp(region(''),variant);
 expect(steps.map(([step])=>step)).toEqual(['inner','outer-before','outer-after']);expect(owners(steps,doc)).toEqual(['main','main','main']);
 expect(doc.querySelector('[data-probe-layer]')).toBeNull();expect(document.querySelector('[data-probe-layer]')!.ownerDocument).toBe(document);
});
it.each(['same','child'] as const)('W-11b mounted %s-component layer enrolled before use:portal adopts it into an iframe routes Escape, outside pointer and focus only in the target document',async variant=>{
 const{doc}=frame('<button>Frame trigger</button><button>Frame outside</button>');
 const frameTrigger=doc.body.children[0] as HTMLButtonElement,frameOutside=doc.body.children[1] as HTMLButtonElement;
 const mainTrigger=button('Main trigger'),mainOutside=button('Main outside');mainTrigger.focus();
 const mainFocus=vi.spyOn(mainTrigger,'focus');cleanup.push(()=>mainFocus.mockRestore());
 const onEscape=vi.fn(),onPointerOutside=vi.fn(),handles:LayerHandle[]=[];
 const steps=probeApp(doc.body,variant,node=>{
  const enrolled=enrollLayer({node,onEscape,onPointerOutside,focus:{node,modal:true,returnFocus:()=>node.ownerDocument===doc?frameTrigger:mainTrigger}});
  handles.push(enrolled);return{destroy:()=>enrolled.release(false)};
 });
 const handle=handles[0]!,first=doc.querySelector<HTMLButtonElement>('[data-probe-first]')!;
 expect(steps.map(([step])=>step)).toEqual(['inner','outer-before','outer-after']);expect(handles).toHaveLength(1);expect(handle.live).toBe(true);
 await expect.poll(()=>doc.activeElement).toBe(first);
 escape();pointerDown(document.body);await settle();expect(onEscape).not.toHaveBeenCalled();expect(onPointerOutside).not.toHaveBeenCalled();
 mainOutside.focus();expect(document.activeElement).toBe(mainOutside);
 frameEscape(doc);expect(onEscape).toHaveBeenCalledTimes(1);
 pointerDown(first);await settle();expect(onPointerOutside).not.toHaveBeenCalled();
 pointerDown(doc.body);await vi.waitFor(()=>expect(onPointerOutside).toHaveBeenCalledTimes(1));
 frameOutside.focus();frameOutside.dispatchEvent(new FocusEvent('focusin',{bubbles:true,composed:true}));expect(doc.activeElement).toBe(first);
 handle.release();await expect.poll(()=>doc.activeElement).toBe(frameTrigger);expect(mainFocus).not.toHaveBeenCalled();expect(handle.live).toBe(false);
});
it.each([false,true])('W-11b directly portaled pre-enrolled layer keeps its handle, moves its exact listener set and restores only a destination trigger (returnFocus names an origin element: %s)',async foreign=>{
 const{doc}=frame('<button>Frame trigger</button>');const frameTrigger=doc.body.firstElementChild as HTMLButtonElement;
 const mainTrigger=button('Main trigger');mainTrigger.focus();const main=ledger(document),target=ledger(doc);
 const node=region(),handle=enrollLayer({node,focus:{node,modal:true,returnFocus:foreign?()=>mainTrigger:undefined}});cleanup.push(()=>handle.release(false));
 await tick();expect(document.activeElement).toBe(node.firstElementChild);expect(main.added()).toEqual(coordinatorTypes);
 const mainFocus=vi.spyOn(mainTrigger,'focus');cleanup.push(()=>mainFocus.mockRestore());
 frameTrigger.focus();expect(doc.activeElement).toBe(frameTrigger);
 const action=portalAction(node,doc.body);cleanup.push(action.destroy);
 expect(handle.live).toBe(true);expect(main.removed()).toEqual(coordinatorTypes);expect(target.added()).toEqual(coordinatorTypes);expect(target.removed()).toEqual([]);
 await expect.poll(()=>doc.activeElement).toBe(node.firstElementChild);
 handle.release();await expect.poll(()=>doc.activeElement).toBe(foreign?doc.body:frameTrigger);
 expect(mainFocus).not.toHaveBeenCalled();expect(handle.live).toBe(false);
 expect(target.removed()).toEqual(coordinatorTypes);expect(main.added()).toEqual(coordinatorTypes);expect(doc.body.hasAttribute('tabindex')).toBe(false);
});
it('W-11b control: a layer enrolled after the iframe portal takes initial focus and Escape in the target document without touching main listeners',async()=>{
 const{doc}=frame(),main=ledger(document),node=region();const action=portalAction(node,doc.body);cleanup.push(action.destroy);
 const onEscape=vi.fn(),handle=enrollLayer({node,onEscape,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));
 await expect.poll(()=>doc.activeElement).toBe(node.firstElementChild);expect(main.added()).toEqual([]);
 escape();expect(onEscape).not.toHaveBeenCalled();frameEscape(doc);expect(onEscape).toHaveBeenCalledTimes(1);
});
it.each([false,true])('W-11b focus-retired layer adopted before its scheduled restore never restores in the origin document (accepted origin navigation in the same tick: %s)',async navigate=>{
 const{doc}=frame();const trigger=button('Origin trigger'),page=button('Page');trigger.focus();
 const node=region(),handle=modalLayer(node);await tick();expect(document.activeElement).toBe(node.firstElementChild);
 const restored=vi.spyOn(trigger,'focus');cleanup.push(()=>restored.mockRestore());
 handle.setFocusActive(false);if(navigate)requestNavigationFocus(document,{live:()=>true,target:()=>page});
 const action=portalAction(node,doc.body);cleanup.push(action.destroy);await tick();await settle();
 expect(restored).not.toHaveBeenCalled();expect(document.activeElement).toBe(navigate?page:document.body);
 expect(handle.live).toBe(true);expect(doc.activeElement).toBe(doc.body);
 handle.setFocusActive(true);await expect.poll(()=>doc.activeElement).toBe(node.firstElementChild);expect(restored).not.toHaveBeenCalled();
});
it.each(['passive-focus','focus-less'] as const)('W-11b control: adopting an unrelated %s layer keeps the released origin modal trigger restore',async kind=>{
 const{doc}=frame(),trigger=button('Trigger');trigger.focus();const node=region(),released=modalLayer(node),moving=region('<button>Mover</button>');
 const mover=enrollLayer(kind==='focus-less'?{node:moving}:{node:moving,focus:{node:moving,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>mover.release(false));
 await tick();expect(document.activeElement).toBe(node.firstElementChild);
 released.release();const action=portalAction(moving,doc.body);cleanup.push(action.destroy);
 await tick();expect(document.activeElement).toBe(trigger);expect(mover.live).toBe(true);
});
it('W-11b owned temporary boundary tabindex travels with the adopted node and is still removed on release',async()=>{
 const{doc}=frame(),node=region('Empty'),handle=modalLayer(node);await tick();expect(document.activeElement).toBe(node);expect(node.getAttribute('tabindex')).toBe('-1');
 const action=portalAction(node,doc.body);cleanup.push(action.destroy);await expect.poll(()=>doc.activeElement).toBe(node);
 expect(node.getAttribute('tabindex')).toBe('-1');handle.release(false);expect(node.hasAttribute('tabindex')).toBe(false);
});
it('W-11b a pre-adoption handle refreshes identity and focus in its new document after the move',async()=>{
 const{doc}=frame('<button>Frame outside</button>'),outside=doc.body.firstElementChild as HTMLButtonElement;
 const node=region(),first=node.firstElementChild as HTMLButtonElement;let identity=1;
 const handle=enrollLayer({node,identity:()=>identity,focus:{node,modal:true}});cleanup.push(()=>handle.release(false));await tick();
 const action=portalAction(node,doc.body);cleanup.push(action.destroy);await expect.poll(()=>doc.activeElement).toBe(first);
 identity=2;outside.focus();expect(doc.activeElement).toBe(outside);
 handle.refresh();await expect.poll(()=>doc.activeElement).toBe(first);
 expect(document.activeElement).not.toBe(first);expect(handle.live).toBe(true);
});
it('W-11c iframe-mounted Modal takes initial focus and restores its trigger inside the iframe with no main-document focus action',async()=>{
 const{iframe,doc}=frame('<button>Frame trigger</button><div></div>');const frameTrigger=doc.body.firstElementChild as HTMLButtonElement;
 const mainTrigger=button('Main trigger');mainTrigger.focus();const mainFocus=vi.spyOn(mainTrigger,'focus');cleanup.push(()=>mainFocus.mockRestore());
 const seen:EventTarget[]=[];const watch=(event:FocusEvent)=>{if(event.target&&event.target!==iframe)seen.push(event.target);};
 window.addEventListener('focusin',watch,true);cleanup.push(()=>window.removeEventListener('focusin',watch,true));
 frameTrigger.focus();expect(doc.activeElement).toBe(frameTrigger);
 const app=mount(Presentation,{target:doc.body.lastElementChild as HTMLElement,props:{kind:'modal'}});cleanup.push(()=>{void unmount(app);});
 await expect.poll(()=>doc.activeElement?.hasAttribute('data-overlay-first')).toBe(true);
 expect(document.querySelector('[data-overlay]')).toBeNull();expect(doc.querySelector('[data-overlay]')).not.toBeNull();
 app.phase('dismissing');await expect.poll(()=>doc.activeElement).toBe(frameTrigger);
 expect(mainFocus).not.toHaveBeenCalled();expect(seen).toEqual([]);
});

import BindingOwnership from './test-components/DocumentFocusBindingOwnership.svelte';
// PKT-8 (DF-15): the boundary tabindex written by fallback() is framework-owned only until a real candidate takes focus; the closure's -1 guard keeps author writes.
function lateChild(node:HTMLElement){const child=document.createElement('button');child.textContent='Late';node.append(child);return child;}
it.each([true,false])('DF-15 a real child focused inside an empty boundary retires only the framework-owned tabindex and stays focused (modal: %s)',async modal=>{
 const node=region('Empty'),handle=enrollLayer({node,focus:{node,modal}});cleanup.push(()=>handle.release(false));await tick();
 expect(document.activeElement).toBe(node);expect(node.getAttribute('tabindex')).toBe('-1');
 const child=lateChild(node);child.focus();expect(document.activeElement).toBe(child);expect(node.hasAttribute('tabindex')).toBe(false);
 await tick();expect(document.activeElement).toBe(child);
 // The owned closure is cleared, not merely run: a later author-written -1 survives release.
 node.setAttribute('tabindex','-1');handle.release(false);expect(node.getAttribute('tabindex')).toBe('-1');
});
it('DF-15 a coordinator Tab move onto a late child retires the owned boundary tabindex',async()=>{
 const node=region('Empty');modalLayer(node);await tick();expect(document.activeElement).toBe(node);expect(node.getAttribute('tabindex')).toBe('-1');
 const child=lateChild(node),event=tab(node);expect(event.defaultPrevented).toBe(true);
 expect(document.activeElement).toBe(child);expect(node.hasAttribute('tabindex')).toBe(false);
});
it('DF-15 control: an author tabindex=0 written before the child takes focus is preserved',async()=>{
 const node=region('Empty'),handle=modalLayer(node);await tick();expect(node.getAttribute('tabindex')).toBe('-1');
 node.setAttribute('tabindex','0');const child=lateChild(node);child.focus();
 expect(document.activeElement).toBe(child);expect(node.getAttribute('tabindex')).toBe('0');
 handle.release(false);expect(node.getAttribute('tabindex')).toBe('0');
});
// PKT-8 (DF-16): slot ownership is observed through behavior only: which node is the pointer boundary and which node the animation driver touches.
// driven() counts element.animate() calls plus inline-style mutations, so it follows the driver whether it uses WAAPI or style writes.
function ownership(kind:'alert'|'popover',managed=false){
 const app=mount(BindingOwnership,{target:region(''),props:{kind,managed}});cleanup.push(()=>{void unmount(app);});flushSync();
 const part=(slot:'content'|'backdrop',which:'a'|'b')=>document.querySelector<HTMLElement>(`[data-ownership-${slot}="${which}"]`)!;
 return{app,part};
}
function driven(node:HTMLElement){
 let count=0;const animate=node.animate.bind(node);
 node.animate=(...args:Parameters<HTMLElement['animate']>)=>{count++;return animate(...args);};
 const observer=new MutationObserver(records=>{count+=records.length;});observer.observe(node,{attributes:true,attributeFilter:['style']});cleanup.push(()=>observer.disconnect());
 return{count:()=>(count+=observer.takeRecords().length),reset:()=>{observer.takeRecords();count=0;}};
}
it.each(['alert','popover'] as const)('DF-16 mounted %s content binding: stale A destroy leaves B as pointer boundary and animation driver, active B destroy clears B, replacement and destroy are idempotent',async kind=>{
 const{app,part}=ownership(kind),a=part('content','a'),b=part('content','b');
 const first=app.bind('content',a),second=app.bind('content',b);first.destroy();first.destroy();
 pointerDown(b);await settle();expect(app.dismissals()).toBe(0);pointerDown(a);await expect.poll(()=>app.dismissals()).toBe(1);
 const drivenA=driven(a),drivenB=driven(b);app.phase('dismissing');flushSync();
 await expect.poll(()=>drivenB.count()).toBeGreaterThan(0);expect(drivenA.count()).toBe(0);
 app.phase('presented');flushSync();await settle();second.destroy();second.destroy();first.destroy();flushSync();
 pointerDown(a);pointerDown(b);await settle();expect(app.dismissals()).toBe(1);pointerDown(document.body);await expect.poll(()=>app.dismissals()).toBe(2);
 drivenA.reset();drivenB.reset();app.phase('dismissing');flushSync();await settle();expect(drivenA.count()).toBe(0);expect(drivenB.count()).toBe(0);
});
it('DF-16 mounted alert backdrop binding: stale A destroy leaves B as the animated backdrop, active B destroy clears only B back to the internal fallback',async()=>{
 const{app,part}=ownership('alert'),a=part('backdrop','a'),b=part('backdrop','b'),content=part('content','b');
 const internal=document.querySelector<HTMLElement>('.alert-backdrop')!;app.bind('content',content);
 const first=app.bind('backdrop',a),second=app.bind('backdrop',b);first.destroy();first.destroy();
 const drivenA=driven(a),drivenB=driven(b),drivenInternal=driven(internal),drivenContent=driven(content);
 app.phase('dismissing');flushSync();await expect.poll(()=>drivenB.count()).toBeGreaterThan(0);expect(drivenA.count()).toBe(0);expect(drivenInternal.count()).toBe(0);
 app.phase('presented');flushSync();await settle();second.destroy();second.destroy();first.destroy();flushSync();
 for(const probe of [drivenA,drivenB,drivenInternal,drivenContent])probe.reset();app.phase('dismissing');flushSync();
 await expect.poll(()=>drivenInternal.count()).toBeGreaterThan(0);await expect.poll(()=>drivenContent.count()).toBeGreaterThan(0);
 expect(drivenA.count()).toBe(0);expect(drivenB.count()).toBe(0);
});
it.each(['alert','popover'] as const)('DF-16 mounted %s teardown of the active Svelte-managed content action clears the slot instead of driving the removed node',async kind=>{
 const{app,part}=ownership(kind,true),a=part('content','a'),b=part('content','b'),drivenA=driven(a),drivenB=driven(b);
 pointerDown(b);await settle();expect(app.dismissals()).toBe(0);pointerDown(a);await expect.poll(()=>app.dismissals()).toBe(1);
 app.phase('dismissing');flushSync();await expect.poll(()=>drivenB.count()).toBeGreaterThan(0);expect(drivenA.count()).toBe(0);
 app.phase('presented');flushSync();await settle();drivenA.reset();drivenB.reset();
 app.removeSecond('content');flushSync();expect(b.isConnected).toBe(false);
 app.phase('dismissing');flushSync();await settle();expect(drivenB.count()).toBe(0);expect(drivenA.count()).toBe(0);
});
it('DF-16 mounted alert teardown of the active Svelte-managed backdrop action falls back to the internal backdrop and keeps the content slot',async()=>{
 const{app,part}=ownership('alert',true),b=part('backdrop','b'),internal=document.querySelector<HTMLElement>('.alert-backdrop')!;
 const drivenA=driven(part('backdrop','a')),drivenB=driven(b),drivenInternal=driven(internal),drivenContent=driven(part('content','b'));
 app.phase('dismissing');flushSync();await expect.poll(()=>drivenB.count()).toBeGreaterThan(0);expect(drivenA.count()).toBe(0);expect(drivenInternal.count()).toBe(0);
 app.phase('presented');flushSync();await settle();for(const probe of [drivenA,drivenB,drivenInternal,drivenContent])probe.reset();
 app.removeSecond('backdrop');flushSync();expect(b.isConnected).toBe(false);
 app.phase('dismissing');flushSync();await expect.poll(()=>drivenInternal.count()).toBeGreaterThan(0);await expect.poll(()=>drivenContent.count()).toBeGreaterThan(0);
 expect(drivenA.count()).toBe(0);expect(drivenB.count()).toBe(0);
});

// PKT-10 (W-A2): linked passive focus descendants extend only their selected pointer-owning ancestor's containment region.
function linked(){const parent:DismissalIdentity=Object.freeze({parent:undefined}),child:DismissalIdentity=Object.freeze({parent});return{parent,child};}
it('W-A2 linked passive focus descendant is inside its selected modal ancestor pointer region',async()=>{
 const tokens=linked(),parent=region(),child=region('<button>Portaled child</button>'),dismissed=vi.fn();
 const a=enrollLayer({node:parent,ancestry:tokens.parent,onPointerOutside:dismissed,focus:{node:parent,modal:true}});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:child,ancestry:tokens.child,focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));
 pointerDown(child.firstElementChild!);await settle();expect(dismissed).not.toHaveBeenCalled();
 pointerDown(document.body);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});
it('W-A2 control: an unlinked passive focus node does not shield the modal pointer boundary',async()=>{
 const parent=region(),child=region('<button>Unlinked</button>'),dismissed=vi.fn();
 const a=enrollLayer({node:parent,onPointerOutside:dismissed,focus:{node:parent,modal:true}});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:child,focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));
 pointerDown(child.firstElementChild!);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});
it('W-A2 control: a linked active descendant remains top and uses its own pointer boundary',async()=>{
 const tokens=linked(),parent=region(),child=region('<button>Active child</button>'),parentDismissed=vi.fn(),childDismissed=vi.fn();
 const a=enrollLayer({node:parent,ancestry:tokens.parent,onPointerOutside:parentDismissed,focus:{node:parent,modal:true}});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:child,ancestry:tokens.child,onPointerOutside:childDismissed,focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));
 pointerDown(child.firstElementChild!);await settle();expect(childDismissed).not.toHaveBeenCalled();expect(parentDismissed).not.toHaveBeenCalled();
 pointerDown(document.body);await settle();expect(childDismissed).toHaveBeenCalledTimes(1);expect(parentDismissed).not.toHaveBeenCalled();
});
it('W-A2 control: a bare disabled focus-less entry still skips to an eligible parent',async()=>{
 const parent=region(),bare=region(),parentDismissed=vi.fn(),bareDismissed=vi.fn();
 const a=enrollLayer({node:parent,onPointerOutside:parentDismissed});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:bare,onPointerOutside:bareDismissed,pointerEnabled:()=>false});cleanup.push(()=>b.release(false));
 pointerDown(document.body);await settle();expect(parentDismissed).toHaveBeenCalledTimes(1);expect(bareDismissed).not.toHaveBeenCalled();
});
it('W-A2 control: an unrelated higher-priority pointer entry remains above a lower ancestry region',async()=>{
 const tokens=linked(),parent=region(),child=region('<button>Linked child</button>'),unrelated=region(),parentDismissed=vi.fn(),unrelatedDismissed=vi.fn();
 const a=enrollLayer({node:parent,ancestry:tokens.parent,priority:1,onPointerOutside:parentDismissed,focus:{node:parent,modal:true}});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:child,ancestry:tokens.child,focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));
 const c=enrollLayer({node:unrelated,priority:2,onPointerOutside:unrelatedDismissed});cleanup.push(()=>c.release(false));
 pointerDown(child.firstElementChild!);await settle();expect(unrelatedDismissed).toHaveBeenCalledTimes(1);expect(parentDismissed).not.toHaveBeenCalled();
});
it('W-A2 control: a selected owner keeps its explicit pointerBoundary instead of widening to its own focus root',async()=>{
 const parent=region('<div data-boundary></div><button>Outside boundary</button>'),dismissed=vi.fn();
 const handle=enrollLayer({node:parent,pointerBoundary:()=>parent.querySelector<HTMLElement>('[data-boundary]'),onPointerOutside:dismissed,focus:{node:parent,modal:true}});cleanup.push(()=>handle.release(false));
 pointerDown(parent.querySelector('button')!);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});
it('W-A2 identity fault during delivery is reported once for the phase before fall-through',async()=>{
 const tokens=linked(),parent=region(),child=region('<button>Faulting child</button>'),parentDismissed=vi.fn(),childDismissed=vi.fn(),error=new Error('identity failed');let fault=false;
 const reported=vi.spyOn(console,'error').mockImplementation(()=>{});cleanup.push(()=>reported.mockRestore());
 const a=enrollLayer({node:parent,ancestry:tokens.parent,onPointerOutside:parentDismissed,focus:{node:parent,modal:true}});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:child,ancestry:tokens.child,onPointerOutside:childDismissed,identity:()=>{if(fault)throw error;return 1;},focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));
 await tick();pointerDown(document.body);fault=true;await settle();
 expect(childDismissed).not.toHaveBeenCalled();expect(parentDismissed).toHaveBeenCalledTimes(1);
 expect(reported).toHaveBeenCalledTimes(1);expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:',error);
});
it('R10-03 W-A2 identity fault at arming is reported once in that phase before fall-through',async()=>{
 const tokens=linked(),parent=region(),child=region(),parentDismissed=vi.fn(),childDismissed=vi.fn(),error=new Error('child identity'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});let fault=false;
 cleanup.push(()=>reported.mockRestore());
 const a=enrollLayer({node:parent,ancestry:tokens.parent,onPointerOutside:parentDismissed,focus:{node:parent,modal:true}});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:child,ancestry:tokens.child,onPointerOutside:childDismissed,identity:()=>{if(fault)throw error;return 1;},focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>b.release(false));
 await tick();reported.mockClear();fault=true;pointerDown(document.body);
 expect(reported).toHaveBeenCalledTimes(1);expect(reported).toHaveBeenLastCalledWith('[Composable Svelte] Focus coordination failed:',error);
 await settle();expect(parentDismissed).toHaveBeenCalledTimes(1);expect(childDismissed).not.toHaveBeenCalled();expect(reported).toHaveBeenCalledTimes(2);
});
it('R10-04 W-A2 multi-fault gesture reports each linked identity once per phase',async()=>{
 const tokens=linked(),healthy=region(),child=region(),owner=region(),healthyDismissed=vi.fn(),x=new Error('linked identity'),a=new Error('owner identity'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});let fault=false;
 cleanup.push(()=>reported.mockRestore());
 const first=enrollLayer({node:healthy,priority:1,onPointerOutside:healthyDismissed});cleanup.push(()=>first.release(false));
 const second=enrollLayer({node:child,priority:1,ancestry:tokens.child,onPointerOutside:vi.fn(),identity:()=>{if(fault)throw x;return 'x';},focus:{node:child,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>second.release(false));
 const third=enrollLayer({node:owner,priority:2,ancestry:tokens.parent,onPointerOutside:vi.fn(),identity:()=>{if(fault)throw a;return 'a';},focus:{node:owner,modal:true}});cleanup.push(()=>third.release(false));
 await tick();reported.mockClear();fault=true;pointerDown(document.body);
 expect(reported.mock.calls.map(call=>call[1])).toEqual([x,a]);
 await settle();expect(healthyDismissed).toHaveBeenCalledTimes(1);expect(reported.mock.calls.map(call=>call[1])).toEqual([x,a,a,x]);
});
it('R10-04 W-A2 delivery retry memo skips a descendant identity already faulted by containment',async()=>{
 const aToken:DismissalIdentity=Object.freeze({parent:undefined}),xToken:DismissalIdentity=Object.freeze({parent:aToken}),yToken:DismissalIdentity=Object.freeze({parent:xToken});
 const healthy=region(),aNode=region(),xNode=region(),yNode=region(),healthyDismissed=vi.fn(),aError=new Error('a'),xError=new Error('x'),yError=new Error('y'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});let fault=false;
 cleanup.push(()=>reported.mockRestore());
 const healthyHandle=enrollLayer({node:healthy,priority:1,onPointerOutside:healthyDismissed});cleanup.push(()=>healthyHandle.release(false));
 const y=enrollLayer({node:yNode,priority:1,ancestry:yToken,onPointerOutside:vi.fn(),identity:()=>{if(fault)throw yError;return 'y';},focus:{node:yNode,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>y.release(false));
 const x=enrollLayer({node:xNode,priority:2,ancestry:xToken,onPointerOutside:vi.fn(),identity:()=>{if(fault)throw xError;return 'x';},focus:{node:xNode,modal:false,contain:false,autoFocus:false}});cleanup.push(()=>x.release(false));
 const a=enrollLayer({node:aNode,priority:3,ancestry:aToken,onPointerOutside:vi.fn(),identity:()=>{if(fault)throw aError;return 'a';},focus:{node:aNode,modal:true}});cleanup.push(()=>a.release(false));
 await tick();reported.mockClear();pointerDown(document.body);fault=true;await settle();
 expect(healthyDismissed).toHaveBeenCalledTimes(1);expect(reported.mock.calls.map(call=>call[1])).toEqual([aError,yError,xError]);
});
it('R10-05 W-A2 outside containment does not poll an unrelated focus-less identity getter',async()=>{
 const owner=region(),unrelated=region(),identity=vi.fn(()=>1);
 const a=enrollLayer({node:unrelated,identity});cleanup.push(()=>a.release(false));
 const b=enrollLayer({node:owner,onPointerOutside:vi.fn(),focus:{node:owner,modal:true}});cleanup.push(()=>b.release(false));
 await tick();identity.mockClear();pointerDown(document.body);expect(identity).not.toHaveBeenCalled();await settle();
});

import AlertPrimitive from '../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
import DrawerPrimitive from '../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
import SheetPrimitive from '../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
// PKT-7A (DF-21/DF-22 subset): NavigationFocus.fallback, mounted Alert/Drawer focus and grandparent-snippet ancestry; each witness is paired with its control.
const primaryTargets={
 absent:()=>null,
 detached:()=>{const node=button('Detached');node.remove();return node;},
 undeclared:()=>region('<h1>Undeclared heading</h1>').firstElementChild as HTMLElement,
 disabled:()=>{const node=button('Disabled');node.disabled=true;return node;}
};
it.each(['absent','detached','undeclared','disabled'] as const)('DF-22 accepted navigation whose live primary target is %s focuses NavigationFocus.fallback',async shape=>{
 const before=button('Before'),alternative=button('Fallback'),primary=primaryTargets[shape](),fallback=vi.fn(()=>alternative);before.focus();
 requestNavigationFocus(document,{live:()=>true,target:()=>primary,fallback});await tick();
 expect(document.activeElement).toBe(alternative);expect(fallback).toHaveBeenCalledTimes(1);
 // The undeclared row kills a removed focusTarget eligibility guard: the primary would borrow tabindex and take focus itself.
 expect(primary?.hasAttribute('tabindex')??false).toBe(false);
});
it('DF-22 control: a live eligible primary target is focused and NavigationFocus.fallback is never consulted',async()=>{
 const primary=button('Primary'),alternative=button('Fallback'),fallback=vi.fn(()=>alternative);
 requestNavigationFocus(document,{live:()=>true,target:()=>primary,fallback});await tick();
 expect(document.activeElement).toBe(primary);expect(fallback).not.toHaveBeenCalled();
});
it.each([false,true])('DF-22 an absent primary target without a usable fallback lands on document.body and leaks no tabindex (fallback declared but null: %s)',async declared=>{
 button('Before').focus();
 requestNavigationFocus(document,{live:()=>true,target:()=>null,...(declared?{fallback:()=>null}:{})});await tick();
 expect(document.activeElement).toBe(document.body);expect(document.body.hasAttribute('tabindex')).toBe(false);
});
it.each(['target','fallback'] as const)('DF-22 a newer accepted navigation queued during stale %s resolution wins and the retired route focuses nothing',async phase=>{
 const stale=button('Stale route'),alternative=button('Stale fallback'),newer=button('Newer route');let route=1,resolved=0;
 const staleFocus=vi.spyOn(stale,'focus'),alternativeFocus=vi.spyOn(alternative,'focus');cleanup.push(()=>staleFocus.mockRestore(),()=>alternativeFocus.mockRestore());
 const supersede=()=>{resolved++;route=2;requestNavigationFocus(document,{live:()=>route===2,target:()=>newer});};
 requestNavigationFocus(document,{live:()=>route===1,target:()=>{if(phase==='fallback')return null;supersede();return stale;},fallback:()=>{supersede();return alternative;}});
 await expect.poll(()=>document.activeElement).toBe(newer);await settle();
 expect(document.activeElement).toBe(newer);expect(resolved).toBe(1);expect(staleFocus).not.toHaveBeenCalled();expect(alternativeFocus).not.toHaveBeenCalled();
});
const retirableNames=['alert','drawer','sheet'] as const;
// Same consumer shape as standalone(); retire() is idempotent because Svelte dev warns on a second unmount of the same instance.
function retirable(kind:typeof retirableNames[number],returnFocusTo:HTMLElement){
 const {root,store}=dummyPresentation(),target=region('');let retired=false;
 const app=kind==='alert'
  ?mount(AlertPrimitive,{target,props:{store,returnFocusTo,children:standaloneContent}})
  :kind==='drawer'
   ?mount(DrawerPrimitive,{target,props:{store,returnFocusTo,children:standaloneContent}})
   :mount(SheetPrimitive,{target,props:{store,returnFocusTo,children:standaloneContent}});
 const retire=()=>{if(!retired){retired=true;void unmount(app);root.destroy();}};cleanup.push(retire);return retire;
}
it.each(retirableNames)('DF-22 mounted %s takes initial focus at its bound content candidate, contains outside focus and restores its declared return target on retirement (sheet is the control)',async kind=>{
 const launcher=button('Launcher'),declared=button('Declared return'),outside=button('Outside');launcher.focus();
 const retire=retirable(kind,declared);await expect.poll(standaloneFocused).toBe(true);
 outside.focus();expect(document.activeElement).toBe(standaloneControl('first'));
 retire();await expect.poll(()=>document.activeElement).toBe(declared);expect(document.querySelector('[data-standalone]')).toBeNull();
 outside.focus();expect(document.activeElement).toBe(outside);
});
it.each(retirableNames)('DF-22 mounted %s retirement routes focus to an accepted navigation target instead of its declared return target (sheet is the control)',async kind=>{
 const declared=button('Declared return'),page=button('Page'),retire=retirable(kind,declared);await expect.poll(standaloneFocused).toBe(true);
 const restored=vi.spyOn(declared,'focus');cleanup.push(()=>restored.mockRestore());
 retire();requestNavigationFocus(document,{live:()=>true,target:()=>page});
 await expect.poll(()=>document.activeElement).toBe(page);await settle();
 expect(document.activeElement).toBe(page);expect(restored).not.toHaveBeenCalled();
});
it.each([false,true])('DF-22 DOM containment alone never ranks a child-first modal above its later-enrolled container; only an explicit ancestry link does (linked: %s, false is the control)',async link=>{
 const tokens=linked(),outer=region('<button>Outer first</button><section><button>Inner first</button></section>'),inner=outer.querySelector('section')!;
 const child=enrollLayer({node:inner,ancestry:link?tokens.child:undefined,focus:{node:inner,modal:true}});cleanup.push(()=>child.release(false));
 const parent=enrollLayer({node:outer,ancestry:link?tokens.parent:undefined,focus:{node:outer,modal:true}});cleanup.push(()=>parent.release(false));await tick();
 expect(outer.contains(inner)).toBe(true);expect(document.activeElement).toBe((link?inner:outer).firstElementChild);
});
it('DF-22 a Sheet declared in a grandparent-owned snippet and rendered beneath the host Modal is its logical child without DOM containment',async()=>{
 const outside=button('Outside'),instance=mount(Nested,{target:region(''),props:{innerKind:'grandparent-snippet'}});cleanup.push(()=>{void unmount(instance);});
 await expect.poll(()=>(document.activeElement as HTMLElement).hasAttribute('data-inner-first')).toBe(true);
 const outer=document.querySelector<HTMLElement>('[data-outer]')!,inner=document.querySelector<HTMLElement>('[data-inner]')!,outerFirst=document.querySelector<HTMLButtonElement>('[data-outer-first]')!;
 // Both owners are portaled to body as siblings and the inner action enrolls first, so only the render-tree ancestry token can rank it above its host.
 expect(outer.contains(inner)).toBe(false);expect(inner.contains(outer)).toBe(false);
 outside.focus();expect(inner.contains(document.activeElement)).toBe(true);
 outerFirst.focus();expect(inner.contains(document.activeElement)).toBe(true);
 (inner.lastElementChild as HTMLButtonElement).click();await tick();
 expect(document.querySelector('[data-inner]')).toBeNull();await expect.poll(()=>document.activeElement).toBe(outerFirst);
 outside.focus();expect(document.activeElement).toBe(outerFirst);expect(outer.contains(document.activeElement)).toBe(true);
});
