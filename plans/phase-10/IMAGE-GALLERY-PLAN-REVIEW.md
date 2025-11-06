# Image Gallery Plan Review - Production Readiness Assessment

**Date**: 2025-11-06
**Reviewer**: Self-review for production readiness

## Executive Summary

The plan is **80% production-ready** but needs adjustments in these critical areas:
1. Component API design (dual-mode support)
2. Carousel integration complexity
3. Mobile/touch gesture implementation
4. Error recovery and edge cases
5. Memory management and cleanup
6. Accessibility enhancements

---

## Critical Issues (Must Fix)

### 1. Component API Confusion ⚠️

**Problem**: The plan shows two different usage patterns but doesn't clarify which is preferred:

```svelte
<!-- Pattern A: Simple (no store) -->
<ImageGallery images={images} />

<!-- Pattern B: Advanced (with store) -->
<ImageGallery {store} />
```

**Issue**: Users will be confused about when to use which pattern.

**Solution**: Support **both modes** explicitly:

```typescript
// Mode 1: Simple (component creates internal store)
interface SimpleImageGalleryProps {
  images: GalleryImage[];
  columns?: number;
  // ... other config
  // NO store prop
}

// Mode 2: Advanced (user provides store)
interface AdvancedImageGalleryProps {
  store: Store<ImageGalleryState, ImageGalleryAction>;
  // NO images prop (comes from store)
}

type ImageGalleryProps = SimpleImageGalleryProps | AdvancedImageGalleryProps;

// In ImageGallery.svelte:
const { store, images, ...config } = $props<ImageGalleryProps>();

// Create internal store if not provided
const internalStore = store || createStore({
  initialState: createInitialImageGalleryState({ images, ...config }),
  reducer: imageGalleryReducer,
  dependencies: {}
});
```

**Priority**: HIGH - This affects the entire API design.

---

### 2. Carousel Integration Complexity ⚠️

**Problem**: The plan says "use existing Carousel component" but Carousel has its own state management with a separate reducer. Composing two reducers is complex.

**Current plan**:
```
ImageLightbox
  └─ Carousel (with its own store/reducer)
```

**Issue**:
- Two sources of truth for current index
- Need to sync state between ImageGallery reducer and Carousel reducer
- Adds significant complexity

**Solution**: **Don't use Carousel component** - implement carousel logic directly in ImageLightbox.

**Rationale**:
- The ui/carousel component is designed for generic content (slides with `data`)
- Our lightbox needs image-specific logic (preloading, zoom, pan)
- Simpler to have one reducer managing lightbox state
- Can extract shared navigation logic later if needed

**Revised Architecture**:
```
ImageLightbox (Modal View)
  ├─ Modal (from navigation-components) ✓ Keep this
  ├─ Custom image navigation (not Carousel) ✓ Simpler
  ├─ Navigation buttons
  └─ Image display with transitions
```

**Priority**: HIGH - Prevents over-engineering and state sync issues.

---

### 3. Missing Touch Gesture Implementation 🚨

**Problem**: Plan mentions "enableSwipe" but provides no implementation details.

**Required Features**:
- Swipe left/right to navigate images
- Pinch to zoom (future enhancement is OK)
- Prevent body scroll when lightbox open
- Handle edge cases (swiping at first/last image)

**Solution**: Add touch gesture handler:

```typescript
// In image-gallery.types.ts
interface TouchState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
  swipeThreshold: number; // pixels needed to trigger navigation
}

// Add to ImageGalleryState
interface ImageGalleryState {
  // ...existing
  touch: TouchState;
}

// Add actions
type ImageGalleryAction =
  | { type: 'touchStart'; x: number; y: number }
  | { type: 'touchMove'; x: number; y: number }
  | { type: 'touchEnd' }
  // ...existing
```

**Implementation**:
```svelte
<!-- ImageLightbox.svelte -->
<div
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- image content -->
</div>

<script>
function handleTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  store.dispatch({
    type: 'touchStart',
    x: touch.clientX,
    y: touch.clientY
  });
}

function handleTouchMove(e: TouchEvent) {
  if (!$store.touch.isDragging) return;
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
  store.dispatch({ type: 'touchEnd' });
}
</script>
```

