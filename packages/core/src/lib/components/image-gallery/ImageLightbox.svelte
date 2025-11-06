<script lang="ts">
	import { animate } from 'motion';
	import type { Store } from '../../types.js';
	import type { ImageGalleryState, ImageGalleryAction } from './image-gallery.types.js';

	/**
	 * Image Lightbox Component
	 *
	 * Full-screen modal for viewing images with custom navigation.
	 * Features: touch gestures, keyboard nav, focus trap, animations.
	 */

	interface Props {
		// Required
		store: Store<ImageGalleryState, ImageGalleryAction>;

		// Optional configuration
		showCaptions?: boolean;
		showCounter?: boolean;
		enableKeyboard?: boolean;
		enableSwipe?: boolean;

		// Callbacks
		onClose?: () => void;
		onImageChange?: (index: number) => void;

		// Styling
		class?: string;
	}

	const {
		store,
		showCaptions = true,
		showCounter = true,
		enableKeyboard = true,
		enableSwipe = true,
		onClose,
		onImageChange,
		class: className = ''
	}: Props = $props();

	// Component refs
	let lightboxElement: HTMLElement | undefined = $state();
	let imageElement: HTMLImageElement | undefined = $state();
	let previouslyFocusedElement: HTMLElement | null = null;

	// Create reactive state from store
	let storeState = $state(store.state);
	let previousIndex = $state(storeState.lightbox.currentIndex);

	// Subscribe to store updates
	$effect(() => {
		const unsubscribe = store.subscribe((newState) => {
			storeState = newState;
		});
		return unsubscribe;
	});

	// Current image
	const currentImage = $derived(() => {
		const index = storeState.lightbox.currentIndex;
		return storeState.images[index];
	});

	// Navigation state
	const canGoPrevious = $derived(() => storeState.lightbox.currentIndex > 0);
	const canGoNext = $derived(
		() => storeState.lightbox.currentIndex < storeState.images.length - 1
	);

	// Counter text
	const counterText = $derived(
		() => `${storeState.lightbox.currentIndex + 1} / ${storeState.images.length}`
	);

	// Get all focusable elements in lightbox
	function getFocusableElements(): HTMLElement[] {
		if (!lightboxElement) return [];
		return Array.from(
			lightboxElement.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		);
	}

	// Keyboard navigation handler
	function handleKeydown(event: KeyboardEvent) {
		if (!enableKeyboard) return;

		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				store.dispatch({ type: 'previousImage' });
				break;

			case 'ArrowRight':
				event.preventDefault();
				store.dispatch({ type: 'nextImage' });
				break;

			case 'Escape':
				event.preventDefault();
				store.dispatch({ type: 'closeLightbox' });
				break;

			case 'Home':
				event.preventDefault();
				store.dispatch({ type: 'goToImage', index: 0 });
				break;

			case 'End':
				event.preventDefault();
				store.dispatch({
					type: 'goToImage',
					index: store.state.images.length - 1
				});
				break;
		}

		// Focus trap for Tab key
		if (event.key === 'Tab') {
			const focusableElements = getFocusableElements();
			if (focusableElements.length === 0) return;

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (event.shiftKey) {
				// Shift+Tab: moving backwards
				if (document.activeElement === firstElement) {
					event.preventDefault();
					lastElement.focus();
				}
			} else {
				// Tab: moving forwards
				if (document.activeElement === lastElement) {
					event.preventDefault();
					firstElement.focus();
				}
			}
		}
	}

	// Touch gesture handlers
	function handleTouchStart(e: TouchEvent) {
		if (!enableSwipe) return;
		const touch = e.touches[0];
		store.dispatch({
			type: 'touchStart',
			x: touch.clientX,
			y: touch.clientY
		});
	}

	function handleTouchMove(e: TouchEvent) {
		if (!enableSwipe || !storeState.touch.isDragging) return;

		const touch = e.touches[0];
		store.dispatch({
			type: 'touchMove',
			x: touch.clientX,
			y: touch.clientY
		});

		// Prevent body scroll during swipe
		e.preventDefault();
	}

	function handleTouchEnd() {
		if (!enableSwipe) return;
		store.dispatch({ type: 'touchEnd' });
	}

	// Lightbox open/close animations
	$effect(() => {
		if (!lightboxElement) return;

		if (storeState.lightbox.presentation.status === 'presenting') {
			if (storeState.prefersReducedMotion) {
				// Skip animation
				store.dispatch({
					type: 'presentation',
					event: { type: 'presentationCompleted' }
				});
			} else {
				// Animate in
				animate(
					lightboxElement,
					{
						opacity: [0, 1],
						scale: [0.95, 1]
					},
					{
						duration: 0.3,
						easing: 'ease-out'
					}
				).finished.then(() => {
					store.dispatch({
						type: 'presentation',
						event: { type: 'presentationCompleted' }
					});
				});
			}
		}

		if (storeState.lightbox.presentation.status === 'dismissing') {
			if (storeState.prefersReducedMotion) {
				// Skip animation
				store.dispatch({
					type: 'presentation',
					event: { type: 'dismissalCompleted' }
				});
			} else {
				// Animate out
				animate(
					lightboxElement,
					{
						opacity: [1, 0],
						scale: [1, 0.95]
					},
					{
						duration: 0.3,
						easing: 'ease-in'
					}
				).finished.then(() => {
					store.dispatch({
						type: 'presentation',
						event: { type: 'dismissalCompleted' }
					});
				});
			}
		}
	});

	// Track index changes for callback
	$effect(() => {
		if (previousIndex !== storeState.lightbox.currentIndex) {
			previousIndex = storeState.lightbox.currentIndex;

			// Notify callback
			if (onImageChange) {
				onImageChange(storeState.lightbox.currentIndex);
			}
		}
	});

	// Focus management
	$effect(() => {
		if (storeState.lightbox.isOpen && storeState.lightbox.presentation.status === 'presented') {
			// Save currently focused element
			previouslyFocusedElement = document.activeElement as HTMLElement;

			// Focus the first focusable element or the lightbox itself
			const focusableElements = getFocusableElements();
			if (focusableElements.length > 0) {
				focusableElements[0].focus();
			} else if (lightboxElement) {
				lightboxElement.focus();
			}

			// Add keyboard listener
			window.addEventListener('keydown', handleKeydown);

			return () => {
				window.removeEventListener('keydown', handleKeydown);

				// Restore focus when closing
				if (previouslyFocusedElement) {
					previouslyFocusedElement.focus();
					previouslyFocusedElement = null;
				}
			};
		}
	});

	// Body scroll prevention
	$effect(() => {
		if (storeState.lightbox.isOpen && storeState.lightbox.presentation.status === 'presented') {
			// Disable body scroll
			const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
			document.body.style.overflow = 'hidden';
			// Prevent layout shift from scrollbar disappearing
			document.body.style.paddingRight = `${scrollbarWidth}px`;

			return () => {
				// Re-enable body scroll
				document.body.style.overflow = '';
				document.body.style.paddingRight = '';
			};
		}
	});

	// Close handler
	function handleClose() {
		store.dispatch({ type: 'closeLightbox' });
		if (onClose) {
			onClose();
		}
	}
