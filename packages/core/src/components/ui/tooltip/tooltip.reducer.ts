/**
 * Tooltip Reducer
 *
 * State management for tooltip with animation lifecycle.
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	TooltipState,
	TooltipAction,
	TooltipDependencies
} from './tooltip.types.js';

/**
 * Tooltip reducer with animation lifecycle management.
 *
 * Handles:
 * - Hover delay before showing tooltip
 * - PresentationState lifecycle (presenting → presented → dismissing → idle)
 * - Animation coordination via presentation events
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: initialTooltipState,
 *   reducer: tooltipReducer,
 *   dependencies: { hoverDelay: 300 }
 * });
 *
 * // User hovers
 * store.dispatch({ type: 'hoverStarted', content: 'Save file' });
 * // After delay → delayCompleted → tooltip animates in
 * // After animation → presentationCompleted → tooltip fully shown
 * ```
 */
export const tooltipReducer: Reducer<TooltipState, TooltipAction, TooltipDependencies> = (
	state,
	action,
	deps
) => {
	const hoverDelay = deps.hoverDelay ?? 300;
	const animationDuration = 0.15; // Tooltip preset duration in seconds

	switch (action.type) {
		case 'hoverStarted': {
			// Start hover delay timer (cancellable)
			return [
				{
					...state,
					content: action.content,
					isWaitingToShow: true
				},
				Effect.cancellable('tooltip-hover-delay', async (dispatch) => {
					await new Promise((resolve) => setTimeout(resolve, hoverDelay));
					dispatch({ type: 'delayCompleted' });
				})
			];
		}

		case 'hoverEnded': {
			// Cancel hover timer or start dismissal
			if (state.isWaitingToShow) {
				// Hover ended before delay completed - just clear state
				// The delay effect will still fire, but delayCompleted will be ignored
				return [
					{
						...state,
						content: null,
						isWaitingToShow: false
					},
					Effect.none()
				];
			}

			if (state.presentation.status === 'presented') {
				// Tooltip is shown - start dismissal animation
				return [
					{
						...state,
						presentation: {
							status: 'dismissing',
							content: state.presentation.content,
							duration: animationDuration * 0.7 // Faster exit
						}
					},
					// Use cancellable effect for dismissal completion
					Effect.cancellable('tooltip-dismissal', async (dispatch) => {
						await new Promise((resolve) => setTimeout(resolve, animationDuration * 0.7 * 1000));
						dispatch({
							type: 'presentation',
							event: { type: 'dismissalCompleted' }
						});
					})
				];
			}

			// Tooltip is animating in or already dismissing - ignore
			return [state, Effect.none()];
		}

		case 'delayCompleted': {
			// Delay completed - start presentation animation
			if (!state.isWaitingToShow || !state.content) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					isWaitingToShow: false,
					presentation: {
						status: 'presenting',
						content: state.content,
						duration: animationDuration
					}
				},
				// Use cancellable effect for normal completion
				// Timeout will be cancelled when completion happens
				Effect.cancellable('tooltip-presentation', async (dispatch) => {
					await new Promise((resolve) => setTimeout(resolve, animationDuration * 1000));
					dispatch({
						type: 'presentation',
						event: { type: 'presentationCompleted' }
					});
				})
			];
		}

		case 'presentation': {
			if (action.event.type === 'presentationCompleted') {
				// Animation-in completed
				if (state.presentation.status !== 'presenting') {
					return [state, Effect.none()];
				}

				return [
					{
						...state,
						presentation: {
							status: 'presented',
							content: state.presentation.content
						}
					},
					Effect.none()
				];
			}

			if (action.event.type === 'dismissalCompleted') {
				// Animation-out completed
				if (state.presentation.status !== 'dismissing') {
					return [state, Effect.none()];
				}

				return [
					{
						...state,
						content: null,
						presentation: { status: 'idle' }
					},
					Effect.none()
				];
			}

			return [state, Effect.none()];
		}

		default:
			return [state, Effect.none()];
	}
};
