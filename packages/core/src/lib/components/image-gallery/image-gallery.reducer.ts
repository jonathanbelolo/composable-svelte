/**
 * Image Gallery Reducer
 *
 * Pure reducer for Image Gallery state management.
 * Handles grid interactions, lightbox navigation, touch gestures, and animations.
 */

import type { Reducer, Effect } from '../../types.js';
import { Effect as EffectBuilder } from '../../effect.js';
import type {
	ImageGalleryState,
	ImageGalleryAction,
	ImageGalleryDependencies,
	ImageGalleryConfig
} from './image-gallery.types.js';

/**
 * Default image preloader using Image() constructor
 */
const defaultPreloadImage = (url: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve();
		img.onerror = reject;
		img.src = url;
	});
};

/**
 * Create initial Image Gallery state
 */
export function createInitialImageGalleryState(
	config: ImageGalleryConfig = {}
): ImageGalleryState {
	return {
		images: config.images ?? [],
		columns: config.columns ?? 3,
		gap: config.gap ?? 16,
		aspectRatio: config.aspectRatio ?? 'auto',
		lightbox: {
			isOpen: false,
			currentIndex: 0,
			presentation: { status: 'idle' },
			isImageLoading: false,
			imageLoadError: null
		},
		isNavigating: false,
		touch: {
			startX: 0,
			startY: 0,
			currentX: 0,
			currentY: 0,
			isDragging: false,
			swipeThreshold: config.swipeThreshold ?? 50
		},
		loadedImages: new Set<string>(),
		errors: {},
		prefersReducedMotion: false
	};
}

/**
 * Image Gallery reducer
 */
export const imageGalleryReducer: Reducer<
	ImageGalleryState,
	ImageGalleryAction,
	ImageGalleryDependencies
