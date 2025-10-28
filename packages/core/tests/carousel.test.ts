import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestStore } from '../src/test/test-store.js';
import { carouselReducer } from '../src/components/ui/carousel/carousel.reducer.js';
import {
  createInitialCarouselState,
  type CarouselSlide,
  type CarouselAction
} from '../src/components/ui/carousel/carousel.types.js';

describe('Carousel Component', () => {
  const testSlides: CarouselSlide[] = [
    { id: '1', data: 'Slide 1' },
    { id: '2', data: 'Slide 2' },
    { id: '3', data: 'Slide 3' }
  ];

  describe('Navigation Actions', () => {
    it('should move to next slide', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer
      });

      await store.send({ type: 'nextSlide' });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(1);
        expect(state.isTransitioning).toBe(true);
      });
    });

    it('should move to previous slide', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 1),
        reducer: carouselReducer
      });

      await store.send({ type: 'previousSlide' });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(0);
        expect(state.isTransitioning).toBe(true);
      });
    });

    it('should go to specific slide', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer
      });

      await store.send({ type: 'goToSlide', index: 2 });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(2);
        expect(state.isTransitioning).toBe(true);
      });
    });

    it('should not move when already on target slide', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer
      });

      await store.send({ type: 'goToSlide', index: 0 }, (state) => {
        expect(state.currentIndex).toBe(0);
        expect(state.isTransitioning).toBe(false);
      });
    });

    it('should ignore invalid slide index', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer
      });

      await store.send({ type: 'goToSlide', index: 5 }, (state) => {
        expect(state.currentIndex).toBe(0);
      });

      await store.send({ type: 'goToSlide', index: -1 }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });
  });

  describe('Loop Behavior', () => {
    it('should loop from last to first when loop is enabled', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 2, true),
        reducer: carouselReducer
      });

      await store.send({ type: 'nextSlide' });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });

    it('should loop from first to last when going backward', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 0, true),
        reducer: carouselReducer
      });

      await store.send({ type: 'previousSlide' });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(2);
      });
    });

    it('should not loop when loop is disabled', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 2, false),
        reducer: carouselReducer
      });

      await store.send({ type: 'nextSlide' }, (state) => {
        expect(state.currentIndex).toBe(2);
      });
    });

    it('should not go backward when at first slide and loop is disabled', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 0, false),
        reducer: carouselReducer
      });

      await store.send({ type: 'previousSlide' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });
  });

  describe('Transition State', () => {
    it('should mark transition as started', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer
      });

      await store.send({ type: 'transitionStarted' }, (state) => {
        expect(state.isTransitioning).toBe(true);
      });
    });

    it('should mark transition as completed', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides),
          isTransitioning: true
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'transitionCompleted' }, (state) => {
        expect(state.isTransitioning).toBe(false);
      });
    });

    it('should block navigation during transition', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides),
          isTransitioning: true
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'nextSlide' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });
  });

  describe('Auto-play', () => {
    it('should start auto-play', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 0, true, 1000),
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayStarted' }, (state) => {
        expect(state.isAutoPlaying).toBe(true);
      });
    });

    it('should stop auto-play', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides, 0, true, 1000),
          isAutoPlaying: true
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayStopped' }, (state) => {
        expect(state.isAutoPlaying).toBe(false);
      });
    });

    it('should not start auto-play when interval is 0', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 0, true, 0),
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayStarted' }, (state) => {
        expect(state.isAutoPlaying).toBe(false);
      });
    });

    it('should advance to next slide on auto-play tick', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides, 0, true, 1000),
          isAutoPlaying: true
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayTick' });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(1);
      });
    });

    it('should loop to first slide on auto-play tick at end', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides, 2, true, 1000),
          isAutoPlaying: true
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayTick' });

      await store.receive({ type: 'transitionStarted' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });

    it('should not tick when not auto-playing', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides, 0, true, 1000),
          isAutoPlaying: false
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayTick' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });

    it('should not tick during transition', async () => {
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides, 0, true, 1000),
          isAutoPlaying: true,
          isTransitioning: true
        },
        reducer: carouselReducer
      });

      await store.send({ type: 'autoPlayTick' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });
  });

  describe('Callbacks', () => {
    it('should call onSlideChange when slide changes', async () => {
      const onSlideChange = vi.fn();
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer,
        dependencies: { onSlideChange }
      });

      await store.send({ type: 'nextSlide' });

      await store.receive({ type: 'transitionStarted' });

      expect(onSlideChange).toHaveBeenCalledWith(1, testSlides[1]);
    });

    it('should call onAutoPlayStart when auto-play starts', async () => {
      const onAutoPlayStart = vi.fn();
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 0, true, 1000),
        reducer: carouselReducer,
        dependencies: { onAutoPlayStart }
      });

      await store.send({ type: 'autoPlayStarted' });

      expect(onAutoPlayStart).toHaveBeenCalled();
    });

    it('should call onAutoPlayStop when auto-play stops', async () => {
      const onAutoPlayStop = vi.fn();
      const store = new TestStore({
        initialState: {
          ...createInitialCarouselState(testSlides, 0, true, 1000),
          isAutoPlaying: true
        },
        reducer: carouselReducer,
        dependencies: { onAutoPlayStop }
      });

      await store.send({ type: 'autoPlayStopped' });

      expect(onAutoPlayStop).toHaveBeenCalled();
    });
  });

  describe('Slides Update', () => {
    it('should update slides', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides),
        reducer: carouselReducer
      });

      const newSlides: CarouselSlide[] = [
        { id: '4', data: 'New Slide 1' },
        { id: '5', data: 'New Slide 2' }
      ];

      await store.send({ type: 'slidesUpdated', slides: newSlides }, (state) => {
        expect(state.slides).toEqual(newSlides);
        expect(state.slides.length).toBe(2);
      });
    });

    it('should adjust current index when slides are updated to fewer slides', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 2),
        reducer: carouselReducer
      });

      const newSlides: CarouselSlide[] = [{ id: '4', data: 'Only Slide' }];

      await store.send({ type: 'slidesUpdated', slides: newSlides }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });

    it('should keep current index valid when slides are updated', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState(testSlides, 1),
        reducer: carouselReducer
      });

      const newSlides: CarouselSlide[] = [
        { id: '4', data: 'Slide 1' },
        { id: '5', data: 'Slide 2' },
        { id: '6', data: 'Slide 3' },
        { id: '7', data: 'Slide 4' }
      ];

      await store.send({ type: 'slidesUpdated', slides: newSlides }, (state) => {
        expect(state.currentIndex).toBe(1);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty slides array', async () => {
      const store = new TestStore({
        initialState: createInitialCarouselState([]),
        reducer: carouselReducer
      });

      expect(store.state.slides.length).toBe(0);
      expect(store.state.currentIndex).toBe(0);
    });

    it('should handle single slide', async () => {
      const singleSlide: CarouselSlide[] = [{ id: '1', data: 'Only Slide' }];
      const store = new TestStore({
        initialState: createInitialCarouselState(singleSlide, 0, false),
        reducer: carouselReducer
      });

      // Cannot go next
      await store.send({ type: 'nextSlide' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });

      // Cannot go previous
      await store.send({ type: 'previousSlide' }, (state) => {
        expect(state.currentIndex).toBe(0);
      });
    });

    it('should handle initial index beyond slides length', () => {
      const state = createInitialCarouselState(testSlides, 10);
      expect(state.currentIndex).toBe(2); // Clamped to last valid index
    });

    it('should handle negative initial index', () => {
      const state = createInitialCarouselState(testSlides, -5);
      expect(state.currentIndex).toBe(0); // Clamped to 0
    });
  });

  describe('State Initialization', () => {
    it('should create initial state with defaults', () => {
      const state = createInitialCarouselState(testSlides);

      expect(state.slides).toEqual(testSlides);
      expect(state.currentIndex).toBe(0);
      expect(state.isAutoPlaying).toBe(false);
      expect(state.isTransitioning).toBe(false);
      expect(state.loop).toBe(true);
      expect(state.autoPlayInterval).toBe(0);
    });

    it('should create initial state with custom values', () => {
      const state = createInitialCarouselState(testSlides, 1, false, 3000);

      expect(state.currentIndex).toBe(1);
      expect(state.loop).toBe(false);
      expect(state.autoPlayInterval).toBe(3000);
    });

    it('should create initial state with empty slides', () => {
      const state = createInitialCarouselState();

      expect(state.slides).toEqual([]);
      expect(state.currentIndex).toBe(0);
    });
  });
});
