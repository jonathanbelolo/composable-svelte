# Phase 10: Image Gallery Component

**Status**: Ready for Implementation
**Package**: `@composable-svelte/core` (general-purpose, reusable)
**Created**: 2025-11-06
**Updated**: 2025-11-06 (Production-ready review applied)

## Overview

Create a production-ready, reusable image gallery component system with grid display, lightbox modal, and custom navigation. This component will be framework-agnostic (usable in chat, docs, product galleries, etc.) and will leverage existing Modal component and the animation system. **Note**: We implement custom navigation logic rather than using the Carousel component to avoid state synchronization complexity.

## Goals

1. **Reusable Grid Component** - Display images in responsive grid layouts
2. **Lightbox Modal** - Full-screen image viewing with custom navigation
3. **Touch Gesture Support** - Swipe navigation on mobile devices
4. **Animation Integration** - Smooth transitions using Motion One
5. **Markdown Integration** - Parse markdown image syntax for chat messages
6. **Composable Architecture** - Pure reducers, Effects, testable with TestStore
7. **Performance** - Lazy loading, image preloading, optimized rendering
8. **Accessibility** - Keyboard navigation, focus trapping, screen reader support, reduced motion

## Architecture

### Component Structure

```
packages/core/src/lib/components/image-gallery/
├── index.ts                      # Public exports
├── ImageGallery.svelte           # Main grid component (dual-mode API)
├── ImageLightbox.svelte          # Modal viewer with custom navigation
├── image-gallery.types.ts        # State, Action, Props types
├── image-gallery.reducer.ts      # Pure reducer
└── README.md                     # API documentation
```

### Component Hierarchy

```
ImageGallery (Grid View - Dual Mode Support)
  ├─ Simple Mode: Component creates internal store
  └─ Advanced Mode: User provides store
      └─ Thumbnails (clickable)
          └─ onClick -> dispatch('imageClicked', index)

ImageLightbox (Modal View)
  ├─ Modal (from navigation-components) ✓
  │   └─ PresentationState for animations
  ├─ Custom Navigation (NOT Carousel component)
  │   ├─ Image display with transitions
  │   ├─ Previous/Next buttons
  │   └─ Touch gesture handlers
  ├─ Keyboard handlers (←, →, Esc, Home, End, Tab trap)
  ├─ Body scroll lock
  └─ Image metadata
      ├─ Caption
      ├─ Counter (1 / 5)
      ├─ Loading skeleton
      └─ Error recovery
```

## State Management

### State Shape

```typescript
interface ImageGalleryState {
  // Images data
  images: GalleryImage[];

  // Grid configuration
  columns: number; // Responsive: 1 on mobile, 2-4 on desktop
  gap: number; // Space between images in px
  aspectRatio: 'auto' | 'square' | '16:9' | '4:3';

  // Lightbox state
  lightbox: {
    isOpen: boolean;
    currentIndex: number;
    // Animation lifecycle
    presentation: PresentationState<number>; // number = image index
    // Image loading state
    isImageLoading: boolean;
    imageLoadError: string | null;
  };

  // Navigation lock (prevent rapid clicking)
  isNavigating: boolean;

  // Touch gesture state
  touch: {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
    swipeThreshold: number; // pixels needed to trigger navigation (default: 50)
  };

  // Loading state
  loadedImages: Set<string>; // Track which image URLs have loaded

  // Error state
  errors: Record<string, string>; // imageId -> error message

  // Accessibility
  prefersReducedMotion: boolean;
}

interface GalleryImage {
  id: string;
  url: string;
  thumbnailUrl?: string; // Optional optimized thumbnail
  srcset?: string; // Responsive image srcset
  sizes?: string; // Sizes attribute for responsive images
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}
```

### Actions

```typescript
type ImageGalleryAction =
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
```

### Reducer Logic (Key Cases)

