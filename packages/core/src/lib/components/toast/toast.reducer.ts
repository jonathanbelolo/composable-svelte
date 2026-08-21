/**
 * Toast Reducer
 *
 * Manages toast notification state including queue management and auto-dismiss.
 */

import { Effect } from '../../effect.js';
import type { Reducer, Effect as EffectType } from '../../types.js';
import type { Toast, ToastState, ToastAction, ToastDependencies } from './toast.types.js';
import { defaultGenerateId } from './toast.types.js';

/**
 * Toast Reducer.
 *
 * Handles:
 * - Adding toasts with auto-dismiss timers
 * - Dismissing toasts manually or automatically
 * - Queue management (max toasts limit)
 * - Toast action button clicks
 *
 * @example
 * ```typescript
 * const reducer = toastReducer;
 * const store = createStore({
 *   initialState: createInitialToastState(),
 *   reducer,
 *   dependencies: { onToastAdded: (toast) => console.log(toast) }
 * });
 * ```
 */
export const toastReducer: Reducer<ToastState, ToastAction, ToastDependencies> = (
	state,
	action,
	deps
) => {
	switch (action.type) {
		case 'toastAdded': {
			const generateId = deps?.generateId ?? defaultGenerateId;
			const toast: Toast = {
				...action.toast,
				id: generateId(),
				createdAt: Date.now(),
				duration: action.toast.duration !== undefined
					? action.toast.duration
					: state.defaultDuration
			};

			// Add toast to queue
			let newToasts = [...state.toasts, toast];

			// Enforce max toasts limit (remove oldest)
			if (newToasts.length > state.maxToasts) {
				newToasts = newToasts.slice(newToasts.length - state.maxToasts);
			}

			const newState: ToastState = {
				...state,
				toasts: newToasts
			};

			// Create auto-dismiss effect if duration is set
			const effects: EffectType<ToastAction>[] = [];

			if (toast.duration && toast.duration > 0) {
				effects.push(
					Effect.afterDelay<ToastAction>(toast.duration, (dispatch) => {
						dispatch({ type: 'toastAutoDismissed', id: toast.id });
					})
				);
			}

			// Call onToastAdded callback
			if (deps?.onToastAdded) {
				effects.push(
					Effect.run<ToastAction>(async () => {
						deps.onToastAdded?.(toast);
					})
				);
			}

			return [
				newState,
				effects.length > 0 ? Effect.batch(...effects) : Effect.none<ToastAction>()
			] as const;
		}

		case 'toastDismissed': {
			const toast = state.toasts.find((t) => t.id === action.id);
			// Idempotent: a second dismiss while already animating out is a no-op,
			// returning the identical state so `dispatchCore` does not notify.
			if (!toast || toast.dismissing) {
				return [state, Effect.none<ToastAction>()];
			}

			// Marked, not removed. The view animates it out and `toastRemoved`
			// takes it away — toasts used to pop out of existence.
			const newState: ToastState = {
				...state,
				toasts: state.toasts.map((t) => (t.id === action.id ? { ...t, dismissing: true } : t))
			};

			return [
				newState,
				Effect.afterDelay<ToastAction>(state.exitDurationMs, (dispatch) =>
					dispatch({ type: 'toastRemoved', id: action.id })
				)
			];
		}

		case 'toastRemoved': {
			const toast = state.toasts.find((t) => t.id === action.id);
			if (!toast) {
				return [state, Effect.none<ToastAction>()];
			}

			const newState: ToastState = {
				...state,
				toasts: state.toasts.filter((t) => t.id !== action.id)
			};

			// The dependency fires here, once, when the toast is actually gone.
			const effect = deps?.onToastDismissed
				? Effect.run<ToastAction>(async () => {
						deps.onToastDismissed?.(toast);
					})
				: Effect.none<ToastAction>();

			return [newState, effect];
		}

		case 'toastAutoDismissed':
			// Same path as a manual dismiss, so an auto-dismissed toast animates
			// out too rather than vanishing.
			return toastReducer(state, { type: 'toastDismissed', id: action.id }, deps);

		case 'toastActionClicked': {
			const toast = state.toasts.find((t) => t.id === action.id);
			if (!toast || !toast.action) {
				return [state, Effect.none<ToastAction>()];
			}

			// Run the action, then dismiss through the normal path so it animates
			// out and fires `onToastDismissed` exactly once, in one place.
			const [dismissedState, dismissEffect] = toastReducer(
				state,
				{ type: 'toastDismissed', id: action.id },
				deps
			);

			return [
				dismissedState,
				Effect.batch(
					Effect.run<ToastAction>(async () => {
						toast.action?.onClick();
					}),
					dismissEffect
				)
			];
		}

		case 'allToastsDismissed': {
			const dismissedToasts = state.toasts;

			const newState: ToastState = {
				...state,
				toasts: []
			};

			// Call onToastDismissed for each toast
			const effect = deps?.onToastDismissed
				? Effect.run<ToastAction>(async () => {
						dismissedToasts.forEach((toast) => {
							deps.onToastDismissed?.(toast);
						});
					})
				: Effect.none<ToastAction>();

			return [newState, effect];
		}

		case 'maxToastsChanged': {
			let newToasts = state.toasts;

			// If reducing max toasts, remove oldest toasts
			if (action.maxToasts < state.toasts.length) {
				newToasts = state.toasts.slice(state.toasts.length - action.maxToasts);
			}

			return [
				{
					...state,
					maxToasts: action.maxToasts,
					toasts: newToasts
				},
				Effect.none<ToastAction>()
			];
		}

		case 'defaultDurationChanged': {
			return [
				{
					...state,
					defaultDuration: action.duration
				},
				Effect.none<ToastAction>()
			];
		}

		case 'positionChanged': {
			return [
				{
					...state,
					position: action.position
				},
				Effect.none<ToastAction>()
			];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none<ToastAction>()];
		}
	}
};
