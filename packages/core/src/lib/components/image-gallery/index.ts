/**
 * Image Gallery Component System
 *
 * Reusable image gallery with grid display, lightbox modal,
 * touch gestures, and animations.
 */

// Components
export { default as ImageGallery } from './ImageGallery.svelte';
export { default as ImageLightbox } from './ImageLightbox.svelte';

// Types
export type {
	GalleryImage,
	ImageGalleryState,
	ImageGalleryAction,
	ImageGalleryDependencies,
	ImageGalleryConfig,
	LightboxState,
	TouchState,
	PresentationEvent
} from './image-gallery.types.js';

// Reducer & State
export { imageGalleryReducer, createInitialImageGalleryState } from './image-gallery.reducer.js';
