import {afterEach,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import Fixture from './fixtures/DismissalLayers.svelte';
const releases:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const release of releases.splice(0).reverse())await release();});
function key(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));flushSync();}
function setup(kind:'modal'|'sheet'|'drawer'|'alert'|'popover',reverse=false,nested=false,initialStoreGated=false,onDismissalComplete?:()=>void){
 const target=document.createElement('div');document.body.append(target);const requests=vi.fn();let unmounted=false;
 const app=mount(Fixture,{target,props:{kind,requests,reverse,nested,initialStoreGated,...(onDismissalComplete?{onDismissalComplete}:{})}});flushSync();
 const teardown=async()=>{if(unmounted)return;unmounted=true;await unmount(app);target.remove();};
 releases.push(teardown);return{app,requests,teardown};
}
it.each(['modal','sheet','drawer','alert','popover'] as const)('%s requests only top layer and disabled Escape shields parent',kind=>{
 const {app,requests}=setup(kind);app.open();flushSync();key();expect(requests.mock.calls).toEqual([['child']]);requests.mockClear();app.veto(true);flushSync();key();expect(requests).not.toHaveBeenCalled();app.hide();flushSync();key();expect(requests.mock.calls).toEqual([['parent']]);
});
it('later inline sidebar and navigation cannot steal overlay Escape',()=>{
 const{app,requests}=setup('modal');app.showNavigation();flushSync();key();expect(requests.mock.calls).toEqual([['parent']]);
});
it('outside pointer requests top once and pending gesture dies on replacement',async()=>{
 const{app,requests}=setup('popover');app.open();flushSync();document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));app.hide();flushSync();app.open();flushSync();await new Promise(resolve=>setTimeout(resolve,5));expect(requests).not.toHaveBeenCalled();document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));await vi.waitFor(()=>expect(requests.mock.calls).toEqual([['child']]));
});
it('iframe-mounted primitives use their rendered document for portal and dismissal',async()=>{
 const frame=document.createElement('iframe');document.body.append(frame);const doc=frame.contentDocument!;
 const target=doc.createElement('div');doc.body.append(target);const requests=vi.fn();const app=mount(Fixture,{target,props:{kind:'alert',requests}});flushSync();releases.push(async()=>{await unmount(app);frame.remove();});app.open();flushSync();expect(doc.querySelector('[data-child]')).not.toBeNull();expect(document.querySelector('[data-child]')).toBeNull();key();expect(requests).not.toHaveBeenCalled();doc.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));flushSync();expect(requests.mock.calls).toEqual([['child']]);
});
it.each(['modal','sheet','drawer','alert','popover'] as const)('%s retained element cannot deliver an old gesture to replacement store',async kind=>{
 const{app,requests}=setup(kind);app.open();flushSync();document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));app.replaceOwner();flushSync();await new Promise(resolve=>setTimeout(resolve,5));expect(requests).not.toHaveBeenCalled();document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));await vi.waitFor(()=>expect(requests.mock.calls).toEqual([['replacement']]));
});

it.each(['sheet','drawer','alert','popover'] as const)('Modal over %s also requests only its own dismissal',kind=>{
 const{app,requests}=setup(kind,true);app.open();flushSync();key();expect(requests.mock.calls).toEqual([['child']]);
});
it('initially rendered overlay layers remain above later inline navigation enrollment',()=>{
 const target=document.createElement('div');document.body.append(target);const requests=vi.fn();const app=mount(Fixture,{target,props:{kind:'alert',requests,initialTop:true,initialNavigation:true}});flushSync();releases.push(async()=>{await unmount(app);target.remove();});key();expect(requests.mock.calls).toEqual([['child']]);
});

it.each(['modal','sheet','drawer','alert','popover'] as const)('initially nested %s selects the child above its owning parent',kind=>{
 const target=document.createElement('div');document.body.append(target);const requests=vi.fn();const app=mount(Fixture,{target,props:{kind,requests,initialTop:true,nested:true}});flushSync();releases.push(async()=>{await unmount(app);target.remove();});key();expect(requests.mock.calls).toEqual([['child']]);
});

it.each(['modal','sheet','drawer','alert','popover'] as const)('%s accepts its own Escape and outside intent during entrance',async kind=>{
 const {app,requests}=setup(kind);app.phase('presenting');app.open();flushSync();key();
 expect(requests.mock.calls).toEqual([['child']]);requests.mockClear();
 document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
 await vi.waitFor(()=>expect(requests.mock.calls).toEqual([['child']]));
 requests.mockClear();app.veto(true);app.disableOutsidePointer(true);flushSync();key();
 document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,5));expect(requests).not.toHaveBeenCalled();
});
it.each(['modal','sheet','drawer','alert','popover'] as const)('%s dismissing remains inert and shields its parent',async kind=>{
 const {app,requests}=setup(kind);app.phase('dismissing');app.open();flushSync();key();
 document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,5));expect(requests).not.toHaveBeenCalled();
 app.phase('presenting');flushSync();key();expect(requests.mock.calls).toEqual([['child']]);
});

