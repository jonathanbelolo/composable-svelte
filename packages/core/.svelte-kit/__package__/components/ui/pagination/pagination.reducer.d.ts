/**
 * Pagination Reducer
 *
 * State management for pagination component.
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { PaginationState, PaginationAction, PaginationDependencies } from './pagination.types.js';
/**
 * Pagination reducer with page navigation and items per page control.
 *
 * Handles:
 * - Page navigation (first, previous, next, last, direct)
 * - Items per page changes
 * - Total items updates
 * - Callbacks via Effect system
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialPaginationState(100, 10),
 *   reducer: paginationReducer,
 *   dependencies: {
 *     onPageChange: (page) => console.log('Page:', page)
 *   }
 * });
 * ```
 */
export declare const paginationReducer: Reducer<PaginationState, PaginationAction, PaginationDependencies>;
//# sourceMappingURL=pagination.reducer.d.ts.map