</script>

{#if storeState.lightbox.isOpen}
	<div
		bind:this={lightboxElement}
		class="image-lightbox {className}"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		tabindex="-1"
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
	>
		<!-- Backdrop -->
		<div
			class="image-lightbox__backdrop"
			onclick={handleClose}
			aria-hidden="true"
		></div>

		<!-- Content -->
		<div class="image-lightbox__content">
			<!-- Close button -->
			<button
				type="button"
				class="image-lightbox__close"
				onclick={handleClose}
				aria-label="Close image viewer"
			>
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>

			<!-- Counter -->
			{#if showCounter && storeState.images.length > 1}
				<div class="image-lightbox__counter" aria-live="polite">
					{counterText()}
				</div>
			{/if}

			<!-- Image container -->
			<div class="image-lightbox__image-container">

				{#if storeState.lightbox.imageLoadError}
					<div class="image-lightbox__error" role="alert">
						<svg
							width="48"
							height="48"
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
						<p>{storeState.lightbox.imageLoadError}</p>
						<button
							type="button"
							class="image-lightbox__retry"
							onclick={() => store.dispatch({ type: 'retryLoadImage' })}
						>
							Retry
						</button>
					</div>
				{:else}
					{#key storeState.lightbox.currentIndex}
					<img
						bind:this={imageElement}
						class="image-lightbox__image"
						
						src={currentImage().url}
						srcset={currentImage().srcset}
						sizes={currentImage().sizes}
						alt={currentImage().alt}
						onerror={() =>
							store.dispatch({
								type: 'lightboxImageError',
								error: 'Failed to load image'
							})}
						onload={() => store.dispatch({ type: 'lightboxImageLoaded' })}/>
					{/key}
				{/if}
			</div>

			<!-- Caption -->
			{#if showCaptions && currentImage().caption}
				<div class="image-lightbox__caption">
					{currentImage().caption}
				</div>
			{/if}

			<!-- Navigation buttons -->
			{#if storeState.images.length > 1}
				<button
					type="button"
					class="image-lightbox__nav image-lightbox__nav--prev"
					onclick={() => store.dispatch({ type: 'previousImage' })}
					disabled={!canGoPrevious() || storeState.isNavigating}
					aria-label="Previous image"
				>
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polyline points="15 18 9 12 15 6"></polyline>
					</svg>
				</button>

				<button
					type="button"
					class="image-lightbox__nav image-lightbox__nav--next"
					onclick={() => store.dispatch({ type: 'nextImage' })}
					disabled={!canGoNext() || storeState.isNavigating}
					aria-label="Next image"
				>
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.image-lightbox {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.image-lightbox__backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
	}

	.image-lightbox__content {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 64px 80px;
		z-index: 1;
	}

	/* Close button */
	.image-lightbox__close {
		position: absolute;
		top: 16px;
		right: 16px;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: background 0.2s ease;
		z-index: 10;
	}

	.image-lightbox__close:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.image-lightbox__close:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}

	/* Counter */
	.image-lightbox__counter {
		position: absolute;
		top: 24px;
		left: 50%;
		transform: translateX(-50%);
		padding: 8px 16px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border-radius: 20px;
		font-size: 14px;
		font-weight: 500;
		z-index: 10;
	}

	/* Image container */
	.image-lightbox__image-container {
		position: relative;
		max-width: 100%;
		max-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.image-lightbox__image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.image-lightbox__image.opacity-0 {
		opacity: 0;
	}

	/* Loading skeleton */
	.image-lightbox__skeleton {
		width: 600px;
		height: 400px;
		max-width: 100%;
		max-height: 100%;
		background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: 8px;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* Error state */
	.image-lightbox__error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 32px;
		color: white;
		text-align: center;
	}

	.image-lightbox__error svg {
		color: #ef4444;
	}

	.image-lightbox__error p {
		margin: 0;
		font-size: 16px;
	}

	.image-lightbox__retry {
		padding: 8px 24px;
		background: white;
		color: black;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.image-lightbox__retry:hover {
		background: #f0f0f0;
	}

	.image-lightbox__retry:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}

	/* Caption */
	.image-lightbox__caption {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		max-width: 80%;
		padding: 12px 24px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border-radius: 8px;
		font-size: 14px;
		text-align: center;
		z-index: 10;
	}

	/* Navigation buttons */
	.image-lightbox__nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: background 0.2s ease;
		z-index: 10;
	}

	.image-lightbox__nav:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}

	.image-lightbox__nav:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}

	.image-lightbox__nav:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.image-lightbox__nav--prev {
		left: 16px;
	}

	.image-lightbox__nav--next {
		right: 16px;
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

	/* Mobile responsive */
	@media (max-width: 640px) {
		.image-lightbox__content {
			padding: 48px 16px;
		}

		.image-lightbox__nav {
			width: 48px;
			height: 48px;
		}

		.image-lightbox__nav svg {
			width: 24px;
			height: 24px;
		}

		.image-lightbox__close {
			width: 40px;
			height: 40px;
		}

		.image-lightbox__close svg {
			width: 20px;
			height: 20px;
		}

		.image-lightbox__caption {
			max-width: 90%;
			font-size: 12px;
			padding: 8px 16px;
		}
	}
</style>