```typescript
export const imageGalleryReducer: Reducer<
  ImageGalleryState,
  ImageGalleryAction,
  ImageGalleryDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'imageClicked':
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

    case 'closeLightbox':
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
        Effect.afterDelay(300, (dispatch) =>
          dispatch({ type: 'navigationCompleted' })
        )
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
        Effect.afterDelay(300, (dispatch) =>
          dispatch({ type: 'navigationCompleted' })
        )
      ];
    }

    case 'navigationCompleted':
      return [{ ...state, isNavigating: false }, Effect.none()];

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
      const newState = {
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

    case 'presentation':
      switch (action.event.type) {
        case 'presentationCompleted': {
          // Lightbox is now fully open, preload adjacent images
          const effects: Effect<ImageGalleryAction>[] = [];

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

    case 'motionPreferenceChanged':
      return [{ ...state, prefersReducedMotion: action.prefersReduced }, Effect.none()];

    // ... other cases
  }
};

// Default preload implementation
const defaultPreloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
};
```

### Dependencies

```typescript
interface ImageGalleryDependencies {
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
```

## Component APIs

### Dual-Mode API Support

The ImageGallery component supports two usage modes:

#### Mode 1: Simple (Recommended for most cases)

Component creates and manages its own internal store:

```typescript
interface SimpleImageGalleryProps {
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
}
```

#### Mode 2: Advanced (For custom state management)

User provides their own store:

```typescript
interface AdvancedImageGalleryProps {
  // Required
  store: Store<ImageGalleryState, ImageGalleryAction>;

  // Styling
  class?: string;
  thumbnailClass?: string;

  // Note: images, columns, etc. come from store state
}
```

### ImageLightbox Props

```typescript
interface ImageLightboxProps {
  // Required
  store: Store<ImageGalleryState, ImageGalleryAction>;

  // Optional configuration
  showCaptions?: boolean; // Default: true
  showCounter?: boolean; // Default: true
  enableKeyboard?: boolean; // Default: true
  enableSwipe?: boolean; // Default: true (mobile)

  // Callbacks
  onClose?: () => void;
  onImageChange?: (index: number) => void;

  // Styling
  class?: string;
}
```

## Animation Integration

### Lightbox Open/Close with Reduced Motion

```typescript
// In ImageLightbox.svelte
$effect(() => {
  if (!lightboxElement) return;

  if ($store.lightbox.presentation.status === 'presenting') {
    if ($store.prefersReducedMotion) {
      // Skip animation
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    } else {
      // Animate in
      animateModalIn(lightboxElement, {
        duration: 300,
        scale: { from: 0.95, to: 1 },
        opacity: { from: 0, to: 1 }
      }).then(() => {
        store.dispatch({
          type: 'presentation',
          event: { type: 'presentationCompleted' }
        });
      });
    }
  }

  if ($store.lightbox.presentation.status === 'dismissing') {
    if ($store.prefersReducedMotion) {
      // Skip animation
      store.dispatch({
        type: 'presentation',
        event: { type: 'dismissalCompleted' }
      });
    } else {
      // Animate out
      animateModalOut(lightboxElement, {
        duration: 300,
        scale: { from: 1, to: 0.95 },
        opacity: { from: 1, to: 0 }
      }).then(() => {
        store.dispatch({
          type: 'presentation',
          event: { type: 'dismissalCompleted' }
        });
      });
    }
  }
});
```

### Image Transition

```typescript
// In ImageLightbox.svelte
let previousIndex = $state($store.lightbox.currentIndex);

$effect(() => {
  if (imageElement && previousIndex !== $store.lightbox.currentIndex) {
    if (!$store.prefersReducedMotion) {
      // Fade out -> swap image -> fade in
      animate(
        imageElement,
        { opacity: [1, 0, 1] },
        { duration: 0.3, easing: 'ease-in-out' }
      );
    }
    previousIndex = $store.lightbox.currentIndex;
  }
});
```

### Grid Stagger Animation

```typescript
// In ImageGallery.svelte
$effect(() => {
  if (gridElement && !$store.prefersReducedMotion) {
    const thumbnails = gridElement.querySelectorAll('.thumbnail');
    stagger(
      thumbnails,
      { opacity: [0, 1], y: [20, 0] },
      {
        delay: stagger(0.05), // 50ms between each
        duration: 0.4
      }
    );
  }
});
```

