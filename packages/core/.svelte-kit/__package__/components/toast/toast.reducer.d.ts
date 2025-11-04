/**
 * Toast Reducer
 *
 * Manages toast notification state including queue management and auto-dismiss.
 */
import type { Reducer } from '../../types.js';
import type { ToastState, ToastAction, ToastDependencies } from './toast.types.js';
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
export declare const toastReducer: Reducer<ToastState, ToastAction, ToastDependencies>;
//# sourceMappingURL=toast.reducer.d.ts.map