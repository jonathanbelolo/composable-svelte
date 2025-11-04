/**
 * Collapsible Reducer
 *
 * State management for collapsible component (single expandable section).
 *
 * @packageDocumentation
 */
import { Effect } from '../../../effect.js';
/**
 * Collapsible reducer with expand/collapse logic.
 *
 * Handles:
 * - Toggle between expanded/collapsed
 * - Explicit expand/collapse
 * - Disabled state
 * - Callbacks for expand/collapse
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialCollapsibleState(false),
 *   reducer: collapsibleReducer,
 *   dependencies: {
 *     onExpand: () => console.log('Expanded'),
 *     onCollapse: () => console.log('Collapsed')
 *   }
 * });
 * ```
 */
export const collapsibleReducer = (state, action, deps) => {
    switch (action.type) {
        case 'toggled': {
            if (state.disabled) {
                return [state, Effect.none()];
            }
            const newIsExpanded = !state.isExpanded;
            const effect = newIsExpanded && deps?.onExpand
                ? Effect.run(async () => {
                    deps.onExpand?.();
                })
                : !newIsExpanded && deps?.onCollapse
                    ? Effect.run(async () => {
                        deps.onCollapse?.();
                    })
                    : Effect.none();
            return [
                {
                    ...state,
                    isExpanded: newIsExpanded
                },
                effect
            ];
        }
        case 'expanded': {
            if (state.disabled || state.isExpanded) {
                return [state, Effect.none()];
            }
            const effect = deps?.onExpand
                ? Effect.run(async () => {
                    deps.onExpand?.();
                })
                : Effect.none();
            return [
                {
                    ...state,
                    isExpanded: true
                },
                effect
            ];
        }
        case 'collapsed': {
            if (state.disabled || !state.isExpanded) {
                return [state, Effect.none()];
            }
            const effect = deps?.onCollapse
                ? Effect.run(async () => {
                    deps.onCollapse?.();
                })
                : Effect.none();
            return [
                {
                    ...state,
                    isExpanded: false
                },
                effect
            ];
        }
        case 'disabledChanged': {
            return [
                {
                    ...state,
                    disabled: action.disabled
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
