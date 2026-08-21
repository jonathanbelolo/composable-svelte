import { createStore } from '../../store.svelte.js';
import type { Store } from '../../types.js';
import { toastReducer } from './toast.reducer.js';
import {
	createInitialToastState,
	type ToastState,
	type ToastAction,
	type ToastDependencies
} from './toast.types.js';

/**
 * Build a toast store to hand to `<Toaster {store} />`.
 *
 * This is the blessed path, and it is what makes `dependencies` reachable at
 * all. `Toaster` used to accept a `dependencies` prop and attach it to a store
 * nothing could dispatch into — `onToastAdded`, `onToastDismissed` and
 * `generateId` could never fire. Owning the store is the whole fix: you
 * dispatch `toastAdded` into it, and the same store drives the view.
 *
 * @example
 * ```typescript
 * const toasts = createToastStore({ position: 'top-right' });
 * toasts.dispatch({ type: 'toastAdded', toast: { variant: 'success', description: 'Saved!' } });
 * ```
 */
export function createToastStore(config?: {
	maxToasts?: number;
	defaultDuration?: number;
	position?: ToastState['position'];
	exitDurationMs?: number;
	dependencies?: ToastDependencies;
}): Store<ToastState, ToastAction> {
	return createStore({
		initialState: createInitialToastState(config),
		reducer: toastReducer,
		dependencies: config?.dependencies
	});
}