## Touch Gesture Implementation

```svelte
<!-- ImageLightbox.svelte -->
<div
  class="image-lightbox"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  role="dialog"
  aria-modal="true"
>
  <!-- content -->
</div>

<script>
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
  if (!enableSwipe || !$store.touch.isDragging) return;

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
</script>
```

## Focus Trap Implementation

```typescript
// In ImageLightbox.svelte
let lightboxElement: HTMLElement;
let previouslyFocusedElement: HTMLElement | null = null;

// Get all focusable elements in lightbox
function getFocusableElements(): HTMLElement[] {
  return Array.from(
    lightboxElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  );
}

function handleKeydown(event: KeyboardEvent) {
  if (!enableKeyboard) return;

  // Navigation keys
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
        index: $store.images.length - 1
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

$effect(() => {
  if ($store.lightbox.isOpen && $store.lightbox.presentation.status === 'presented') {
    // Save currently focused element
    previouslyFocusedElement = document.activeElement as HTMLElement;

    // Focus the first focusable element or the lightbox itself
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
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
```

## Body Scroll Prevention

```typescript
// In ImageLightbox.svelte
$effect(() => {
  if ($store.lightbox.isOpen && $store.lightbox.presentation.status === 'presented') {
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
```

## Reduced Motion Preference

```typescript
// In ImageGallery.svelte (or parent component)
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
```

## Lazy Loading with Proper Cleanup

```svelte
<!-- ImageGallery.svelte -->
<script>
let gridElement: HTMLElement;
let observer: IntersectionObserver | undefined;

// Use $effect instead of onMount to re-run when images change
$effect(() => {
  if (enableLazyLoad && gridElement && $store.images.length > 0) {
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
</script>

<div bind:this={gridElement} class="image-gallery">
  {#each $store.images as image, index (image.id)}
    <div class="image-gallery__thumbnail">
      <img
        data-id={image.id}
        data-src={enableLazyLoad ? image.thumbnailUrl || image.url : undefined}
        src={enableLazyLoad ? 'data:image/svg+xml,...' : image.thumbnailUrl || image.url}
        alt={image.alt}
        onclick={() => store.dispatch({ type: 'imageClicked', index })}
      />
    </div>
  {/each}
</div>
```

## Error Recovery in Lightbox

```svelte
<!-- ImageLightbox.svelte -->
<div class="image-lightbox__content">
  {#if $store.lightbox.isImageLoading}
    <div class="image-skeleton" />
  {/if}

  {#if $store.lightbox.imageLoadError}
    <div class="image-error">
      <p>{$store.lightbox.imageLoadError}</p>
      <button onclick={() => store.dispatch({ type: 'retryLoadImage' })}>
        Retry
      </button>
    </div>
  {:else}
    <img
      bind:this={imageElement}
      class:opacity-0={$store.lightbox.isImageLoading}
      src={currentImage.url}
      srcset={currentImage.srcset}
      sizes={currentImage.sizes}
      alt={currentImage.alt}
      onerror={() =>
        store.dispatch({
          type: 'lightboxImageError',
          error: 'Failed to load image'
        })}
      onload={() => store.dispatch({ type: 'lightboxImageLoaded' })}
    />
  {/if}
</div>
```

## Usage Examples

### Simple Mode (Recommended)

```svelte
<script>
import { ImageGallery } from '@composable-svelte/core/components/image-gallery';

const images = [
  {
    id: '1',
    url: 'https://example.com/photo1.jpg',
    alt: 'Mountain landscape',
    caption: 'Beautiful mountain view'
  },
  {
    id: '2',
    url: 'https://example.com/photo2.jpg',
    alt: 'Ocean sunset'
  }
];
</script>

<ImageGallery {images} columns={3} />
<!-- Lightbox is automatically included when enableLightbox={true} -->
```

