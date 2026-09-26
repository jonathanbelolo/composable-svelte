/**
 * Tooltip Reducer
 *
 * State management for tooltip with animation lifecycle.
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import { springPresets } from '../../../animation/spring-config.js';
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
/** Owned wait: cancellation clears both the timeout and its abort listener. */
function completion(id: string, ms: number, action: TooltipAction) {
	return Effect.cancellable<TooltipAction>(id, async (dispatch, signal) => {
		if (signal?.aborted) return;
		await new Promise<void>((resolve) => {
			const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
			const timer = setTimeout(finish, ms);
			signal?.addEventListener('abort', finish, { once: true });
		});
		if (!signal?.aborted) dispatch(action);
	});
}

export const tooltipReducer: Reducer<TooltipState, TooltipAction, TooltipDependencies> = (state, action, deps) => {
	const hoverDelay = deps.hoverDelay ?? 300;
	const duration = springPresets.tooltip.visualDuration;
	const dismiss = (current: TooltipState): ReturnType<typeof tooltipReducer> => {
		const presentationVersion = (current.presentationVersion ?? 0) + 1;
		return [{ ...current, presentationVersion,
			presentation: { status: 'dismissing', content: current.content ?? '', duration: duration * 0.7 }
		}, Effect.batch(Effect.cancel('tooltip-presentation'), completion('tooltip-dismissal', duration * 0.7 * 1000,
			{ type: 'presentation', event: { type: 'dismissalCompleted' }, presentationVersion }))];
	};
	switch (action.type) {
		case 'hoverStarted': {
			if (state.presentation.status === 'presenting' || state.presentation.status === 'presented') {
				return [{ ...state, content: action.content, isHovered: true,
					presentation: { ...state.presentation, content: action.content } }, Effect.none()];
			}
			const hoverVersion = (state.hoverVersion ?? 0) + 1;
			return [{ ...state, content: action.content, isWaitingToShow: true, isHovered: true, hoverVersion },
				completion('tooltip-hover-delay', hoverDelay, { type: 'delayCompleted', hoverVersion })];
		}
		case 'hoverEnded': {
			const current = { ...state, isHovered: false };
			if (state.isWaitingToShow) {
				return [{ ...current, content: state.presentation.status === 'idle' ? null : state.content,
					isWaitingToShow: false, hoverVersion: (state.hoverVersion ?? 0) + 1 }, Effect.cancel('tooltip-hover-delay')];
			}
			if (state.presentation.status === 'presented') return dismiss(current);
			// Preserve the exit intention while entrance settles, rather than discarding it.
			return [current, Effect.none()];
		}
		case 'delayCompleted': {
			if (action.hoverVersion !== undefined && action.hoverVersion !== state.hoverVersion) return [state, Effect.none()];
			if (!state.isWaitingToShow || state.content === null || state.isHovered === false) return [state, Effect.none()];
			const presentationVersion = (state.presentationVersion ?? 0) + 1;
			return [{ ...state, isWaitingToShow: false, presentationVersion,
				presentation: { status: 'presenting', content: state.content, duration }
			}, Effect.batch(Effect.cancel('tooltip-hover-delay'), Effect.cancel('tooltip-dismissal'),
				completion('tooltip-presentation', duration * 1000,
					{ type: 'presentation', event: { type: 'presentationCompleted' }, presentationVersion }))];
		}
		case 'presentation': {
			if (action.presentationVersion !== undefined && action.presentationVersion !== state.presentationVersion) return [state, Effect.none()];
			if (action.event.type === 'presentationCompleted' && state.presentation.status === 'presenting') {
				if (state.isHovered === false) return dismiss(state);
				return [{ ...state, presentation: { status: 'presented', content: state.content ?? state.presentation.content } }, Effect.cancel('tooltip-presentation')];
			}
			if (action.event.type === 'dismissalCompleted' && state.presentation.status === 'dismissing') {
				return [{ ...state, content: state.isWaitingToShow ? state.content : null, presentation: { status: 'idle' } }, Effect.cancel('tooltip-dismissal')];
			}
			return [state, Effect.none()];
		}
		default: return [state, Effect.none()];
	}
};