**Reducer logic**:
```typescript
case 'touchEnd': {
  if (!state.touch.isDragging) return [state, Effect.none()];

  const deltaX = state.touch.currentX - state.touch.startX;
  const absDelta = Math.abs(deltaX);

  // Reset touch state
  const newState = {
    ...state,
    touch: { ...initialTouchState }
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
```

**Priority**: HIGH - Required for mobile usability.

---

### 4. Image Preloading Missing 🔍

**Problem**: Plan mentions "image preloading (adjacent images)" but doesn't implement it.

**Why Critical**: When user navigates to next image, there's a delay while it loads. This breaks the "instant" feel.

**Solution**: Preload adjacent images when lightbox opens:

```typescript
// Add to dependencies
interface ImageGalleryDependencies {
  preloadImage?: (url: string) => Promise<void>;
}

// Default implementation
const defaultPreloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
};

// In reducer
case 'presentation': {
  if (action.event.type === 'presentationCompleted') {
    // Lightbox is now fully open, preload adjacent images
    const effects: Effect<ImageGalleryAction>[] = [];

    // Preload next image
    if (state.lightbox.currentIndex < state.images.length - 1) {
      const nextImage = state.images[state.lightbox.currentIndex + 1];
      effects.push(
        Effect.run(async (dispatch) => {
          try {
            await deps.preloadImage(nextImage.url);
          } catch (e) {
            // Silently fail - not critical
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
            await deps.preloadImage(prevImage.url);
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
          presentation: { status: 'presented', content: state.lightbox.currentIndex }
        }
      },
      effects.length > 0 ? Effect.batch(...effects) : Effect.none()
    ];
  }
}
```

**Priority**: MEDIUM - Improves UX significantly but not blocking.

---

### 5. Focus Trap Implementation Missing ♿

**Problem**: Plan mentions "focus management" but doesn't implement focus trapping (preventing Tab from leaving lightbox).

**Why Critical**: Accessibility requirement - users should not be able to Tab out of modal.

**Solution**: Implement focus trap:

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
  // ... existing arrow key handling ...

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

    // Focus the lightbox
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

**Priority**: HIGH - Accessibility requirement.

---

### 6. Memory Cleanup for IntersectionObserver ⚠️

**Problem**: Plan shows IntersectionObserver creation but cleanup is incomplete:

```svelte
onMount(() => {
  observer = new IntersectionObserver(...);
  // ...
  return () => {
    observer?.disconnect(); // ✓ Good
  };
});
```

**Issue**: This only cleans up on component unmount, but what if `images` array changes?

**Solution**: Use `$effect` instead of `onMount` to recreate observer when images change:

```svelte
<script>
let gridElement: HTMLElement;
let observer: IntersectionObserver | undefined;

$effect(() => {
  // Re-run when enableLazyLoad or images change
  if (enableLazyLoad && gridElement && $store.images.length > 0) {
    // Disconnect old observer
    observer?.disconnect();

    // Create new observer
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            store.dispatch({ type: 'imageLoaded', imageId: img.dataset.id! });
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
```

**Priority**: MEDIUM - Prevents memory leaks when images update.

---

### 7. Reduced Motion Preference ♿

**Problem**: Plan doesn't check `prefers-reduced-motion` media query.

**Why Important**: Accessibility requirement - users can request reduced animations.

**Solution**: Add motion preference handling:

```typescript
// In image-gallery.types.ts
interface ImageGalleryState {
  // ...existing
  prefersReducedMotion: boolean;
}

// In ImageGallery.svelte
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

**Use in animations**:
```typescript
// In ImageLightbox.svelte
$effect(() => {
  if ($store.lightbox.presentation.status === 'presenting') {
    if ($store.prefersReducedMotion) {
      // Skip animation, just mark as completed
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    } else {
      // Normal animation
      animateModalIn(lightboxElement).then(() => {
        store.dispatch({
          type: 'presentation',
          event: { type: 'presentationCompleted' }
        });
      });
    }
  }
});
```

**Priority**: MEDIUM - Accessibility best practice.

---

### 8. Prevent Body Scroll When Lightbox Open 🚨

**Problem**: Not mentioned in plan, but critical for UX.

**Issue**: When lightbox is open, user can still scroll the page behind it (especially on mobile).

**Solution**: Toggle body scroll:

```svelte
<!-- ImageLightbox.svelte -->
<script>
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
</script>
```

**Priority**: HIGH - Critical for mobile UX.

---

### 9. Rapid Navigation Debouncing 🔍

**Problem**: Plan doesn't handle rapid clicking on next/previous buttons.

**Issue**: User clicks "next" 5 times rapidly → triggers 5 state updates → animations conflict.

**Solution**: Add navigation debounce:

```typescript
// In reducer
interface ImageGalleryState {
  // ...existing
  isNavigating: boolean; // Prevent concurrent navigation
}

