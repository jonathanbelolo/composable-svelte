<script lang="ts">
	/**
	 * A lightbox opened on a real image, so the loading state resolves the way it
	 * does in an application: the `<img>` fires `load`, which dispatches
	 * `lightboxImageLoaded`.
	 *
	 * The `src` is a data URI. `load` still fires in a later task, never
	 * synchronously during mount, which is what lets a test observe the loading
	 * state and then its resolution without racing a network.
	 */
	import { createStore } from '../../src/lib/store.svelte.js';
	import ImageLightbox from '../../src/lib/components/image-gallery/ImageLightbox.svelte';
	import {
		imageGalleryReducer,
		createInitialImageGalleryState
	} from '../../src/lib/components/image-gallery/image-gallery.reducer.js';

	const PIXEL =
		'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

	const store = createStore({
		initialState: {
			...createInitialImageGalleryState({
				images: [
					{ id: 'a', url: PIXEL, alt: 'First' },
					{ id: 'b', url: PIXEL, alt: 'Second' }
				]
			}),
			lightbox: {
				isOpen: true,
				currentIndex: 0,
				presentation: { status: 'presented' as const, content: 0 },
				isImageLoading: true,
				imageLoadError: null
			}
		},
		reducer: imageGalleryReducer
	});

	if (typeof window !== 'undefined') {
		(window as any).__lightboxTestStore = store;
	}
</script>

<ImageLightbox {store} />
