<script lang="ts" generics="T = unknown">
  import { createStore } from '../../../store.svelte.js';
  import { carouselReducer } from './carousel.reducer.js';
  import { createInitialCarouselState } from './carousel.types.js';
  import type { CarouselSlide } from './carousel.types.js';

  interface Props {
    slides: CarouselSlide<T>[];
    initialIndex?: number;
    loop?: boolean;
    autoPlayInterval?: number;
    showArrows?: boolean;
    showDots?: boolean;
    onSlideChange?: (index: number, slide: CarouselSlide<T>) => void;
    onAutoPlayStart?: () => void;
    onAutoPlayStop?: () => void;
    class?: string;
    slideClass?: string;
    transitionDuration?: number;
    children?: import('svelte').Snippet<[{ slide: CarouselSlide<T>; index: number }]>;
  }

  let {
    slides,
    initialIndex = 0,
    loop = true,
    autoPlayInterval = 0,
    showArrows = true,
    showDots = true,
    onSlideChange,
    onAutoPlayStart,
    onAutoPlayStop,
    class: className = '',
    slideClass = '',
    transitionDuration = 300,
    children
  }: Props = $props();

  // Create carousel store with reducer
  const store = createStore({
    initialState: createInitialCarouselState<T>(slides, initialIndex, loop, autoPlayInterval),
    reducer: carouselReducer<T>,
    dependencies: {
      onSlideChange,
      onAutoPlayStart,
      onAutoPlayStop
    }
  });

  // Sync external slides changes to store
  $effect(() => {
    if (slides !== store.state.slides) {
      store.dispatch({ type: 'slidesUpdated', slides });
    }
  });

  // Start auto-play if configured
  $effect(() => {
    if (autoPlayInterval > 0 && !store.state.isAutoPlaying) {
      store.dispatch({ type: 'autoPlayStarted' });
    }
  });

  // Handle transition completion
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (store.state.isTransitioning) {
      if (transitionTimeout) clearTimeout(transitionTimeout);
      transitionTimeout = setTimeout(() => {
        store.dispatch({ type: 'transitionCompleted' });
      }, transitionDuration);
    }
    return () => {
      if (transitionTimeout) clearTimeout(transitionTimeout);
    };
  });

  function handlePrevious() {
    // Stop auto-play when user manually navigates
    if (store.state.isAutoPlaying) {
      store.dispatch({ type: 'autoPlayStopped' });
    }
    store.dispatch({ type: 'previousSlide' });
  }

  function handleNext() {
    // Stop auto-play when user manually navigates
    if (store.state.isAutoPlaying) {
      store.dispatch({ type: 'autoPlayStopped' });
    }
    store.dispatch({ type: 'nextSlide' });
  }

  function handleDotClick(index: number) {
    // Stop auto-play when user manually navigates
    if (store.state.isAutoPlaying) {
      store.dispatch({ type: 'autoPlayStopped' });
    }
    store.dispatch({ type: 'goToSlide', index });
  }

  function handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        handlePrevious();
        break;
      case 'ArrowRight':
        event.preventDefault();
        handleNext();
        break;
    }
  }

  // Compute whether prev/next buttons should be disabled
  const canGoPrevious = $derived(
    loop || store.state.currentIndex > 0
  );

  const canGoNext = $derived(
    loop || store.state.currentIndex < store.state.slides.length - 1
  );

  const currentSlide = $derived(store.state.slides[store.state.currentIndex]);
</script>

<div
  class={`carousel-container relative overflow-hidden ${className}`}
  role="region"
  aria-roledescription="carousel"
  aria-label="Carousel"
  onkeydown={handleKeyDown}
  tabindex="0"
>
  <!-- Slides Container -->
  <div
    class="carousel-slides-wrapper relative w-full"
    style="height: 100%;"
  >
    <div
      class="carousel-slides flex transition-transform"
      style:transform={`translateX(-${store.state.currentIndex * 100}%)`}
      style:transition-duration={`${transitionDuration}ms`}
    >
      {#each store.state.slides as slide, index (slide.id)}
        <div
          class={`carousel-slide flex-shrink-0 w-full ${slideClass}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`Slide ${index + 1} of ${store.state.slides.length}`}
          aria-hidden={index !== store.state.currentIndex}
        >
          {#if children}
            {@render children({ slide, index })}
          {:else}
            <div class="flex items-center justify-center h-full bg-gray-100 text-gray-600">
              Slide {index + 1}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Previous Button -->
  {#if showArrows}
    <button
      class="carousel-prev absolute left-4 top-1/2 -translate-y-1/2 z-10
             bg-white/90 hover:bg-white rounded-full p-2 shadow-lg
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-all duration-200"
      onclick={handlePrevious}
      disabled={!canGoPrevious || store.state.isTransitioning}
      aria-label="Previous slide"
    >
      <svg
        class="w-6 h-6 text-gray-800"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </button>

    <!-- Next Button -->
    <button
      class="carousel-next absolute right-4 top-1/2 -translate-y-1/2 z-10
             bg-white/90 hover:bg-white rounded-full p-2 shadow-lg
             disabled:opacity-50 disabled:cursor-not-allowed
             transition-all duration-200"
      onclick={handleNext}
      disabled={!canGoNext || store.state.isTransitioning}
      aria-label="Next slide"
    >
      <svg
        class="w-6 h-6 text-gray-800"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5l7 7-7 7"
        />
      </svg>
    </button>
  {/if}

  <!-- Pagination Dots -->
  {#if showDots}
    <div
      class="carousel-dots absolute bottom-4 left-1/2 -translate-x-1/2 z-10
             flex gap-2 bg-white/90 px-3 py-2 rounded-full shadow-lg"
      role="tablist"
      aria-label="Slide navigation"
    >
      {#each store.state.slides as slide, index (slide.id)}
        <button
          class="carousel-dot w-2 h-2 rounded-full transition-all duration-200
                 {index === store.state.currentIndex ? 'bg-gray-800 w-6' : 'bg-gray-400 hover:bg-gray-600'}"
          onclick={() => handleDotClick(index)}
          disabled={store.state.isTransitioning}
          role="tab"
          aria-label={`Go to slide ${index + 1}`}
          aria-selected={index === store.state.currentIndex}
        />
      {/each}
    </div>
  {/if}

  <!-- Current Slide Indicator (for screen readers) -->
  <div class="sr-only" aria-live="polite" aria-atomic="true">
    Slide {store.state.currentIndex + 1} of {store.state.slides.length}
  </div>
</div>

<style>
  .carousel-container:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

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
</style>
