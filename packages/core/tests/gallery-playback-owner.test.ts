import {it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {createStore} from '../src/lib/store.svelte.js';
import {imageGalleryReducer,createInitialImageGalleryState} from '../src/lib/components/image-gallery/image-gallery.reducer.js';
const controls=vi.hoisted(()=>({plays:[] as Array<{finish:()=>void;stop:ReturnType<typeof vi.fn>}>}));
vi.mock('motion',()=>({animate:vi.fn(()=>{let finish!:()=>void;const finished=new Promise<void>(resolve=>{finish=resolve});const stop=vi.fn();controls.plays.push({finish,stop});return {finished,stop};})}));
import ImageLightbox from '../src/lib/components/image-gallery/ImageLightbox.svelte';
it('owns lightbox playback across unrelated state updates and same-phase reopening',async()=>{
 controls.plays.length=0;const store=createStore({initialState:createInitialImageGalleryState({images:[{id:'a',url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',alt:'A'}]}),reducer:imageGalleryReducer,dependencies:{}});
 store.dispatch({type:'openLightbox',index:0});const target=document.createElement('div');document.body.append(target);const component=mount(ImageLightbox,{target,props:{store}});flushSync();
 try {
  await target.querySelector('img')!.decode();flushSync();
  expect(controls.plays).toHaveLength(1);
  store.dispatch({type:'lightboxImageLoaded'});flushSync();expect(controls.plays).toHaveLength(1);
  controls.plays[0]!.finish();await Promise.resolve();flushSync();expect(store.state.lightbox.presentation.status).toBe('presented');
  store.dispatch({type:'closeLightbox'});flushSync();const firstExit=controls.plays.at(-1)!;
  store.dispatch({type:'openLightbox',index:0});flushSync();expect(firstExit.stop).toHaveBeenCalledOnce();
  controls.plays.at(-1)!.finish();await Promise.resolve();flushSync();
  store.dispatch({type:'closeLightbox'});flushSync();const secondExit=controls.plays.at(-1)!;
  firstExit.finish();await Promise.resolve();flushSync();expect(store.state.lightbox.presentation.status).toBe('dismissing');
  secondExit.finish();await Promise.resolve();flushSync();expect(store.state.lightbox.presentation.status).toBe('idle');
 } finally {await unmount(component);store.destroy();target.remove();}
});