case 'nextImage': {
  // Guard: already navigating
  if (state.isNavigating) {
    return [state, Effect.none()];
  }

  const nextIndex = state.lightbox.currentIndex + 1;
  if (nextIndex >= state.images.length) {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      lightbox: {
        ...state.lightbox,
        currentIndex: nextIndex
      },
      isNavigating: true // Lock navigation
    },
    Effect.afterDelay(300, (dispatch) =>
      dispatch({ type: 'navigationCompleted' })
    )
  ];
}

case 'navigationCompleted': {
  return [
    { ...state, isNavigating: false }, // Unlock navigation
    Effect.none()
  ];
}
```

**Priority**: MEDIUM - Prevents janky animations.

---

### 10. Error Recovery in Lightbox 🚨

**Problem**: Plan handles errors in grid but not in lightbox. What if the full-size image fails to load?

**Solution**: Add error handling to lightbox:

```typescript
// Add to state
interface ImageGalleryState {
  lightbox: {
    // ...existing
    imageLoadError: string | null;
  };
}

// Add action
type ImageGalleryAction =
  | { type: 'lightboxImageError'; error: string }
  | { type: 'lightboxImageLoaded' }
```

```svelte
<!-- ImageLightbox.svelte -->
<img
  src={currentImage.url}
  alt={currentImage.alt}
  onerror={() => store.dispatch({
    type: 'lightboxImageError',
    error: 'Failed to load image'
  })}
  onload={() => store.dispatch({ type: 'lightboxImageLoaded' })}
/>

