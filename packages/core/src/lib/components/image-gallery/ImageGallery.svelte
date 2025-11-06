<script lang="ts">
	import { onMount } from 'svelte';
	import { createStore } from '$lib/store.js';
	import type { Store } from '$lib/types.js';
	import {
		imageGalleryReducer,
		createInitialImageGalleryState
	} from './image-gallery.reducer.js';
	import type {
		ImageGalleryState,
		ImageGalleryAction,
		GalleryImage,
		ImageGalleryDependencies
	} from './image-gallery.types.js';
	import ImageLightbox from './ImageLightbox.svelte';

	/**
	 * Image Gallery Component - Dual Mode API
	 *
	 * Displays images in a responsive grid with optional lightbox.
	 * Supports two modes:
	 * 1. Simple: Component creates internal store
	 * 2. Advanced: User provides external store
	 */

	// Mode detection: if store is provided, use advanced mode
	interface SimpleProps {
		// Required
		images: GalleryImage[];

		// Optional configuration
		columns?: number;
		gap?: number;
		aspectRatio?: 'auto' | 'square' | '16:9' | '4:3';

		// Callbacks
		onImageClick?: (image: GalleryImage, index: number) => void;
		onImageLoad?: (imageId: string) => void;
		onImageError?: (imageId: string, error: string) => void;

		// Styling
		class?: string;
		thumbnailClass?: string;

		// Features
		enableLightbox?: boolean; // Default: true
		enableLazyLoad?: boolean; // Default: true

		// Advanced mode not used
		store?: never;
	}

	interface AdvancedProps {
		// Required
		store: Store<ImageGalleryState, ImageGalleryAction>;

		// Styling
		class?: string;
		thumbnailClass?: string;

		// Simple mode props not used
		images?: never;
		columns?: never;
		gap?: never;
		aspectRatio?: never;
		onImageClick?: never;
		onImageLoad?: never;
		onImageError?: never;
		enableLightbox?: never;
		enableLazyLoad?: never;
	}

	type Props = SimpleProps | AdvancedProps;

	const props = $props<Props>();

	// Determine mode and setup store
	const isAdvancedMode = 'store' in props && props.store !== undefined;

	// Simple mode: create internal store
	let internalStore: Store<ImageGalleryState, ImageGalleryAction> | undefined = undefined;

	if (!isAdvancedMode) {
		const simpleProps = props as SimpleProps;
		const dependencies: ImageGalleryDependencies = {
			onImageClick: simpleProps.onImageClick,
			onImageLoad: simpleProps.onImageLoad,
			onImageError: simpleProps.onImageError
		};

		internalStore = createStore({
			initialState: createInitialImageGalleryState({
				images: simpleProps.images,
				columns: simpleProps.columns,
				gap: simpleProps.gap,
				aspectRatio: simpleProps.aspectRatio
			}),
			reducer: imageGalleryReducer,
			dependencies
		});
	}

	// Get active store
	const store = isAdvancedMode ? (props as AdvancedProps).store : internalStore!;

	// Extract props for component use
	const enableLightbox =
		isAdvancedMode || (props as SimpleProps).enableLightbox === undefined
			? true
			: (props as SimpleProps).enableLightbox;
	const enableLazyLoad =
		isAdvancedMode || (props as SimpleProps).enableLazyLoad === undefined
			? true
			: (props as SimpleProps).enableLazyLoad;

	// Component refs
	let gridElement: HTMLElement | undefined = $state();
	let observer: IntersectionObserver | undefined = undefined;

	// Create reactive state from store
	let storeState = $state(store.state);

	// Subscribe to store updates
	$effect(() => {
		const unsubscribe = store.subscribe((newState) => {
			storeState = newState;
		});
		return unsubscribe;
	});

	// Get aspect ratio class
	const aspectRatioClass = $derived(() => {
		switch (storeState.aspectRatio) {
			case 'square':
				return 'aspect-square';
			case '16:9':
				return 'aspect-video';
			case '4:3':
				return 'aspect-[4/3]';
			default:
				return '';
		}
	});

	// Grid columns CSS variable
	const gridStyle = $derived(
		`grid-template-columns: repeat(${storeState.columns}, 1fr); gap: ${storeState.gap}px;`
	);

	// Lazy loading with proper cleanup
	$effect(() => {
		if (enableLazyLoad && gridElement && storeState.images.length > 0) {
			// Disconnect old observer
			observer?.disconnect();

			// Create new observer
			observer = new IntersectionObserver((entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						const img = entry.target as HTMLImageElement;
						const src = img.dataset.src;
						const imageId = img.dataset.id;
						if (src && imageId) {
							img.src = src;
							store.dispatch({ type: 'imageLoaded', imageId });
							observer!.unobserve(img);
						}
					}
				});
			});

			// Observe all unloaded thumbnails
			const thumbnails = gridElement.querySelectorAll('img[data-src]');
			thumbnails.forEach((img) => observer!.observe(img));

			// Cleanup
			return () => {
				observer?.disconnect();
				observer = undefined;
			};
		}
	});

	// Update images when prop changes (simple mode only)
	$effect(() => {
		if (!isAdvancedMode) {
			const simpleProps = props as SimpleProps;
			store.dispatch({ type: 'imagesUpdated', images: simpleProps.images });
		}
	});

	// Detect reduced motion preference
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

		store.dispatch({
			type: 'motionPreferenceChanged',
			prefersReduced: mediaQuery.matches
		});

		const handler = (e: MediaQueryListEvent) => {
			store.dispatch({
				type: 'motionPreferenceChanged',
				prefersReduced: e.matches
			});
		};

		mediaQuery.addEventListener('change', handler);

		return () => {
			mediaQuery.removeEventListener('change', handler);
		};
	});

	// Placeholder for lazy loading
	const placeholderSvg =
		'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3Crect fill="%23e5e7eb" width="1" height="1"/%3E%3C/svg%3E';

	// Reactive lightbox state for rendering
	const shouldShowLightbox = $derived(
		enableLightbox && !isAdvancedMode && storeState.lightbox.isOpen
	);
