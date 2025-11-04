import { type Toast, type ToastDependencies } from './toast.types.js';
/**
 * Toaster container component.
 *
 * Manages toast notifications with queue management and auto-dismiss.
 *
 * @example
 * ```typescript
 * import { Toaster, createStore, createInitialToastState, toastReducer } from '@composable-svelte/core';
 *
 * const store = createStore({
 *   initialState: createInitialToastState(),
 *   reducer: toastReducer
 * });
 *
 * // Add toast
 * store.dispatch({
 *   type: 'toastAdded',
 *   toast: { variant: 'success', description: 'Saved!' }
 * });
 * ```
 */
interface ToasterProps {
    /**
     * Optional external toasts to display.
     * If not provided, uses internal store.
     */
    toasts?: Toast[];
    /**
     * Maximum number of toasts to show at once.
     * Default: 3
     */
    maxToasts?: number;
    /**
     * Default auto-dismiss duration in milliseconds.
     * Default: 5000 (5 seconds)
     */
    defaultDuration?: number;
    /**
     * Position of the toaster on screen.
     * Default: 'bottom-right'
     */
    position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Dependencies for toast reducer.
     */
    dependencies?: ToastDependencies;
}
declare const Toaster: import("svelte").Component<ToasterProps, {}, "">;
type Toaster = ReturnType<typeof Toaster>;
export default Toaster;
//# sourceMappingURL=Toaster.svelte.d.ts.map