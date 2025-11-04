/**
 * Carousel Component Types
 *
 * Type definitions for a carousel/slider component that displays content in a sliding view
 * with pagination, navigation controls, and auto-play functionality.
 */
/**
 * Create the initial state for a carousel
 */
export function createInitialCarouselState(slides = [], initialIndex = 0, loop = true, autoPlayInterval = 0) {
    return {
        slides,
        currentIndex: Math.max(0, Math.min(initialIndex, slides.length - 1)),
        isAutoPlaying: false,
        isTransitioning: false,
        loop,
        autoPlayInterval
    };
}
