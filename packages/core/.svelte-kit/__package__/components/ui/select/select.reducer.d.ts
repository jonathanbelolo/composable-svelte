/**
 * Select Reducer
 *
 * State management for select component with search and multi-select.
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { SelectState, SelectAction, SelectDependencies } from './select.types.js';
/**
 * Select reducer with search and multi-select support.
 *
 * Handles:
 * - Open/close/toggle
 * - Single and multi-select
 * - Search/filter options
 * - Keyboard navigation
 * - Selection callbacks
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialSelectState(options),
 *   reducer: selectReducer,
 *   dependencies: {
 *     onChange: (value) => console.log('Selected:', value)
 *   }
 * });
 * ```
 */
export declare const selectReducer: Reducer<SelectState<any>, SelectAction<any>, SelectDependencies<any>>;
//# sourceMappingURL=select.reducer.d.ts.map