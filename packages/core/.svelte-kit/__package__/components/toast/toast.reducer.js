/**
 * Toast Reducer
 *
 * Manages toast notification state including queue management and auto-dismiss.
 */
import { Effect } from '../../effect.js';
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
export const toastReducer = (state, action, deps) => {
    switch (action.type) {
        case 'toastAdded': {
            const generateId = deps?.generateId ?? defaultGenerateId;
            const toast = {
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
            const newState = {
                ...state,
                toasts: newToasts
            };
            // Create auto-dismiss effect if duration is set
            const effects = [];
            if (toast.duration && toast.duration > 0) {
                effects.push(Effect.afterDelay(toast.duration, (dispatch) => {
                    dispatch({ type: 'toastAutoDismissed', id: toast.id });
                }));
            }
            // Call onToastAdded callback
            if (deps?.onToastAdded) {
                effects.push(Effect.run(async () => {
                    deps.onToastAdded?.(toast);
                }));
            }
            return [
                newState,
                effects.length > 0 ? Effect.batch(...effects) : Effect.none()
            ];
        }
        case 'toastDismissed': {
            const toast = state.toasts.find((t) => t.id === action.id);
            if (!toast) {
                return [state, Effect.none()];
            }
            const newState = {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.id)
            };
            // Call onToastDismissed callback
            const effect = deps?.onToastDismissed
                ? Effect.run(async () => {
                    deps.onToastDismissed?.(toast);
                })
                : Effect.none();
            return [newState, effect];
        }
        case 'toastAutoDismissed': {
            const toast = state.toasts.find((t) => t.id === action.id);
            if (!toast) {
                return [state, Effect.none()];
            }
            const newState = {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.id)
            };
            // Call onToastDismissed callback
            const effect = deps?.onToastDismissed
                ? Effect.run(async () => {
                    deps.onToastDismissed?.(toast);
                })
                : Effect.none();
            return [newState, effect];
        }
        case 'toastActionClicked': {
            const toast = state.toasts.find((t) => t.id === action.id);
            if (!toast || !toast.action) {
                return [state, Effect.none()];
            }
            // Execute the action and dismiss the toast
            const newState = {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.id)
            };
            const effects = [
                Effect.run(async () => {
                    toast.action?.onClick();
                })
            ];
            if (deps?.onToastDismissed) {
                effects.push(Effect.run(async () => {
                    deps.onToastDismissed?.(toast);
                }));
            }
            return [newState, Effect.batch(...effects)];
        }
        case 'allToastsDismissed': {
            const dismissedToasts = state.toasts;
            const newState = {
                ...state,
                toasts: []
            };
            // Call onToastDismissed for each toast
            const effect = deps?.onToastDismissed
                ? Effect.run(async () => {
                    dismissedToasts.forEach((toast) => {
                        deps.onToastDismissed?.(toast);
                    });
                })
                : Effect.none();
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
                Effect.none()
            ];
        }
        case 'defaultDurationChanged': {
            return [
                {
                    ...state,
                    defaultDuration: action.duration
                },
                Effect.none()
            ];
        }
        case 'positionChanged': {
            return [
                {
                    ...state,
                    position: action.position
                },
                Effect.none()
            ];
        }
        default: {
            const _exhaustive = action;
            return [state, Effect.none()];
        }
    }
};