</script>

<div
	bind:this={gridElement}
	class="image-gallery {props.class ?? ''}"
	style={gridStyle}
	role="list"
	aria-label="Image gallery"
>
	{#each storeState.images as image, index (image.id)}
		<div
			class="image-gallery__thumbnail {props.thumbnailClass ?? ''}"
			role="listitem"
		>
			<button
				type="button"
				class="image-gallery__button {aspectRatioClass()}"
				onclick={() => {
					if (enableLightbox) {
						store.dispatch({ type: 'imageClicked', index });
					} else if (!isAdvancedMode) {
						const simpleProps = props as SimpleProps;
						simpleProps.onImageClick?.(image, index);
					}
				}}
				aria-label={`View ${image.alt}`}
			>
				<img
					data-id={image.id}
					data-src={enableLazyLoad ? image.thumbnailUrl || image.url : undefined}
					src={enableLazyLoad ? placeholderSvg : image.thumbnailUrl || image.url}
					srcset={enableLazyLoad ? undefined : image.srcset}
					sizes={enableLazyLoad ? undefined : image.sizes}
					alt={image.alt}
					class="image-gallery__image"
					loading={enableLazyLoad ? 'lazy' : undefined}
					onerror={() => {
						store.dispatch({
							type: 'imageError',
							imageId: image.id,
							error: 'Failed to load image'
						});
					}}
				/>
				{#if storeState.errors[image.id]}
					<div class="image-gallery__error" aria-live="polite">
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10"></circle>
							<line x1="12" y1="8" x2="12" y2="12"></line>
							<line x1="12" y1="16" x2="12.01" y2="16"></line>
						</svg>
						<span class="sr-only">Error loading image</span>
					</div>
				{/if}
			</button>
		</div>
	{/each}
</div>

<!-- Lightbox (simple mode only) -->
{#if shouldShowLightbox}
	<ImageLightbox {store} />
{/if}

<style>
	.image-gallery {
		display: grid;
		width: 100%;
	}

	.image-gallery__thumbnail {
		position: relative;
		overflow: hidden;
		border-radius: 8px;
	}

	.image-gallery__button {
		position: relative;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		overflow: hidden;
		display: block;
		transition: transform 0.2s ease;
	}

	.image-gallery__button:hover {
		transform: scale(1.02);
	}

	.image-gallery__button:active {
		transform: scale(0.98);
	}

	.image-gallery__button:focus-visible {
		outline: 2px solid #007aff;
		outline-offset: 2px;
	}

	/* Aspect ratio classes */
	.image-gallery__button.aspect-square {
		aspect-ratio: 1 / 1;
	}

	.image-gallery__button.aspect-video {
		aspect-ratio: 16 / 9;
	}

	.image-gallery__button.aspect-\[4\/3\] {
		aspect-ratio: 4 / 3;
	}

	.image-gallery__image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.image-gallery__error {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.1);
		color: #ef4444;
	}

	/* Screen reader only */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	/* Responsive breakpoints */
	@media (max-width: 640px) {
		.image-gallery {
			grid-template-columns: repeat(
				1,
				1fr
			) !important; /* Force single column on mobile */
		}
	}
</style>
