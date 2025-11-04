/**
 * Combobox Reducer
 *
 * State management for combobox component (autocomplete with async loading and debounced search).
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { ComboboxState, ComboboxAction, ComboboxDependencies } from './combobox.types.js';
/**
 * Combobox reducer with async loading and debounced search.
 *
 * Handles:
 * - Open/close/toggle
 * - Single selection
 * - Search with debouncing
 * - Async option loading
 * - Keyboard navigation
 * - Selection callbacks
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialComboboxState(options),
 *   reducer: comboboxReducer,
 *   dependencies: {
 *     onChange: (value) => console.log('Selected:', value),
 *     loadOptions: async (query) => await fetchOptions(query)
 *   }
 * });
 * ```
 */
export declare const comboboxReducer: Reducer<ComboboxState, ComboboxAction, ComboboxDependencies>;
//# sourceMappingURL=combobox.reducer.d.ts.map