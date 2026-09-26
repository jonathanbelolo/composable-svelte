import {afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import Fixture from './fixtures/DismissalLayers.svelte';
const releases:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const release of releases.splice(0).reverse())await release();});
function setup(kind:'modal'|'sheet'|'drawer'|'alert'|'popover',extra:Record<string,unknown>={}){
 const target=document.createElement('div');document.body.append(target);const requests=vi.fn();
 const app=mount(Fixture,{target,props:{kind,requests,initialStoreGated:true,...extra}});
 releases.push(async()=>{await unmount(app);target.remove();});return{app,requests};
}
it.each(['alert','popover'] as const)('%s completed marker prevents store removal from notifying twice after ordinary exit',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onDismissalComplete:complete});app.open();flushSync();app.phase('dismissing');flushSync();
 await vi.waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));app.clearChildState();flushSync();await Promise.resolve();
 expect(complete).toHaveBeenCalledTimes(1);expect(app.getDismissalCompletionCount()).toBe(1);
});
it.each(['alert','popover'] as const)('%s same-turn content rebound cancels removed-content settlement and ordinary exit completes once',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onDismissalComplete:complete});app.open();flushSync();app.phase('dismissing');flushSync();
 app.clearChildState();flushSync();app.restoreChildState();flushSync();await Promise.resolve();expect(complete).not.toHaveBeenCalled();
 await vi.waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));
});
it('stale flush ordering control: later presentation change is observed before removed-content delivery',async()=>{
 const complete=vi.fn(),{app}=setup('alert',{onDismissalComplete:complete});app.open();flushSync();app.phase('dismissing');flushSync();
 app.clearChildState();flushSync();app.phase('presented');await Promise.resolve();
 expect(complete).not.toHaveBeenCalled();
});
it.each(['modal','sheet','drawer','alert','popover'] as const)('%s presenting content removal settles presentation completion only',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onPresentationComplete:complete});app.open();flushSync();app.phase('presenting');flushSync();
 app.clearChildState();flushSync();
 await new Promise(resolve=>setTimeout(resolve,50));expect(complete).toHaveBeenCalledTimes(1);
 expect(app.getPresentationCompletionCount()).toBe(1);expect(app.getDismissalCompletionCount()).toBe(0);
});

it.each(['alert','popover'] as const)('%s presenting completed marker prevents content removal from notifying twice after ordinary entrance',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onPresentationComplete:complete});app.open();flushSync();app.phase('presenting');flushSync();
 await vi.waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));app.clearChildState();flushSync();await Promise.resolve();
 expect(complete).toHaveBeenCalledTimes(1);expect(app.getDismissalCompletionCount()).toBe(0);
});

it.each(['alert','popover'] as const)('%s same-turn presenting content rebound cancels settlement and ordinary entrance completes once',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onPresentationComplete:complete});app.open();flushSync();app.phase('presenting');flushSync();
 app.clearChildState();flushSync();app.restoreChildState();flushSync();await Promise.resolve();expect(complete).not.toHaveBeenCalled();
 await vi.waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));expect(app.getDismissalCompletionCount()).toBe(0);
});

it.each(['modal','sheet','drawer','alert','popover'] as const)('%s direct content removal while presenting settles once without changing store identity',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onPresentationComplete:complete,initialStoreGated:false});app.open();flushSync();app.phase('presenting');flushSync();
 app.removeContent();flushSync();await Promise.resolve();expect(complete).toHaveBeenCalledTimes(1);
 expect(app.getDismissalCompletionCount()).toBe(0);
});

it.each(['modal','sheet','drawer','alert','popover'] as const)('%s identical content can present again after an unbound idle cycle',async kind=>{
 const complete=vi.fn(),{app}=setup(kind,{onPresentationComplete:complete});app.open();flushSync();app.phase('presenting');flushSync();
 app.clearChildState();flushSync();await Promise.resolve();expect(complete).toHaveBeenCalledTimes(1);
 app.idle();flushSync();app.restoreChildState();flushSync();app.phase('presenting');flushSync();
 app.clearChildState();flushSync();await Promise.resolve();
 await vi.waitFor(()=>expect(complete).toHaveBeenCalledTimes(2));
});
