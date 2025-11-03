/**
 * Carousel Reducer
 *
 * Pure business logic for the carousel component following the Composable Architecture pattern.
 */

import { Effect } from '../../../effect.js';
import type { Effect as EffectType } from '../../../types.js';
import type {
  CarouselState,
  CarouselAction,
  CarouselDependencies,
  CarouselSlide
} from './carousel.types.js';

/**
 * Main reducer for the Carousel component
 */
export function carouselReducer<T = unknown>(
  state: CarouselState<T>,
  action: CarouselAction,
  deps?: CarouselDependencies<T>
): [CarouselState<T>, EffectType<CarouselAction>] {
  switch (action.type) {
    case 'nextSlide': {
      if (state.isTransitioning) {
        return [state, Effect.none<CarouselAction>()];
      }

      const nextIndex = state.currentIndex + 1;

      // Check if we can move forward
      if (nextIndex >= state.slides.length) {
        if (!state.loop) {
          return [state, Effect.none<CarouselAction>()];
        }
        // Loop back to start
        return handleSlideChange(state, 0, deps);
      }

      return handleSlideChange(state, nextIndex, deps);
    }

    case 'previousSlide': {
      if (state.isTransitioning) {
        return [state, Effect.none<CarouselAction>()];
      }

      const prevIndex = state.currentIndex - 1;

      // Check if we can move backward
      if (prevIndex < 0) {
        if (!state.loop) {
          return [state, Effect.none<CarouselAction>()];
        }
        // Loop to end
        return handleSlideChange(state, state.slides.length - 1, deps);
      }

      return handleSlideChange(state, prevIndex, deps);
    }

    case 'goToSlide': {
      if (state.isTransitioning) {
        return [state, Effect.none<CarouselAction>()];
      }

      const targetIndex = action.index;

      // Validate index
      if (targetIndex < 0 || targetIndex >= state.slides.length) {
        return [state, Effect.none<CarouselAction>()];
      }

      // No-op if already on this slide
      if (targetIndex === state.currentIndex) {
        return [state, Effect.none<CarouselAction>()];
      }

      return handleSlideChange(state, targetIndex, deps);
    }

    case 'autoPlayStarted': {
      if (state.autoPlayInterval <= 0) {
        return [state, Effect.none<CarouselAction>()];
      }

      const onStartEffect = deps?.onAutoPlayStart
        ? Effect.run<CarouselAction>(async () => {
            deps.onAutoPlayStart!();
          })
        : Effect.none<CarouselAction>();

      const tickEffect = Effect.run<CarouselAction>(async (dispatch) => {
        await new Promise((resolve) => setTimeout(resolve, state.autoPlayInterval));
        dispatch({ type: 'autoPlayTick' });
      });

      return [
        {
          ...state,
          isAutoPlaying: true
        },
        Effect.batch(onStartEffect, tickEffect)
      ];
    }

    case 'autoPlayStopped': {
      const onStopEffect = deps?.onAutoPlayStop
        ? Effect.run<CarouselAction>(async () => {
            deps.onAutoPlayStop!();
          })
        : Effect.none<CarouselAction>();

      return [
        {
          ...state,
          isAutoPlaying: false
        },
        onStopEffect
      ];
    }

    case 'autoPlayTick': {
      if (!state.isAutoPlaying || state.isTransitioning) {
        return [state, Effect.none<CarouselAction>()];
      }

      // Move to next slide
      const nextIndex = state.currentIndex + 1;
      const targetIndex = nextIndex >= state.slides.length ? 0 : nextIndex;

      const [newState, slideChangeEffect] = handleSlideChange(state, targetIndex, deps);

      // Schedule next tick
      const tickEffect = Effect.run<CarouselAction>(async (dispatch) => {
        await new Promise((resolve) => setTimeout(resolve, state.autoPlayInterval));
        dispatch({ type: 'autoPlayTick' });
      });

      return [newState, Effect.batch(slideChangeEffect, tickEffect)];
    }

    case 'transitionStarted': {
      return [
        {
          ...state,
          isTransitioning: true
        },
        Effect.none<CarouselAction>()
      ];
    }

    case 'transitionCompleted': {
      return [
        {
          ...state,
          isTransitioning: false
        },
        Effect.none<CarouselAction>()
      ];
    }

    case 'slidesUpdated': {
      const newSlides = action.slides as CarouselSlide<T>[];

      // Ensure currentIndex is still valid
      const validIndex = Math.max(0, Math.min(state.currentIndex, newSlides.length - 1));

      return [
        {
          ...state,
          slides: newSlides,
          currentIndex: validIndex
        },
        Effect.none<CarouselAction>()
      ];
    }

    default: {
      const _exhaustive: never = action;
      return [state, Effect.none<CarouselAction>()];
    }
  }
}

/**
 * Helper function to handle slide changes with transition and callback
 */
function handleSlideChange<T>(
  state: CarouselState<T>,
  newIndex: number,
  deps?: CarouselDependencies<T>
): [CarouselState<T>, EffectType<CarouselAction>] {
  const newSlide = state.slides[newIndex];

  const effects: EffectType<CarouselAction>[] = [
    Effect.run<CarouselAction>(async (dispatch) => {
      dispatch({ type: 'transitionStarted' });
    })
  ];

  // Callback for slide change
  if (deps?.onSlideChange && newSlide) {
    effects.push(
      Effect.run<CarouselAction>(async () => {
        deps.onSlideChange!(newIndex, newSlide);
      })
    );
  }

  return [
    {
      ...state,
      currentIndex: newIndex
    },
    Effect.batch(...effects)
  ];
}