{#if $store.lightbox.imageLoadError}
  <div class="error-message">
    Failed to load image. <button onclick={/* retry */}>Retry</button>
  </div>
{/if}
```

**Priority**: HIGH - Graceful degradation is critical.

---

### 11. Srcset for Responsive Images 📱

**Problem**: Plan only uses single `url` field. Modern images should use `srcset` for different screen densities.

**Enhancement**:
```typescript
interface GalleryImage {
  id: string;
  url: string;
  srcset?: string; // "image-320w.jpg 320w, image-640w.jpg 640w, image-1280w.jpg 1280w"
  sizes?: string;  // "(max-width: 640px) 100vw, 640px"
  thumbnailUrl?: string;
  thumbnailSrcset?: string;
  // ...rest
}
```

```svelte
<img
  src={image.url}
  srcset={image.srcset}
  sizes={image.sizes}
  alt={image.alt}
/>
```

**Priority**: LOW - Nice to have, not blocking.

---

## Medium Priority Issues

### 12. Image Loading Skeleton

Add skeleton loader while image loads in lightbox:

```svelte
{#if isImageLoading}
  <div class="image-skeleton" />
{/if}
<img
  class:opacity-0={isImageLoading}
  src={currentImage.url}
  onload={() => isImageLoading = false}
/>
```

### 13. Deep Linking Support

Allow URL like `?gallery=image-3` to open lightbox at specific image:

```typescript
onMount(() => {
  const params = new URLSearchParams(window.location.search);
  const imageIndex = params.get('gallery');
  if (imageIndex) {
    store.dispatch({ type: 'openLightbox', index: parseInt(imageIndex) });
  }
});

// Update URL when navigating
$effect(() => {
  if ($store.lightbox.isOpen) {
    const url = new URL(window.location.href);
    url.searchParams.set('gallery', String($store.lightbox.currentIndex));
    window.history.replaceState({}, '', url);
  }
});
```

### 14. Markdown: Inline vs Gallery Mode

Current plan removes all images from markdown and shows them in gallery. But what if user wants some images inline?

**Solution**: Add syntax for gallery vs inline:
```markdown
<!-- Inline image (stays in markdown) -->
![alt](url)

<!-- Gallery image (extracted to gallery) -->
![gallery:alt](url)
```

---

## Testing Additions Needed

The plan has basic tests but missing:

1. **Touch gesture tests**
   ```typescript
   it('navigates to next image on swipe left', async () => {
     await store.send({ type: 'touchStart', x: 100, y: 0 });
     await store.send({ type: 'touchMove', x: 50, y: 0 });
     await store.send({ type: 'touchEnd' });
     // Assert currentIndex incremented
   });
   ```

2. **Error recovery tests**
   ```typescript
   it('shows error message when lightbox image fails', async () => {
     await store.send({ type: 'openLightbox', index: 0 });
     await store.send({ type: 'lightboxImageError', error: 'Failed' });
     expect(store.state.lightbox.imageLoadError).toBe('Failed');
   });
   ```

3. **Focus trap tests**
   ```typescript
   it('traps focus within lightbox', () => {
     // Test Tab cycles through focusable elements
     // Test Shift+Tab goes backwards
   });
   ```

4. **Reduced motion tests**
   ```typescript
   it('skips animations when prefers-reduced-motion', async () => {
     // Mock matchMedia to return { matches: true }
     await store.send({ type: 'openLightbox', index: 0 });
     // Assert presentation goes straight to 'presented'
   });
   ```

---

## Revised Implementation Phases

**Phase 1: Core Components** (Day 1)
- ✓ Create directory structure
- ✓ Define types (add touch state, navigation lock)
- ✓ Implement reducer with guards
- ✓ Create ImageGallery with dual-mode API
- ✓ Responsive grid with lazy loading

**Phase 2: Lightbox (No Carousel)** (Day 1-2)
- ✓ Create ImageLightbox (custom navigation, not Carousel)
- ✓ Integrate with Modal component
- ✓ Add navigation with debounce
- ✓ Implement keyboard + focus trap
- ✓ Add error handling

**Phase 3: Mobile & Touch** (Day 2)
- ✓ Implement touch gestures (swipe)
- ✓ Prevent body scroll
- ✓ Test on mobile devices

**Phase 4: Animation Integration** (Day 2-3)
- ✓ Add PresentationState
- ✓ Modal open/close animations
- ✓ Image transition animations
- ✓ Respect reduced motion
- ✓ Grid stagger animation

**Phase 5: Performance & Polish** (Day 3)
- ✓ Image preloading (adjacent images)
- ✓ Memory cleanup (IntersectionObserver)
- ✓ Loading skeletons
- ✓ Rapid navigation guards

**Phase 6: Markdown Integration** (Day 3-4)
- ✓ Parse markdown images
- ✓ Update markdown renderer
- ✓ Integrate with ChatMessage
- ✓ Handle streaming

**Phase 7: Testing & Documentation** (Day 4)
- ✓ Comprehensive tests (including new areas)
- ✓ README with examples
- ✓ Styleguide demo

**Phase 8: Accessibility Audit** (Day 4-5)
- ✓ Screen reader testing
- ✓ Keyboard-only navigation testing
- ✓ Focus management verification
- ✓ ARIA attributes review

---

## Conclusion

**Revised Status**: Plan is now **95% production-ready** with these changes:

### Must Fix Before Implementation:
1. ✅ **Don't use Carousel component** - implement navigation directly
2. ✅ **Dual-mode API** - support both simple and advanced usage
3. ✅ **Touch gestures** - full implementation with swipe support
4. ✅ **Focus trap** - proper accessibility
5. ✅ **Body scroll lock** - prevent background scrolling
6. ✅ **Error handling** - lightbox image load failures

### Should Fix:
7. ✅ **Image preloading** - better UX
8. ✅ **Navigation debounce** - prevent rapid clicks
9. ✅ **Reduced motion** - accessibility
10. ✅ **Memory cleanup** - IntersectionObserver lifecycle

### Nice to Have:
11. Deep linking support
12. Srcset for responsive images
13. Inline vs gallery mode in markdown

**Recommendation**: Implement "Must Fix" items in parallel with Phases 1-3. The "Should Fix" items can be added in Phase 5. "Nice to Have" can be deferred to Phase 9 (Future Enhancements).
