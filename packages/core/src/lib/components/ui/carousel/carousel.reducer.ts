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

const AUTOPLAY_EFFECT_ID = 'carousel-autoplay';

function createAutoPlayTickEffect(interval: number): EffectType<CarouselAction> {
  if (!Number.isFinite(interval) || interval <= 0) {
    return Effect.none<CarouselAction>();
  }

  return Effect.cancellable<CarouselAction>(AUTOPLAY_EFFECT_ID, async (dispatch, signal) => {
    if (signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, interval);
      signal?.addEventListener('abort', finish, { once: true });
    });
    if (!signal?.aborted) {
      dispatch({ type: 'autoPlayTick' });
    }
  });
}

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
      if (state.isTransitioning || state.slides.length <= 1) {
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
      if (state.isTransitioning || state.slides.length <= 1) {
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
      if (state.isTransitioning || state.slides.length <= 1) {
        return [state, Effect.none<CarouselAction>()];
      }

      const targetIndex = action.index;

      // Validate index
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= state.slides.length) {
        return [state, Effect.none<CarouselAction>()];
      }

      // No-op if already on this slide
      if (targetIndex === state.currentIndex) {
        return [state, Effect.none<CarouselAction>()];
      }

      return handleSlideChange(state, targetIndex, deps);
    }

    case 'autoPlayStarted': {
      if (action.interval !== undefined) state = { ...state, autoPlayInterval: Number.isFinite(action.interval) && action.interval > 0 ? action.interval : 0 };
      if (state.autoPlayInterval <= 0) return carouselReducer(state, { type: 'autoPlayStopped' }, deps);

      const onStartEffect = deps?.onAutoPlayStart && !state.isAutoPlaying
        ? Effect.run<CarouselAction>(async () => {
            deps.onAutoPlayStart!();
          })
        : Effect.none<CarouselAction>();

      const tickEffect = state.slides.length > 1 ? createAutoPlayTickEffect(state.autoPlayInterval) : Effect.none<CarouselAction>();

      return [
        {
          ...state,
          isAutoPlaying: true
        },
        Effect.batch(tickEffect, onStartEffect)
      ];
    }

    case 'autoPlayStopped': {
      const onStopEffect = deps?.onAutoPlayStop && state.isAutoPlaying
        ? Effect.run<CarouselAction>(async () => {
            deps.onAutoPlayStop!();
          })
        : Effect.none<CarouselAction>();

      return [
        {
          ...state,
          isAutoPlaying: false
        },
        Effect.batch(Effect.cancel(AUTOPLAY_EFFECT_ID), onStopEffect)
      ];
    }

    case 'autoPlayTick': {
      if (!state.isAutoPlaying) return [state, Effect.none<CarouselAction>()];
      const tickEffect = state.slides.length > 1 ? createAutoPlayTickEffect(state.autoPlayInterval) : Effect.none<CarouselAction>();
      if (state.isTransitioning || state.slides.length <= 1) return [state, tickEffect];

      // Move to next slide
      const nextIndex = state.currentIndex + 1;
      const targetIndex = nextIndex >= state.slides.length ? 0 : nextIndex;

      const [newState, slideChangeEffect] = handleSlideChange(state, targetIndex, deps);

      return [newState, Effect.batch(tickEffect, slideChangeEffect)];
    }

    case 'transitionStarted': {
      if (action.transitionId !== undefined) return [state, Effect.none()];
      return [
        {
          ...state,
          isTransitioning: true
        },
        Effect.none<CarouselAction>()
      ];
    }

    case 'transitionCompleted': {
      if (action.transitionId !== undefined && action.transitionId !== state.transitionId) return [state, Effect.none()];
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
          currentIndex: validIndex,
          isTransitioning: false,
          transitionId: (state.transitionId ?? 0) + 1
        },
        state.isAutoPlaying
          ? newSlides.length > 1
            ? createAutoPlayTickEffect(state.autoPlayInterval)
            : Effect.cancel(AUTOPLAY_EFFECT_ID)
          : Effect.none<CarouselAction>()
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
  if (newIndex === state.currentIndex || newIndex < 0 || newIndex >= state.slides.length) {
    return [state, Effect.none<CarouselAction>()];
  }

  const newSlide = state.slides[newIndex];
  const transitionId = (state.transitionId ?? 0) + 1;

  const effects: EffectType<CarouselAction>[] = [
    Effect.run<CarouselAction>(async (dispatch) => {
      dispatch({ type: 'transitionStarted', transitionId });
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
      currentIndex: newIndex,
      isTransitioning: true,
      transitionId
    },
    Effect.batch(...effects)
  ];
}