function pointer(target:EventTarget=document.body){target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));}
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
it.each(['modal','sheet','drawer','alert','popover'] as const)('%s drops a pointer armed while dismissing before the same view reenters',async kind=>{
 const{app,requests}=setup(kind);app.phase('dismissing');app.open();flushSync();
 pointer();app.phase('presenting');flushSync();await settle();expect(requests).not.toHaveBeenCalled();
 pointer();await vi.waitFor(()=>expect(requests.mock.calls).toEqual([['child']]));
});
it.each(['modal','sheet','drawer','alert','popover'] as const)('nested %s with disabled outside pointer shields its parent until re-enabled',async kind=>{
 const{app,requests}=setup(kind,false,true);app.open();app.disableOutsidePointer(true);flushSync();
 pointer();await settle();expect(requests).not.toHaveBeenCalled();
 app.disableOutsidePointer(false);flushSync();pointer();await vi.waitFor(()=>expect(requests.mock.calls).toEqual([['child']]));
});
it.each(['modal','sheet','drawer','alert','popover'] as const)('pointer inside portaled disabled %s never dismisses its logical parent',async kind=>{
 const{app,requests}=setup(kind,false,true);app.open();app.disableOutsidePointer(true);flushSync();
 const inside=document.querySelector('[data-child] button')!;expect(document.querySelector('[data-parent]')!.contains(inside)).toBe(false);
 pointer(inside);await settle();expect(requests).not.toHaveBeenCalled();
 app.disableOutsidePointer(false);flushSync();pointer();await vi.waitFor(()=>expect(requests.mock.calls).toEqual([['child']]));
});
it.each(['alert','popover'] as const)('%s with store-gated content fires onDismissalComplete exactly once when active content is removed while dismissing',async kind=>{
 const onDismissalComplete=vi.fn();
 const {app,requests,teardown}=setup(kind,false,false,true,onDismissalComplete);
 app.open();flushSync();
 const child=document.querySelector('[data-child]');
 expect(child).not.toBeNull();
 const parent=child!.parentElement;
 expect(document.body.contains(parent)).toBe(true);
 app.phase('dismissing');flushSync();
 app.clearChildState();flushSync();
 expect(document.querySelector('[data-child]')).toBeNull();
 expect(document.body.contains(parent)).toBe(true);
 await vi.waitFor(()=>{
  expect(onDismissalComplete).toHaveBeenCalledTimes(1);
  expect(requests.mock.calls.filter(c=>c[0]==='dismissalComplete')).toHaveLength(1);
  expect(app.getDismissalCompletionCount()).toBe(1);
 });
 const beforeTeardown=onDismissalComplete.mock.calls.length;
 await teardown();
 expect(onDismissalComplete).toHaveBeenCalledTimes(beforeTeardown);
 expect(app.getDismissalCompletionCount()).toBe(beforeTeardown);
});
it('modal paired policy control: store-gated content removal during dismissing fires onDismissalComplete exactly once',async()=>{
 const onDismissalComplete=vi.fn();
 const {app,requests,teardown}=setup('modal',false,false,true,onDismissalComplete);
 app.open();flushSync();
 const child=document.querySelector('[data-child]');
 expect(child).not.toBeNull();
 const parent=child!.parentElement;
 expect(document.body.contains(parent)).toBe(true);
 app.phase('dismissing');flushSync();
 app.clearChildState();flushSync();
 expect(document.querySelector('[data-child]')).toBeNull();
 expect(document.body.contains(parent)).toBe(true);
 await vi.waitFor(()=>{
  expect(onDismissalComplete).toHaveBeenCalledTimes(1);
  expect(requests.mock.calls.filter(c=>c[0]==='dismissalComplete')).toHaveLength(1);
  expect(app.getDismissalCompletionCount()).toBe(1);
 });
 const beforeTeardown=onDismissalComplete.mock.calls.length;
 await teardown();
 expect(onDismissalComplete).toHaveBeenCalledTimes(beforeTeardown);
 expect(app.getDismissalCompletionCount()).toBe(beforeTeardown);
});
it.each(['modal','alert','popover'] as const)('%s ungated content removal outside dismissing does not falsely complete',async kind=>{
 const onDismissalComplete=vi.fn();
 const {app,requests,teardown}=setup(kind,false,false,false,onDismissalComplete);
 app.open();flushSync();
 const child=document.querySelector('[data-child]');
 expect(child).not.toBeNull();
 const parent=child!.parentElement;
 expect(document.body.contains(parent)).toBe(true);
 app.removeContent();flushSync();
 expect(document.querySelector('[data-child]')).toBeNull();
 expect(document.body.contains(parent)).toBe(true);
 await settle();
 expect(onDismissalComplete).not.toHaveBeenCalled();
 expect(requests.mock.calls.filter(c=>c[0]==='dismissalComplete')).toHaveLength(0);
 expect(app.getDismissalCompletionCount()).toBe(0);
 const beforeTeardown=onDismissalComplete.mock.calls.length;
 await teardown();
 expect(onDismissalComplete).toHaveBeenCalledTimes(beforeTeardown);
 expect(app.getDismissalCompletionCount()).toBe(beforeTeardown);
});
