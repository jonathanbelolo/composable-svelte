/**
 * Carousel Component Types
 *
 * Type definitions for a carousel/slider component that displays content in a sliding view
 * with pagination, navigation controls, and auto-play functionality.
 */

/**
 * A single slide item in the carousel
 */
export interface CarouselSlide<T = unknown> {
  /** Unique identifier for the slide */
  id: string;
  /** Optional custom data associated with the slide */
  data?: T;
}

/**
 * Direction of carousel navigation
 */
export type CarouselDirection = 'forward' | 'backward';

/**
 * State for the Carousel component
 */
export interface CarouselState<T = unknown> {
  /** Array of slides */
  slides: CarouselSlide<T>[];
  /** Current active slide index (0-based) */
  currentIndex: number;
  /** Whether auto-play is enabled */
  isAutoPlaying: boolean;
  /** Whether the carousel is in a transitioning state */
  isTransitioning: boolean;
  /** Whether the carousel loops (wraps from last to first) */
  loop: boolean;
  /** Auto-play interval in milliseconds (0 = disabled) */
  autoPlayInterval: number;
}

/**
 * Actions for the Carousel reducer
 */
export type CarouselAction =
  | { type: 'nextSlide' }
  | { type: 'previousSlide' }
  | { type: 'goToSlide'; index: number }
  | { type: 'autoPlayStarted' }
  | { type: 'autoPlayStopped' }
  | { type: 'autoPlayTick' }
  | { type: 'transitionStarted' }
  | { type: 'transitionCompleted' }
  | { type: 'slidesUpdated'; slides: CarouselSlide<unknown>[] };

/**
 * Dependencies for the Carousel reducer
 */
export interface CarouselDependencies<T = unknown> {
  /** Callback when slide changes */
  onSlideChange?: (index: number, slide: CarouselSlide<T>) => void;
  /** Callback when auto-play starts */
  onAutoPlayStart?: () => void;
  /** Callback when auto-play stops */
  onAutoPlayStop?: () => void;
}

/**
 * Props for the Carousel component
 */
export interface CarouselProps<T = unknown> {
  /** Array of slides to display */
  slides: CarouselSlide<T>[];
  /** Initial slide index (default: 0) */
  initialIndex?: number;
  /** Whether to loop from last to first (default: true) */
  loop?: boolean;
  /** Auto-play interval in milliseconds (0 = disabled, default: 0) */
  autoPlayInterval?: number;
  /** Whether to show navigation arrows (default: true) */
  showArrows?: boolean;
  /** Whether to show pagination dots (default: true) */
  showDots?: boolean;
  /** Callback when slide changes */
  onSlideChange?: (index: number, slide: CarouselSlide<T>) => void;
  /** Callback when auto-play starts */
  onAutoPlayStart?: () => void;
  /** Callback when auto-play stops */
  onAutoPlayStop?: () => void;
  /** Custom class for the carousel container */
  class?: string;
  /** Custom class for individual slides */
  slideClass?: string;
  /** Transition duration in milliseconds (default: 300) */
  transitionDuration?: number;
}

/**
 * Create the initial state for a carousel
 */
export function createInitialCarouselState<T = unknown>(
  slides: CarouselSlide<T>[] = [],
  initialIndex = 0,
  loop = true,
  autoPlayInterval = 0
): CarouselState<T> {
  return {
    slides,
    currentIndex: Math.max(0, Math.min(initialIndex, slides.length - 1)),
    isAutoPlaying: false,
    isTransitioning: false,
    loop,
    autoPlayInterval
  };
}
