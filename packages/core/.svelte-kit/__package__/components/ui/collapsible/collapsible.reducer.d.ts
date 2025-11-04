/**
 * Collapsible Reducer
 *
 * State management for collapsible component (single expandable section).
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { CollapsibleState, CollapsibleAction, CollapsibleDependencies } from './collapsible.types.js';
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
export declare const collapsibleReducer: Reducer<CollapsibleState, CollapsibleAction, CollapsibleDependencies>;
//# sourceMappingURL=collapsible.reducer.d.ts.map