> = (state, action, deps) => {
	switch (action.type) {
		// Grid actions
		case 'imageClicked': {
			// Validate index
			if (action.index < 0 || action.index >= state.images.length) {
				return [state, EffectBuilder.none()];
			}

			const clickedImage = state.images[action.index]!; // Safe: validated above

			// Call callback if provided
			if (deps.onImageClick) {
				deps.onImageClick(clickedImage, action.index);
			}

			// Open lightbox at clicked image index
			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						isOpen: true,
						currentIndex: action.index,
						isImageLoading: true,
						imageLoadError: null,
						presentation: state.prefersReducedMotion
							? { status: 'presented', content: action.index }
							: {
									status: 'presenting',
									content: action.index,
									duration: 0.3
								}
					}
				},
				state.prefersReducedMotion
					? EffectBuilder.none()
					: EffectBuilder.afterDelay(300, (dispatch) =>
							dispatch({
								type: 'presentation',
								event: { type: 'presentationCompleted' }
							})
						)
			];
		}

		case 'imageLoaded': {
			if (deps.onImageLoad) {
				deps.onImageLoad(action.imageId);
			}

			return [
				{
					...state,
					loadedImages: new Set([...state.loadedImages, action.imageId])
				},
				EffectBuilder.none()
			];
		}

		case 'imageError': {
			if (deps.onImageError) {
				deps.onImageError(action.imageId, action.error);
			}

			return [
				{
					...state,
					errors: {
						...state.errors,
						[action.imageId]: action.error
					}
				},
				EffectBuilder.none()
			];
		}

		// Lightbox actions
		case 'openLightbox': {
			// Validate index
			if (action.index < 0 || action.index >= state.images.length) {
				return [state, EffectBuilder.none()];
			}

			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						isOpen: true,
						currentIndex: action.index,
						isImageLoading: true,
						imageLoadError: null,
						presentation: state.prefersReducedMotion
							? { status: 'presented', content: action.index }
							: {
									status: 'presenting',
									content: action.index,
									duration: 0.3
								}
					}
				},
				state.prefersReducedMotion
					? EffectBuilder.none()
					: EffectBuilder.afterDelay(300, (dispatch) =>
							dispatch({
								type: 'presentation',
								event: { type: 'presentationCompleted' }
							})
						)
			];
		}

		case 'closeLightbox': {
			// Guard: can only close if presented
			if (state.lightbox.presentation.status !== 'presented') {
				return [state, EffectBuilder.none()];
			}

			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						presentation: state.prefersReducedMotion
							? { status: 'idle' }
							: {
									status: 'dismissing',
									content: state.lightbox.currentIndex,
									duration: 0.3
								}
					}
				},
				state.prefersReducedMotion
					? EffectBuilder.run((dispatch) =>
							dispatch({
								type: 'presentation',
								event: { type: 'dismissalCompleted' }
							})
						)
					: EffectBuilder.afterDelay(300, (dispatch) =>
							dispatch({
								type: 'presentation',
								event: { type: 'dismissalCompleted' }
							})
						)
			];
		}

		case 'nextImage': {
			// Guard: already navigating
			if (state.isNavigating) {
				return [state, EffectBuilder.none()];
			}

			const nextIndex = state.lightbox.currentIndex + 1;
			if (nextIndex >= state.images.length) {
				// Don't go past last image
				return [state, EffectBuilder.none()];
			}

			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						currentIndex: nextIndex,
						isImageLoading: true,
						imageLoadError: null
					},
					isNavigating: true // Lock navigation
				},
				EffectBuilder.afterDelay(300, (dispatch) => dispatch({ type: 'navigationCompleted' }))
			];
		}

		case 'previousImage': {
			// Guard: already navigating
			if (state.isNavigating) {
				return [state, EffectBuilder.none()];
			}

			const prevIndex = state.lightbox.currentIndex - 1;
			if (prevIndex < 0) {
				// Don't go before first image
				return [state, EffectBuilder.none()];
			}

			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						currentIndex: prevIndex,
						isImageLoading: true,
						imageLoadError: null
					},
					isNavigating: true // Lock navigation
				},
				EffectBuilder.afterDelay(300, (dispatch) => dispatch({ type: 'navigationCompleted' }))
			];
		}

		case 'goToImage': {
			// Guard: already navigating
			if (state.isNavigating) {
				return [state, EffectBuilder.none()];
			}

			// Validate index
			if (action.index < 0 || action.index >= state.images.length) {
				return [state, EffectBuilder.none()];
			}

			// Don't navigate if already at target
			if (action.index === state.lightbox.currentIndex) {
				return [state, EffectBuilder.none()];
			}

			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						currentIndex: action.index,
						isImageLoading: true,
						imageLoadError: null
					},
					isNavigating: true
				},
				EffectBuilder.afterDelay(300, (dispatch) => dispatch({ type: 'navigationCompleted' }))
			];
		}

		case 'navigationCompleted':
			return [{ ...state, isNavigating: false }, EffectBuilder.none()];

		// Lightbox image loading
		case 'lightboxImageLoading':
			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						isImageLoading: true,
						imageLoadError: null
					}
				},
				EffectBuilder.none()
			];

		case 'lightboxImageLoaded':
			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						isImageLoading: false,
						imageLoadError: null
					}
				},
				EffectBuilder.none()
			];

		case 'lightboxImageError':
			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						isImageLoading: false,
						imageLoadError: action.error
					}
				},
				EffectBuilder.none()
			];

		case 'retryLoadImage':
			return [
				{
					...state,
					lightbox: {
						...state.lightbox,
						isImageLoading: true,
						imageLoadError: null
					}
				},
				EffectBuilder.none()
			];

		// Touch gesture handling
		case 'touchStart':
			return [
				{
					...state,
					touch: {
						...state.touch,
						startX: action.x,
						startY: action.y,
						currentX: action.x,
						currentY: action.y,
						isDragging: true
					}
				},
				EffectBuilder.none()
			];

		case 'touchMove':
			if (!state.touch.isDragging) return [state, EffectBuilder.none()];

			return [
				{
					...state,
					touch: {
						...state.touch,
						currentX: action.x,
						currentY: action.y
					}
				},
				EffectBuilder.none()
			];

		case 'touchEnd': {
			if (!state.touch.isDragging) return [state, EffectBuilder.none()];

			const deltaX = state.touch.currentX - state.touch.startX;
			const absDelta = Math.abs(deltaX);

			// Reset touch state
			const newState: ImageGalleryState = {
				...state,
				touch: {
					startX: 0,
					startY: 0,
					currentX: 0,
					currentY: 0,
					isDragging: false,
					swipeThreshold: state.touch.swipeThreshold
				}
			};

			// Swipe threshold met?
			if (absDelta > state.touch.swipeThreshold) {
				if (deltaX > 0) {
					// Swiped right -> previous image
					return imageGalleryReducer(newState, { type: 'previousImage' }, deps);
				} else {
					// Swiped left -> next image
					return imageGalleryReducer(newState, { type: 'nextImage' }, deps);
				}
			}

			return [newState, EffectBuilder.none()];
		}

		// Animation lifecycle (PresentationState)
		case 'presentation':
			switch (action.event.type) {
				case 'presentationCompleted': {
					// Lightbox is now fully open, preload adjacent images
					const effects: Array<Effect<ImageGalleryAction>> = [];

					// Preload next image
					if (state.lightbox.currentIndex < state.images.length - 1) {
						const nextImage = state.images[state.lightbox.currentIndex + 1]!; // Safe: validated bounds above
						effects.push(
							EffectBuilder.run(async (dispatch) => {
								try {
									await (deps.preloadImage || defaultPreloadImage)(nextImage.url);
								} catch (e) {
									// Silently fail - preloading is not critical
								}
							})
						);
					}

					// Preload previous image
					if (state.lightbox.currentIndex > 0) {
						const prevImage = state.images[state.lightbox.currentIndex - 1]!; // Safe: validated bounds above
						effects.push(
							EffectBuilder.run(async (dispatch) => {
								try {
									await (deps.preloadImage || defaultPreloadImage)(prevImage.url);
								} catch (e) {
									// Silently fail
								}
							})
						);
					}

					return [
						{
							...state,
							lightbox: {
								...state.lightbox,
								presentation: {
									status: 'presented',
									content: state.lightbox.currentIndex
								}
							}
						},
						effects.length > 0 ? EffectBuilder.batch(...effects) : EffectBuilder.none()
					];
				}

				case 'dismissalCompleted':
					return [
						{
							...state,
							lightbox: {
								isOpen: false,
								currentIndex: 0,
								presentation: { status: 'idle' },
								isImageLoading: false,
								imageLoadError: null
							}
						},
						EffectBuilder.none()
					];

				default:
					return [state, EffectBuilder.none()];
			}

		// Configuration
		case 'columnsChanged': {
			const columns = Math.max(1, Math.min(4, action.columns));
			return [{ ...state, columns }, EffectBuilder.none()];
		}

		case 'imagesUpdated':
			return [
				{
					...state,
					images: action.images,
					// Reset lightbox if current index is out of bounds
					lightbox:
						state.lightbox.currentIndex >= action.images.length
							? {
									...state.lightbox,
									currentIndex: 0
								}
							: state.lightbox
				},
				EffectBuilder.none()
			];

		case 'motionPreferenceChanged':
			return [{ ...state, prefersReducedMotion: action.prefersReduced }, EffectBuilder.none()];

		default:
			return [state, EffectBuilder.none()];
	}
};
