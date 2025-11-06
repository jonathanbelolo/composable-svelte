/**
 * Image Gallery Reducer
 *
 * Pure reducer for Image Gallery state management.
 * Handles grid interactions, lightbox navigation, touch gestures, and animations.
 */

import type { Reducer } from '../../types.js';
import { Effect } from '../../effect.js';
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
				return [state, Effect.none()];
			}

			// Call callback if provided
			if (deps.onImageClick) {
				deps.onImageClick(state.images[action.index], action.index);
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
					? Effect.none()
					: Effect.afterDelay(300, (dispatch) =>
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
				Effect.none()
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
				Effect.none()
			];
		}

		// Lightbox actions
		case 'openLightbox': {
			// Validate index
			if (action.index < 0 || action.index >= state.images.length) {
				return [state, Effect.none()];
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
					? Effect.none()
					: Effect.afterDelay(300, (dispatch) =>
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
				return [state, Effect.none()];
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
					? Effect.run((dispatch) =>
							dispatch({
								type: 'presentation',
								event: { type: 'dismissalCompleted' }
							})
						)
					: Effect.afterDelay(300, (dispatch) =>
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
				return [state, Effect.none()];
			}

			const nextIndex = state.lightbox.currentIndex + 1;
			if (nextIndex >= state.images.length) {
				// Don't go past last image
				return [state, Effect.none()];
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
				Effect.afterDelay(300, (dispatch) => dispatch({ type: 'navigationCompleted' }))
			];
		}

		case 'previousImage': {
			// Guard: already navigating
			if (state.isNavigating) {
				return [state, Effect.none()];
			}

			const prevIndex = state.lightbox.currentIndex - 1;
			if (prevIndex < 0) {
				// Don't go before first image
				return [state, Effect.none()];
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
				Effect.afterDelay(300, (dispatch) => dispatch({ type: 'navigationCompleted' }))
			];
		}

		case 'goToImage': {
			// Guard: already navigating
			if (state.isNavigating) {
				return [state, Effect.none()];
			}

			// Validate index
			if (action.index < 0 || action.index >= state.images.length) {
				return [state, Effect.none()];
			}

			// Don't navigate if already at target
			if (action.index === state.lightbox.currentIndex) {
				return [state, Effect.none()];
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
				Effect.afterDelay(300, (dispatch) => dispatch({ type: 'navigationCompleted' }))
			];
		}

		case 'navigationCompleted':
			return [{ ...state, isNavigating: false }, Effect.none()];

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
				Effect.none()
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
				Effect.none()
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
				Effect.none()
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
				Effect.none()
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
				Effect.none()
			];

		case 'touchMove':
			if (!state.touch.isDragging) return [state, Effect.none()];

			return [
				{
					...state,
					touch: {
						...state.touch,
						currentX: action.x,
						currentY: action.y
					}
				},
				Effect.none()
			];

		case 'touchEnd': {
			if (!state.touch.isDragging) return [state, Effect.none()];

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

			return [newState, Effect.none()];
		}

		// Animation lifecycle (PresentationState)
		case 'presentation':
			switch (action.event.type) {
				case 'presentationCompleted': {
					// Lightbox is now fully open, preload adjacent images
					const effects: Array<Effect<ImageGalleryAction>> = [];

					// Preload next image
					if (state.lightbox.currentIndex < state.images.length - 1) {
						const nextImage = state.images[state.lightbox.currentIndex + 1];
						effects.push(
							Effect.run(async (dispatch) => {
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
						const prevImage = state.images[state.lightbox.currentIndex - 1];
						effects.push(
							Effect.run(async (dispatch) => {
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
						effects.length > 0 ? Effect.batch(...effects) : Effect.none()
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
						Effect.none()
					];

				default:
					return [state, Effect.none()];
			}

		// Configuration
		case 'columnsChanged': {
			const columns = Math.max(1, Math.min(4, action.columns));
			return [{ ...state, columns }, Effect.none()];
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
				Effect.none()
			];

		case 'motionPreferenceChanged':
			return [{ ...state, prefersReducedMotion: action.prefersReduced }, Effect.none()];

		default:
			return [state, Effect.none()];
	}
};
