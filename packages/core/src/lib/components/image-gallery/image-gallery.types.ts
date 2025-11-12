/**
 * Image Gallery Types
 *
 * Type definitions for the Image Gallery component system.
 * Supports grid display, lightbox modal, touch gestures, and animations.
 */

import type { PresentationState } from '../../navigation/types.js';

/**
 * Individual image in the gallery
 */
export interface GalleryImage {
	/** Unique identifier for the image */
	id: string;
	/** Full-size image URL */
	url: string;
	/** Optional optimized thumbnail URL for grid display */
	thumbnailUrl?: string;
	/** Responsive image srcset */
	srcset?: string;
	/** Sizes attribute for responsive images */
	sizes?: string;
	/** Alt text for accessibility */
	alt: string;
	/** Optional caption displayed in lightbox */
	caption?: string;
	/** Original width (for aspect ratio) */
	width?: number;
	/** Original height (for aspect ratio) */
	height?: number;
}

/**
 * Touch gesture tracking state
 */
export interface TouchState {
	/** Starting X coordinate */
	startX: number;
	/** Starting Y coordinate */
	startY: number;
	/** Current X coordinate */
	currentX: number;
	/** Current Y coordinate */
	currentY: number;
	/** Whether user is currently dragging */
	isDragging: boolean;
	/** Pixels needed to trigger navigation (default: 50) */
	swipeThreshold: number;
}

/**
 * Lightbox modal state
 */
export interface LightboxState {
	/** Whether lightbox is open */
	isOpen: boolean;
	/** Index of currently displayed image */
	currentIndex: number;
	/** Animation lifecycle state */
	presentation: PresentationState<number>;
	/** Whether current image is loading */
	isImageLoading: boolean;
	/** Error message if image failed to load */
	imageLoadError: string | null;
}

/**
 * Complete Image Gallery state
 */
export interface ImageGalleryState {
	// Images data
	images: GalleryImage[];

	// Grid configuration
	/** Number of columns (1-4, responsive) */
	columns: number;
	/** Space between images in pixels */
	gap: number;
	/** Aspect ratio for thumbnails */
	aspectRatio: 'auto' | 'square' | '16:9' | '4:3';

	// Lightbox state
	lightbox: LightboxState;

	// Navigation lock (prevent rapid clicking)
	isNavigating: boolean;

	// Touch gesture state
	touch: TouchState;

	// Loading state
	/** Track which image URLs have loaded */
	loadedImages: Set<string>;

	// Error state
	/** Map of imageId -> error message */
	errors: Record<string, string>;

	// Accessibility
	/** Whether user prefers reduced motion */
	prefersReducedMotion: boolean;
}

/**
 * Presentation events for animation lifecycle
 */
export type PresentationEvent =
	| { type: 'presentationCompleted' }
	| { type: 'dismissalCompleted' };

/**
 * Image Gallery actions
 */
export type ImageGalleryAction =
	// Grid actions
	| { type: 'imageClicked'; index: number }
	| { type: 'imageLoaded'; imageId: string }
	| { type: 'imageError'; imageId: string; error: string }

	// Lightbox actions
	| { type: 'openLightbox'; index: number }
	| { type: 'closeLightbox' }
	| { type: 'nextImage' }
	| { type: 'previousImage' }
	| { type: 'goToImage'; index: number }

	// Lightbox image loading
	| { type: 'lightboxImageLoading' }
	| { type: 'lightboxImageLoaded' }
	| { type: 'lightboxImageError'; error: string }
	| { type: 'retryLoadImage' }

	// Navigation lock
	| { type: 'navigationCompleted' }

	// Touch gestures
	| { type: 'touchStart'; x: number; y: number }
	| { type: 'touchMove'; x: number; y: number }
	| { type: 'touchEnd' }

	// Animation lifecycle (PresentationState)
	| { type: 'presentation'; event: PresentationEvent }

	// Configuration
	| { type: 'columnsChanged'; columns: number }
	| { type: 'imagesUpdated'; images: GalleryImage[] }
	| { type: 'motionPreferenceChanged'; prefersReduced: boolean };

/**
 * Dependencies for Image Gallery
 */
export interface ImageGalleryDependencies {
	/**
	 * Preload an image (for adjacent images)
	 * @default Built-in Image() preloader
	 */
	preloadImage?: (url: string) => Promise<void>;

	/**
	 * Callbacks for grid events
	 */
	onImageClick?: (image: GalleryImage, index: number) => void;
	onImageLoad?: (imageId: string) => void;
	onImageError?: (imageId: string, error: string) => void;
}

/**
 * Initial state configuration options
 */
export interface ImageGalleryConfig {
	images?: GalleryImage[];
	columns?: number;
	gap?: number;
	aspectRatio?: 'auto' | 'square' | '16:9' | '4:3';
	swipeThreshold?: number;
}
