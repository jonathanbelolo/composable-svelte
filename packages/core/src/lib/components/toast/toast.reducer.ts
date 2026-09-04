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

			// Enforce the cap, evicting toasts that are already animating out
			// FIRST. Two problems appeared once removal was deferred: a toast
			// mid-dismissal held a slot and a fully live one was evicted in its
			// place, and a dismissing toast sliced out here never reached
			// `toastRemoved`, so `onToastDismissed` fired zero times for a
			// dismissal the user had actually performed.
			//
			// Evicted dismissing toasts are reported here instead, so the
			// callback fires exactly once on every path.
			const evicted: Toast[] = [];
			while (newToasts.length > state.maxToasts) {
				const victimIndex = newToasts.findIndex((t) => t.dismissing);
				const index = victimIndex === -1 ? 0 : victimIndex;
				evicted.push(newToasts[index]!);
				newToasts = [...newToasts.slice(0, index), ...newToasts.slice(index + 1)];
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

			// Report any dismissal the cap cut short, so `onToastDismissed` fires
			// exactly once per dismissed toast on every path.
			for (const victim of evicted) {
				if (victim.dismissing && deps?.onToastDismissed) {
					effects.push(
						Effect.run<ToastAction>(async () => {
							deps.onToastDismissed?.(victim);
						})
					);
				}
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
			// `dismissing` guard, matching `toastDismissed`. Removal is deferred
			// for the exit animation, so the action button stays in the DOM and
			// clickable for that whole window — without this a second click
			// re-ran `onClick`, which for an "Undo" or "Retry" is a data bug.
			if (!toast || !toast.action || toast.dismissing) {
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
			// Marks, like every other dismissal path. Clearing the array outright
			// meant these toasts still popped out of existence with no exit
			// animation — the very thing the two-step dismissal exists to fix,
			// left unfixed on this path.
			const pending = state.toasts.filter((t) => !t.dismissing);
			if (pending.length === 0) {
				return [state, Effect.none<ToastAction>()];
			}

			const newState: ToastState = {
				...state,
				toasts: state.toasts.map((t) => (t.dismissing ? t : { ...t, dismissing: true }))
			};

			return [
				newState,
				Effect.batch(
					...pending.map((toast) =>
						Effect.afterDelay<ToastAction>(state.exitDurationMs, (dispatch) =>
							dispatch({ type: 'toastRemoved', id: toast.id })
						)
					)
				)
			];
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
