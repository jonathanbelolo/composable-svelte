import {afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import Fixture from './fixtures/DismissalLayers.svelte';

const releases:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const release of releases.splice(0).reverse())await release();});

it.each(['sheet','drawer'] as const)('%s H-16a follow-through settles store-gated content removal while dismissing exactly once',async kind=>{
 const target=document.createElement('div');document.body.append(target);
 const requests=vi.fn(),onDismissalComplete=vi.fn();
 const app=mount(Fixture,{target,props:{kind,requests,initialStoreGated:true,onDismissalComplete}});
 releases.push(async()=>{await unmount(app);target.remove();});
 app.open();flushSync();expect(document.querySelector('[data-child]')).not.toBeNull();
 app.phase('dismissing');flushSync();app.clearChildState();flushSync();
 expect(document.querySelector('[data-child]')).toBeNull();
 await vi.waitFor(()=>expect(onDismissalComplete).toHaveBeenCalledTimes(1));
 expect(requests.mock.calls.filter(call=>call[0]==='dismissalComplete')).toHaveLength(1);
 expect(app.getDismissalCompletionCount()).toBe(1);
});
