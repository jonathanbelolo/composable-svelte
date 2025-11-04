/**
 * Dropdown Menu Reducer
 *
 * State management for dropdown menu with keyboard navigation.
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { DropdownMenuState, DropdownMenuAction, DropdownMenuDependencies } from './dropdown-menu.types.js';
/**
 * Dropdown menu reducer with keyboard navigation.
 *
 * Handles:
 * - Open/close/toggle
 * - Arrow key navigation (skip disabled items)
 * - Home/End navigation
 * - Enter to select
 * - Escape to close
 * - Item selection with onSelect callback
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialDropdownMenuState(items),
 *   reducer: dropdownMenuReducer,
 *   dependencies: {
 *     onSelect: (item) => console.log('Selected:', item.label)
 *   }
 * });
 *
 * // User clicks trigger
 * store.dispatch({ type: 'toggled' });
 *
 * // User presses arrow down
 * store.dispatch({ type: 'arrowDown' });
 *
 * // User presses enter
 * store.dispatch({ type: 'itemSelected', index: store.state.highlightedIndex });
 * ```
 */
export declare const dropdownMenuReducer: Reducer<DropdownMenuState, DropdownMenuAction, DropdownMenuDependencies>;
//# sourceMappingURL=dropdown-menu.reducer.d.ts.map