### Advanced Mode (Custom Store)

```svelte
<script>
import { createStore } from '@composable-svelte/core';
import {
  ImageGallery,
  ImageLightbox,
  imageGalleryReducer,
  createInitialImageGalleryState
} from '@composable-svelte/core/components/image-gallery';

const store = createStore({
  initialState: createInitialImageGalleryState({
    images: [...],
    columns: 3
  }),
  reducer: imageGalleryReducer,
  dependencies: {}
});
</script>

<ImageGallery {store} />
<!-- Manually render lightbox for full control -->
{#if $store.lightbox.isOpen}
  <ImageLightbox {store} showCaptions showCounter />
{/if}
```

### In Chat Messages (Markdown Integration)

```svelte
<!-- ChatMessage.svelte -->
<script>
import { ImageGallery } from '@composable-svelte/core/components/image-gallery';
import { extractImagesFromMarkdown } from './markdown-utils';

const images = $derived(() => {
  if (message.role === 'assistant') {
    return extractImagesFromMarkdown(message.content);
  }
  return [];
});
</script>

<div class="chat-message__content">
  {#if message.role === 'assistant'}
    {@html renderedContent()}

    {#if images().length > 0}
      <ImageGallery images={images()} columns={2} />
    {/if}
  {/if}
</div>
```

## Implementation Phases (Revised)

### Phase 1: Core Components (Day 1)
- [ ] Create directory structure
- [ ] Define types (with touch state, navigation lock, motion preference)
- [ ] Implement reducer with guards and debouncing
- [ ] Create ImageGallery with dual-mode API
- [ ] Basic styling (responsive grid)
- [ ] Unit tests for reducer

### Phase 2: Lightbox with Custom Navigation (Day 1-2)
- [ ] Create ImageLightbox component (no Carousel)
- [ ] Integrate with Modal component
- [ ] Add navigation buttons with debounce
- [ ] Implement keyboard controls
- [ ] Add close functionality
- [ ] Error handling for image loads

### Phase 3: Mobile & Touch Support (Day 2)
- [ ] Implement touch gesture handlers
- [ ] Add swipe detection (threshold-based)
- [ ] Prevent body scroll when lightbox open
- [ ] Test on mobile devices
- [ ] Touch gesture tests

### Phase 4: Animation Integration (Day 2-3)
- [ ] Add PresentationState lifecycle
- [ ] Implement modal open/close animations
- [ ] Add image transition animations
- [ ] Respect reduced motion preference
- [ ] Grid stagger animation

### Phase 5: Accessibility & Performance (Day 3)
- [ ] Implement focus trap (Tab cycling)
- [ ] Add ARIA labels and roles
- [ ] Lazy loading with proper cleanup
- [ ] Image preloading (adjacent images)
- [ ] Loading skeletons
- [ ] Accessibility tests

### Phase 6: Markdown Integration (Day 3-4)
- [ ] Create markdown image parser
- [ ] Update markdown renderer
- [ ] Integrate with ChatMessage
- [ ] Handle streaming markdown with images
- [ ] Test with mock responses

### Phase 7: Documentation & Demo (Day 4)
- [ ] Write README with examples
- [ ] Document dual-mode API
- [ ] Create styleguide demo
- [ ] Add usage examples
- [ ] Performance guidelines

### Phase 8: Testing & Polish (Day 4-5)
- [ ] Comprehensive test coverage (touch, focus trap, errors)
- [ ] Browser compatibility testing
- [ ] Mobile testing (iOS/Android)
- [ ] Accessibility audit (screen reader testing)
- [ ] Performance profiling

## Testing Strategy

### Unit Tests

