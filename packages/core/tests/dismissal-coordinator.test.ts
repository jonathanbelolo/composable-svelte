import {afterEach,expect,it,vi} from 'vitest';
import {enrollLayer,registerDismissalLayer,rehomeAdoptedLayers} from '../src/lib/actions/dismissalCoordinator';
import {clickOutside} from '../src/lib/actions/clickOutside';
const releases:Array<()=>void>=[];
afterEach(()=>{releases.splice(0).reverse().forEach(release=>release());vi.useRealTimers();});
function layer(doc=document, extra:Partial<Parameters<typeof registerDismissalLayer>[0]>={}) {
 const node=doc.createElement('div');doc.body.append(node);
 const onEscape=vi.fn(),onPointerOutside=vi.fn();
 const release=registerDismissalLayer({node,onEscape,onPointerOutside,...extra});
 releases.push(()=>{release();node.remove();});return {node,onEscape,onPointerOutside,release};
}
function key(target:EventTarget=document, init:KeyboardEventInit={}){const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;}
function pointer(target:EventTarget=document.body){target.dispatchEvent(new MouseEvent('pointerdown',{button:0,bubbles:true,composed:true,cancelable:true}));}
it('one topmost Escape request, veto shields parent, and consumption precedes removal',()=>{
 const parent=layer();const child=layer(document,{onEscape:()=>{child.release();}});
 const e=key();expect(e.defaultPrevented).toBe(true);expect(parent.onEscape).not.toHaveBeenCalled();
 key();expect(parent.onEscape).toHaveBeenCalledTimes(1);
});
it('respects repeat, composition and pre-prevented Escape without a masking global veto',()=>{
 const item=layer();key(document,{repeat:true});key(document,{isComposing:true});
 const event=new KeyboardEvent('keydown',{key:'Escape',cancelable:true});event.preventDefault();document.dispatchEvent(event);
 expect(item.onEscape).not.toHaveBeenCalled();key();expect(item.onEscape).toHaveBeenCalledTimes(1);
});
it('an earlier document-capture preventDefault listener remains an absolute Escape veto',()=>{
 const veto=(event:Event)=>event.preventDefault();document.addEventListener('keydown',veto,true);releases.push(()=>document.removeEventListener('keydown',veto,true));
 const item=layer();key(item.node);expect(item.onEscape).not.toHaveBeenCalled();document.removeEventListener('keydown',veto,true);
 key();expect(item.onEscape).toHaveBeenCalledTimes(1);
});
it('registers and removes the document keydown listener with the exact capture flag',()=>{
 const doc=foreign(),add=vi.spyOn(doc,'addEventListener'),remove=vi.spyOn(doc,'removeEventListener'),item=layer(doc);
 expect(add.mock.calls.filter(([type])=>type==='keydown')).toEqual([['keydown',expect.any(Function),true]]);
 item.release();expect(remove.mock.calls.filter(([type])=>type==='keydown')).toEqual([['keydown',expect.any(Function),true]]);
});
it('capture-phase Escape cannot be bypassed by descendant bubble stopPropagation',()=>{
 const item=layer(),observed=vi.fn();item.node.addEventListener('keydown',event=>{observed();event.stopPropagation();});
 const event=key(item.node);expect(event.defaultPrevented).toBe(true);expect(item.onEscape).toHaveBeenCalledTimes(1);expect(observed).toHaveBeenCalledTimes(1);
});
it('descendant bubble preventDefault cannot retroactively veto capture authority but still observes Escape',()=>{
 const item=layer(),observed=vi.fn();item.node.addEventListener('keydown',event=>{observed();event.preventDefault();});
 const event=key(item.node);expect(event.defaultPrevented).toBe(true);expect(item.onEscape).toHaveBeenCalledTimes(1);expect(observed).toHaveBeenCalledTimes(1);
});
it('a throwing dismissal predicate is reported once, skipped for this event, and healthy on the next event',()=>{
 const error=new Error('escape predicate failed'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});releases.push(()=>reported.mockRestore());
 const parent=layer();let fault=true;const child=layer(document,{escapeEnabled:()=>{if(fault)throw error;return true;}});
 key();expect(parent.onEscape).toHaveBeenCalledTimes(1);expect(child.onEscape).not.toHaveBeenCalled();
 expect(reported).toHaveBeenCalledTimes(1);expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:',error);
 fault=false;key();expect(child.onEscape).toHaveBeenCalledTimes(1);expect(parent.onEscape).toHaveBeenCalledTimes(1);
});
it('a throwing pointer predicate is reported once per event/timer phase, skipped, and healthy on the next gesture',()=>{
 vi.useFakeTimers();const error=new Error('pointer predicate failed'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});releases.push(()=>reported.mockRestore());
 const parent=layer();let fault=true;const child=layer(document,{pointerEnabled:()=>{if(fault)throw error;return true;}});
 pointer();expect(reported).toHaveBeenCalledTimes(1);vi.runAllTimers();expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);expect(child.onPointerOutside).not.toHaveBeenCalled();
 expect(reported).toHaveBeenCalledTimes(2);expect(reported.mock.calls).toEqual(Array(2).fill(['[Composable Svelte] Focus coordination failed:',error]));
 fault=false;pointer();vi.runAllTimers();expect(child.onPointerOutside).toHaveBeenCalledTimes(1);expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);
});
it('pointer identity faults at arming fall through to a lower sibling while respecting its boundary',()=>{
 vi.useFakeTimers();const failure=new Error('arming identity failed'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});releases.push(()=>reported.mockRestore());
 const lower=layer();let fault=false;const upper=layer(document,{identity:()=>{if(fault)throw failure;return 1;}});fault=true;
 pointer(lower.node);vi.runAllTimers();expect(lower.onPointerOutside).not.toHaveBeenCalled();expect(upper.onPointerOutside).not.toHaveBeenCalled();expect(reported).toHaveBeenCalledTimes(1);
 reported.mockClear();pointer();expect(reported).toHaveBeenCalledTimes(1);vi.runAllTimers();expect(lower.onPointerOutside).toHaveBeenCalledTimes(1);expect(upper.onPointerOutside).not.toHaveBeenCalled();expect(reported).toHaveBeenCalledTimes(2);
 fault=false;pointer();vi.runAllTimers();expect(upper.onPointerOutside).toHaveBeenCalledTimes(1);expect(lower.onPointerOutside).toHaveBeenCalledTimes(1);
});
it('pointer identity faults at deferred delivery retry a lower sibling, but identity churn and newer enrollment still drop the gesture',()=>{
 vi.useFakeTimers();const failure=new Error('delivery identity failed'),reported=vi.spyOn(console,'error').mockImplementation(()=>{});releases.push(()=>reported.mockRestore());
 const lower=layer();let fault=false,identity={};const upper=layer(document,{identity:()=>{if(fault)throw failure;return identity;}});
 pointer();fault=true;vi.runAllTimers();expect(lower.onPointerOutside).toHaveBeenCalledTimes(1);expect(upper.onPointerOutside).not.toHaveBeenCalled();expect(reported).toHaveBeenCalledTimes(1);
 reported.mockClear();fault=false;pointer();identity={};vi.runAllTimers();expect(lower.onPointerOutside).toHaveBeenCalledTimes(1);expect(upper.onPointerOutside).not.toHaveBeenCalled();expect(reported).not.toHaveBeenCalled();
 pointer();const newer=layer();newer.release();vi.runAllTimers();expect(lower.onPointerOutside).toHaveBeenCalledTimes(1);expect(upper.onPointerOutside).not.toHaveBeenCalled();
});
it('throwing dismissal callbacks are reported and consume only their event while future events and teardown remain healthy',()=>{
 vi.useFakeTimers();const escapeFailure=new Error('escape callback failed'),pointerFailure=new Error('pointer callback failed');
 const reported=vi.spyOn(console,'error').mockImplementation(()=>{});releases.push(()=>reported.mockRestore());const parent=layer();let fault=true;
 const child=layer(document,{onEscape:()=>{if(fault)throw escapeFailure;},onPointerOutside:()=>{if(fault)throw pointerFailure;}});
 key();expect(parent.onEscape).not.toHaveBeenCalled();expect(reported).toHaveBeenLastCalledWith('[Composable Svelte] Focus coordination failed:',escapeFailure);
 pointer();expect(vi.getTimerCount()).toBe(1);vi.runAllTimers();expect(vi.getTimerCount()).toBe(0);expect(parent.onPointerOutside).not.toHaveBeenCalled();expect(reported).toHaveBeenLastCalledWith('[Composable Svelte] Focus coordination failed:',pointerFailure);
 expect(reported).toHaveBeenCalledTimes(2);fault=false;key();pointer();vi.runAllTimers();expect(parent.onEscape).not.toHaveBeenCalled();expect(parent.onPointerOutside).not.toHaveBeenCalled();
 child.release();key();pointer();vi.runAllTimers();expect(parent.onEscape).toHaveBeenCalledTimes(1);expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);
});
it('one shared listener set per document, idempotent final cleanup',()=>{
 const doc=document.implementation.createHTMLDocument();const add=vi.spyOn(doc,'addEventListener'),remove=vi.spyOn(doc,'removeEventListener');
 const a=layer(doc),b=layer(doc);expect(add.mock.calls.map(x=>x[0])).toEqual(['pointerdown','keydown','focusin']);
 a.release();expect(remove).not.toHaveBeenCalled();b.release();b.release();expect(remove.mock.calls.map(x=>x[0])).toEqual(['pointerdown','keydown','focusin']);
});
it('documents cannot shadow each other',()=>{
 const first=layer();const second=layer(document.implementation.createHTMLDocument());key();expect(first.onEscape).toHaveBeenCalledTimes(1);expect(second.onEscape).not.toHaveBeenCalled();key(second.node.ownerDocument);expect(second.onEscape).toHaveBeenCalledTimes(1);
});
it('disabled clickOutside participation skips top while callback veto never falls through',()=>{
 vi.useFakeTimers();const parent=layer();const child=layer(document,{pointerEnabled:()=>false});pointer();vi.runAllTimers();expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);expect(child.onPointerOutside).not.toHaveBeenCalled();
});
it('deferred gesture cannot cross removal, replacement, or temporary newer enrollment',()=>{
 vi.useFakeTimers();let owner={};const a=layer(document,{identity:()=>owner});pointer();owner={};vi.runAllTimers();expect(a.onPointerOutside).not.toHaveBeenCalled();
 pointer();const b=layer();b.release();vi.runAllTimers();expect(a.onPointerOutside).not.toHaveBeenCalled();
 pointer();a.release();vi.runAllTimers();expect(a.onPointerOutside).not.toHaveBeenCalled();
});
it('deferred gesture respects defaultPrevented after capture and a fresh gesture works',()=>{
 vi.useFakeTimers();const a=layer();const button=document.createElement('button');document.body.append(button);releases.push(()=>button.remove());button.addEventListener('pointerdown',e=>e.preventDefault(),{once:true});pointer(button);vi.runAllTimers();expect(a.onPointerOutside).not.toHaveBeenCalled();pointer(button);vi.runAllTimers();expect(a.onPointerOutside).toHaveBeenCalledTimes(1);
});
it('composed path recognizes containment across an open shadow root',()=>{
 vi.useFakeTimers();const host=document.createElement('div');document.body.append(host);releases.push(()=>host.remove());const shadow=host.attachShadow({mode:'open'});const node=document.createElement('div');const button=document.createElement('button');node.append(button);shadow.append(node);const handler=vi.fn();const action=clickOutside(node,handler);releases.push(action.destroy);pointer(button);vi.runAllTimers();expect(handler).not.toHaveBeenCalled();pointer();vi.runAllTimers();expect(handler).toHaveBeenCalledTimes(1);
});
it('inline navigation stays below an overlay even when enrolled later',()=>{
 const overlay=layer();const navigation=layer(document,{priority:0});key();expect(overlay.onEscape).toHaveBeenCalledTimes(1);expect(navigation.onEscape).not.toHaveBeenCalled();overlay.release();key();expect(navigation.onEscape).toHaveBeenCalledTimes(1);
});
it('consumed Escape does not reach legacy window fallback',()=>{
 const item=layer(document,{onEscape:()=>{}});const fallback=vi.fn();window.addEventListener('keydown',fallback);releases.push(()=>window.removeEventListener('keydown',fallback));key();expect(fallback).not.toHaveBeenCalled();item.release();key();expect(fallback).toHaveBeenCalledTimes(1);
});
it('target observes consumed Escape while window stays shielded after synchronous final-layer release',()=>{
 const fallback=vi.fn(),observed=vi.fn();window.addEventListener('keydown',fallback);releases.push(()=>window.removeEventListener('keydown',fallback));
 let handle:ReturnType<typeof enrollLayer>;const node=document.createElement('button');document.body.append(node);releases.push(()=>node.remove());node.addEventListener('keydown',observed);
 handle=enrollLayer({node,onEscape:()=>handle.release(false)});releases.push(()=>handle.release(false));const event=key(node);
 expect(event.defaultPrevented).toBe(true);expect(handle.live).toBe(false);expect(observed).toHaveBeenCalledTimes(1);expect(fallback).not.toHaveBeenCalled();
});
it('a descendant-stopped consumed Escape aborts its temporary bubble shield by the next task',()=>{
 vi.useFakeTimers();const add=vi.spyOn(document,'addEventListener');releases.push(()=>add.mockRestore());const item=layer();item.node.addEventListener('keydown',event=>event.stopPropagation());
 key(item.node);const options=add.mock.calls.find(([type,,options])=>type==='keydown'&&typeof options==='object')?.[2] as AddEventListenerOptions|undefined;
 expect(options?.signal?.aborted).toBe(false);vi.runAllTimers();expect(options?.signal?.aborted).toBe(true);
});
it('removing a non-final layer cancels its owned pending timer',()=>{
 vi.useFakeTimers();layer();const top=layer();pointer();expect(vi.getTimerCount()).toBe(1);top.release();expect(vi.getTimerCount()).toBe(0);
});
it('explicit portal Element targets remain usable across documents',async()=>{
 const {portal}=await import('../src/lib/actions/portal');const other=document.implementation.createHTMLDocument();const node=document.createElement('div');const action=portal(node,other.body);expect(node.ownerDocument).toBe(other);expect(other.body.contains(node)).toBe(true);action.destroy();expect(other.body.contains(node)).toBe(false);
});
it('a rejected request stays topmost and does not fall through on later events',()=>{
 const parent=layer();const top=layer();key();key();expect(top.onEscape).toHaveBeenCalledTimes(2);expect(parent.onEscape).not.toHaveBeenCalled();
});
it('ancestry wins child-before-parent setup without displacing a newer unrelated layer',()=>{
 const parentToken=Object.freeze({parent:undefined});const childToken=Object.freeze({parent:parentToken});
 const child=layer(document,{ancestry:childToken});const unrelated=layer();const parent=layer(document,{ancestry:parentToken});
 key();expect(unrelated.onEscape).toHaveBeenCalledTimes(1);expect(parent.onEscape).not.toHaveBeenCalled();unrelated.release();key();expect(child.onEscape).toHaveBeenCalledTimes(1);expect(parent.onEscape).not.toHaveBeenCalled();
});
it('W-03b focus-bearing child with a stale identity and no refresh keeps Escape and pointer off its parent',()=>{
 vi.useFakeTimers();let identity=1;const focusNode=document.createElement('div');document.body.append(focusNode);releases.push(()=>focusNode.remove());
 const parent=layer();const child=layer(document,{identity:()=>identity,focus:{node:focusNode,modal:true}});
 key();expect(child.onEscape).toHaveBeenCalledTimes(1);expect(parent.onEscape).not.toHaveBeenCalled();
 identity=2;key();expect(child.onEscape).toHaveBeenCalledTimes(2);expect(parent.onEscape).not.toHaveBeenCalled();
 pointer();vi.runAllTimers();expect(child.onPointerOutside).toHaveBeenCalledTimes(1);expect(parent.onPointerOutside).not.toHaveBeenCalled();
});
function adopt(node:HTMLElement,from:Document,to:Document){to.body.append(node);rehomeAdoptedLayers(from);}
const foreign=()=>document.implementation.createHTMLDocument();
const watch=(doc:Document)=>{const add=vi.spyOn(doc,'addEventListener'),remove=vi.spyOn(doc,'removeEventListener');return{added:()=>add.mock.calls.map(call=>call[0]),removed:()=>remove.mock.calls.map(call=>call[0])};};
const listenerSet=['pointerdown','keydown','focusin'];
it('W-11b rehome moves the entry, its pre-adoption handle and the exact listener set to the destination document',()=>{
 const from=foreign(),to=foreign(),origin=watch(from),destination=watch(to);
 const node=from.createElement('div');from.body.append(node);const onEscape=vi.fn();const handle=enrollLayer({node,onEscape});releases.push(()=>{handle.release();node.remove();});
 expect(origin.added()).toEqual(listenerSet);to.body.append(node);expect(handle.live).toBe(false);
 rehomeAdoptedLayers(from);rehomeAdoptedLayers(from);rehomeAdoptedLayers(to);
 expect(handle.live).toBe(true);expect(origin.removed()).toEqual(listenerSet);expect(origin.added()).toEqual(listenerSet);
 expect(destination.added()).toEqual(listenerSet);expect(destination.removed()).toEqual([]);
 key(from);expect(onEscape).not.toHaveBeenCalled();key(to);expect(onEscape).toHaveBeenCalledTimes(1);
 handle.release();handle.release();expect(handle.live).toBe(false);expect(destination.removed()).toEqual(listenerSet);key(to);expect(onEscape).toHaveBeenCalledTimes(1);
});
it('W-11b rehome never creates a coordinator for an unused origin document',()=>{
 const unused=foreign(),origin=watch(unused);expect(()=>rehomeAdoptedLayers(unused)).not.toThrow();expect(origin.added()).toEqual([]);
});
it('W-11b rehome cancels only the adopted entry pending pointer timer and no gesture completes across documents',()=>{
 vi.useFakeTimers();const from=foreign(),to=foreign(),stay=layer(from);pointer(from.body);expect(vi.getTimerCount()).toBe(1);
 const mover=layer(from);pointer(from.body);expect(vi.getTimerCount()).toBe(2);
 adopt(mover.node,from,to);expect(vi.getTimerCount()).toBe(1);vi.runAllTimers();
 expect(mover.onPointerOutside).not.toHaveBeenCalled();expect(stay.onPointerOutside).not.toHaveBeenCalled();
 pointer(from.body);vi.runAllTimers();expect(stay.onPointerOutside).toHaveBeenCalledTimes(1);expect(mover.onPointerOutside).not.toHaveBeenCalled();
 pointer(to.body);vi.runAllTimers();expect(mover.onPointerOutside).toHaveBeenCalledTimes(1);expect(stay.onPointerOutside).toHaveBeenCalledTimes(1);
});
it('W-11b ancestry tokens survive adoption while shadowing stays per-document',()=>{
 const from=foreign(),to=foreign(),parentToken=Object.freeze({parent:undefined}),childToken=Object.freeze({parent:parentToken});
 const child=layer(from,{ancestry:childToken}),parent=layer(from,{ancestry:parentToken});
 key(from);expect(child.onEscape).toHaveBeenCalledTimes(1);expect(parent.onEscape).not.toHaveBeenCalled();
 adopt(child.node,from,to);key(from);expect(parent.onEscape).toHaveBeenCalledTimes(1);key(to);expect(child.onEscape).toHaveBeenCalledTimes(2);
 adopt(parent.node,from,to);key(to);expect(child.onEscape).toHaveBeenCalledTimes(3);expect(parent.onEscape).toHaveBeenCalledTimes(1);
});
it('W-11b disabled bare participation still skips after migration and is polled at event time',()=>{
 vi.useFakeTimers();const from=foreign(),to=foreign(),parent=layer(to);let enabled=false;
 const bare=layer(from,{onEscape:undefined,pointerEnabled:()=>enabled});adopt(bare.node,from,to);
 pointer(to.body);vi.runAllTimers();expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);expect(bare.onPointerOutside).not.toHaveBeenCalled();
 enabled=true;pointer(to.body);vi.runAllTimers();expect(bare.onPointerOutside).toHaveBeenCalledTimes(1);expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);
 pointer(from.body);vi.runAllTimers();expect(bare.onPointerOutside).toHaveBeenCalledTimes(1);
});
it('W-11b two-argument clickOutside action follows its adopted node',()=>{
 vi.useFakeTimers();const from=foreign(),to=foreign(),node=from.createElement('div');from.body.append(node);
 const handler=vi.fn();const action=clickOutside(node,handler);releases.push(()=>{action.destroy();node.remove();});
 adopt(node,from,to);pointer(from.body);vi.runAllTimers();expect(handler).not.toHaveBeenCalled();pointer(to.body);vi.runAllTimers();expect(handler).toHaveBeenCalledTimes(1);
});
it('W-11b portal.update keeps one pre-adoption handle live through A to B to C and back to A',async()=>{
 const {portal}=await import('../src/lib/actions/portal');const a=foreign(),b=foreign(),c=foreign();
 const node=a.createElement('div');a.body.append(node);const onEscape=vi.fn();const handle=enrollLayer({node,onEscape});
 const action=portal(node,b.body);releases.push(()=>{action.destroy();handle.release();node.remove();});
 expect(handle.live).toBe(true);key(a);expect(onEscape).not.toHaveBeenCalled();key(b);expect(onEscape).toHaveBeenCalledTimes(1);
 action.update(c.body);expect(handle.live).toBe(true);key(b);expect(onEscape).toHaveBeenCalledTimes(1);key(c);expect(onEscape).toHaveBeenCalledTimes(2);
 action.update(a.body);expect(handle.live).toBe(true);key(c);expect(onEscape).toHaveBeenCalledTimes(2);key(a);expect(onEscape).toHaveBeenCalledTimes(3);
});
it('W-11b batch adoption into an already-live destination reuses its one listener set',()=>{
 const from=foreign(),to=foreign(),destination=watch(to),resident=layer(to);
 expect(destination.added()).toEqual(listenerSet);const first=layer(from),second=layer(from);
 to.body.append(first.node,second.node);rehomeAdoptedLayers(from);
 expect(first.node.ownerDocument).toBe(to);expect(second.node.ownerDocument).toBe(to);
 expect(destination.added()).toEqual(listenerSet);expect(destination.removed()).toEqual([]);
 key(to);expect(second.onEscape).toHaveBeenCalledTimes(1);expect(first.onEscape).not.toHaveBeenCalled();
 second.release();key(to);expect(first.onEscape).toHaveBeenCalledTimes(1);expect(resident.onEscape).not.toHaveBeenCalled();
 first.release();resident.release();expect(destination.removed()).toEqual(listenerSet);
});
it('DF-14 modal contain:false enrollment throws before any listener or partial entry; a passive non-modal contain:false layer stays accepted, live and listener-backed',()=>{
 const doc=foreign(),seen=watch(doc),node=doc.createElement('div'),rejected=vi.fn(),onEscape=vi.fn(),returnFocus=vi.fn(),identity=vi.fn();doc.body.append(node);releases.push(()=>node.remove());
 expect(()=>enrollLayer({node,onEscape:rejected,identity,focus:{node,modal:true,contain:false,returnFocus}})).toThrow(/contain: false/);
 expect(returnFocus).not.toHaveBeenCalled();expect(identity).not.toHaveBeenCalled();
 expect(seen.added()).toEqual([]);key(doc);expect(rejected).not.toHaveBeenCalled();
 const passive=enrollLayer({node,onEscape,focus:{node,modal:false,contain:false,autoFocus:false}});releases.push(()=>passive.release(false));
 expect(passive.live).toBe(true);expect(seen.added()).toEqual(listenerSet);key(doc);expect(onEscape).toHaveBeenCalledTimes(1);expect(rejected).not.toHaveBeenCalled();
 // A partial entry left by the rejected enrollment would keep the shared listener set alive past the last real release.
 passive.release(false);expect(passive.live).toBe(false);expect(seen.removed()).toEqual(listenerSet);
});
