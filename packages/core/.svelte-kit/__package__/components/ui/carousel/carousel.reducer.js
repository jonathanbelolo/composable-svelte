/**
 * Carousel Reducer
 *
 * Pure business logic for the carousel component following the Composable Architecture pattern.
 */
import { Effect } from '../../../effect.js';
/**
 * Main reducer for the Carousel component
 */
export function carouselReducer(state, action, deps) {
    switch (action.type) {
        case 'nextSlide': {
            if (state.isTransitioning) {
                return [state, Effect.none()];
            }
            const nextIndex = state.currentIndex + 1;
            // Check if we can move forward
            if (nextIndex >= state.slides.length) {
                if (!state.loop) {
                    return [state, Effect.none()];
                }
                // Loop back to start
                return handleSlideChange(state, 0, deps);
            }
            return handleSlideChange(state, nextIndex, deps);
        }
        case 'previousSlide': {
            if (state.isTransitioning) {
                return [state, Effect.none()];
            }
            const prevIndex = state.currentIndex - 1;
            // Check if we can move backward
            if (prevIndex < 0) {
                if (!state.loop) {
                    return [state, Effect.none()];
                }
                // Loop to end
                return handleSlideChange(state, state.slides.length - 1, deps);
            }
            return handleSlideChange(state, prevIndex, deps);
        }
        case 'goToSlide': {
            if (state.isTransitioning) {
                return [state, Effect.none()];
            }
            const targetIndex = action.index;
            // Validate index
            if (targetIndex < 0 || targetIndex >= state.slides.length) {
                return [state, Effect.none()];
            }
            // No-op if already on this slide
            if (targetIndex === state.currentIndex) {
                return [state, Effect.none()];
            }
            return handleSlideChange(state, targetIndex, deps);
        }
        case 'autoPlayStarted': {
            if (state.autoPlayInterval <= 0) {
                return [state, Effect.none()];
            }
            const onStartEffect = deps?.onAutoPlayStart
                ? Effect.run(async () => {
                    deps.onAutoPlayStart();
                })
                : Effect.none();
            const tickEffect = Effect.run(async (dispatch) => {
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
                ? Effect.run(async () => {
                    deps.onAutoPlayStop();
                })
                : Effect.none();
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
                return [state, Effect.none()];
            }
            // Move to next slide
            const nextIndex = state.currentIndex + 1;
            const targetIndex = nextIndex >= state.slides.length ? 0 : nextIndex;
            const [newState, slideChangeEffect] = handleSlideChange(state, targetIndex, deps);
            // Schedule next tick
            const tickEffect = Effect.run(async (dispatch) => {
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
                Effect.none()
            ];
        }
        case 'transitionCompleted': {
            return [
                {
                    ...state,
                    isTransitioning: false
                },
                Effect.none()
            ];
        }
        case 'slidesUpdated': {
            const newSlides = action.slides;
            // Ensure currentIndex is still valid
            const validIndex = Math.max(0, Math.min(state.currentIndex, newSlides.length - 1));
            return [
                {
                    ...state,
                    slides: newSlides,
                    currentIndex: validIndex
                },
                Effect.none()
            ];
        }
        default: {
            const _exhaustive = action;
            return [state, Effect.none()];
        }
    }
}
/**
 * Helper function to handle slide changes with transition and callback
 */
function handleSlideChange(state, newIndex, deps) {
    const newSlide = state.slides[newIndex];
    const effects = [
        Effect.run(async (dispatch) => {
            dispatch({ type: 'transitionStarted' });
        })
    ];
    // Callback for slide change
    if (deps?.onSlideChange && newSlide) {
        effects.push(Effect.run(async () => {
            deps.onSlideChange(newIndex, newSlide);
        }));
    }
    return [
        {
            ...state,
            currentIndex: newIndex
        },
        Effect.batch(...effects)
    ];
}