```typescript
describe('imageGalleryReducer', () => {
  it('debounces rapid navigation', () => {
    const state = {
      ...createInitialImageGalleryState({ images: [{}, {}, {}] }),
      lightbox: { isOpen: true, currentIndex: 0, presentation: { status: 'presented' } }
    };

    // First navigation
    const [state1] = imageGalleryReducer(state, { type: 'nextImage' }, {});
    expect(state1.isNavigating).toBe(true);

    // Second navigation (should be blocked)
    const [state2] = imageGalleryReducer(state1, { type: 'nextImage' }, {});
    expect(state2).toBe(state1); // No change
  });

  it('handles swipe gestures', async () => {
    const store = createTestStore({
      initialState: createInitialImageGalleryState({ images: [{}, {}, {}] }),
      reducer: imageGalleryReducer
    });

    await store.send({ type: 'touchStart', x: 100, y: 0 });
    await store.send({ type: 'touchMove', x: 50, y: 0 });
    await store.send({ type: 'touchEnd' });

    // Should navigate to next image
    expect(store.state.lightbox.currentIndex).toBe(1);
  });

  it('respects reduced motion preference', () => {
    const state = {
      ...createInitialImageGalleryState({}),
      prefersReducedMotion: true
    };

    const [newState] = imageGalleryReducer(
      state,
      { type: 'imageClicked', index: 0 },
      {}
    );

    // Should skip to 'presented' immediately
    expect(newState.lightbox.presentation.status).toBe('presented');
  });
});
```

## Dependencies

### Required
- `@composable-svelte/core` (Store, Reducer, Effect system)
- `motion` (Motion One for animations)
- Existing Modal component
- Existing animation helpers

### NOT Used
- ~~Existing Carousel component~~ (we implement custom navigation)

### Optional
- Image optimization service (Cloudinary, imgix)
- Thumbnail generation service

## Success Criteria

1. ✅ **Reusable** - Works in chat, docs, product galleries
2. ✅ **Performant** - Lazy loading, preloading, optimized rendering
3. ✅ **Accessible** - Keyboard nav, focus trap, screen readers, reduced motion
4. ✅ **Animated** - Smooth transitions via Motion One
5. ✅ **Mobile-First** - Touch gestures, swipe navigation, body scroll lock
6. ✅ **Testable** - Full coverage including touch, focus, errors
7. ✅ **Documented** - Clear API docs, examples, dual-mode explanation
8. ✅ **Responsive** - Works on mobile, tablet, desktop
9. ✅ **Production-Ready** - Error recovery, navigation debounce, proper cleanup

## Future Enhancements

### Phase 9: Advanced Features (Future)
- [ ] Deep linking (URL parameters for specific images)
- [ ] Zoom controls - Pinch to zoom, pan around image
- [ ] Virtual scrolling - For 100+ image galleries
- [ ] Grid layouts - Masonry, justified, packed
- [ ] Image filters - Search, sort, filter by metadata
- [ ] Thumbnails in lightbox - Row of thumbnails below main image
- [ ] Fullscreen API - True fullscreen mode
- [ ] Download button - Save image locally
- [ ] Share button - Share via Web Share API
- [ ] Image comparison - Before/after slider
- [ ] 360° viewer - For product photos

### Phase 10: Video Support (Future)
- [ ] Extend to support video thumbnails
- [ ] Video player in lightbox
- [ ] Video controls (play/pause, seek, volume)
- [ ] Auto-play configuration
- [ ] YouTube/Vimeo embed support

## Notes

- **Architecture Decision**: We implement custom navigation instead of using the Carousel component to avoid state synchronization complexity between two reducers.
- **Dual-Mode API**: Component can create its own internal store (simple mode) or accept an external store (advanced mode).
- **Touch Gestures**: Full swipe support with configurable threshold.
- **Focus Management**: Proper focus trapping with Tab key cycling.
- **Body Scroll**: Locked when lightbox open, with scrollbar width compensation.
- **Reduced Motion**: Respects user's motion preferences.
- **Error Recovery**: Graceful handling of failed image loads with retry mechanism.
- **Navigation Debounce**: Prevents rapid clicking/swiping from causing state conflicts.
- **Image Preloading**: Adjacent images loaded after lightbox opens for smooth navigation.
- **Memory Management**: Proper cleanup of IntersectionObserver when images change.
- **Production-Ready**: All edge cases handled, comprehensive test coverage.
