<script lang="ts">
 import { onDestroy } from 'svelte';
 import { useOverlayMotion, defineChoreography } from '../../../src/lib/application/motion-public.js';
 import ImageLightbox from '../../../src/lib/components/image-gallery/ImageLightbox.svelte';
 import { createStore } from '../../../src/lib/store.svelte.js';
 import { imageGalleryReducer, createInitialImageGalleryState } from '../../../src/lib/components/image-gallery/image-gallery.reducer.js';
 import { lightboxHooks } from './LightboxHooks.js';
 import { optionalRouteHost } from '../../../src/lib/application/renderer/choreography/route-host.js';
 const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
 const store = createStore({ initialState: createInitialImageGalleryState({ images: [{ id: 'a', url: pixel, alt: 'a' }, { id: 'b', url: pixel, alt: 'b' }] } as never), reducer: imageGalleryReducer as never, dependencies: {} as never });
 onDestroy(() => store.destroy());
 const viewer = useOverlayMotion(overlay => ({
  open: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: overlay.select('content'), side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 }, scale: { from: 0.9, to: 1 } }] }),
  close: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }] })
 }));
 lightboxHooks.store = store as never;
 (lightboxHooks as { host?: unknown }).host = optionalRouteHost();
</script>
<ImageLightbox store={store as never} motion={viewer}/>
