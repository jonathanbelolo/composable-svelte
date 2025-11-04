/**
 * Accordion Reducer
 *
 * State management for accordion component (collapsible sections).
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { AccordionState, AccordionAction, AccordionDependencies } from './accordion.types.js';
/**
 * Accordion reducer with expand/collapse logic.
 *
 * Handles:
 * - Single and multiple item expansion
 * - Radio behavior (single item at a time)
 * - Expand all / collapse all
 * - Disabled items
 * - Callbacks for expand/collapse
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialAccordionState(items),
 *   reducer: accordionReducer,
 *   dependencies: {
 *     onExpand: (id) => console.log('Expanded:', id),
 *     onCollapse: (id) => console.log('Collapsed:', id)
 *   }
 * });
 * ```
 */
export declare const accordionReducer: Reducer<AccordionState, AccordionAction, AccordionDependencies>;
//# sourceMappingURL=accordion.reducer.d.ts.map