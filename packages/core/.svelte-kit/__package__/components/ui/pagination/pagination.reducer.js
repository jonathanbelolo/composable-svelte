/**
 * Pagination Reducer
 *
 * State management for pagination component.
 *
 * @packageDocumentation
 */
import { Effect } from '../../../effect.js';
/**
 * Recompute total pages when totalItems or itemsPerPage changes.
 */
function recomputeTotalPages(state) {
    const totalPages = Math.max(1, Math.ceil(state.totalItems / state.itemsPerPage));
    const currentPage = Math.max(1, Math.min(state.currentPage, totalPages));
    return {
        ...state,
        totalPages,
        currentPage
    };
}
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
export const paginationReducer = (state, action, deps) => {
    switch (action.type) {
        case 'pageChanged': {
            const { page } = action;
            // Validate page is within bounds
            if (page < 1 || page > state.totalPages || page === state.currentPage) {
                return [state, Effect.none()];
            }
            const newState = {
                ...state,
                currentPage: page
            };
            if (deps.onPageChange) {
                return [
                    newState,
                    Effect.run(async () => {
                        deps.onPageChange(page);
                    })
                ];
            }
            return [newState, Effect.none()];
        }
        case 'nextPage': {
            if (state.currentPage >= state.totalPages) {
                return [state, Effect.none()];
            }
            const newPage = state.currentPage + 1;
            const newState = {
                ...state,
                currentPage: newPage
            };
            if (deps.onPageChange) {
                return [
                    newState,
                    Effect.run(async () => {
                        deps.onPageChange(newPage);
                    })
                ];
            }
            return [newState, Effect.none()];
        }
        case 'previousPage': {
            if (state.currentPage <= 1) {
                return [state, Effect.none()];
            }
            const newPage = state.currentPage - 1;
            const newState = {
                ...state,
                currentPage: newPage
            };
            if (deps.onPageChange) {
                return [
                    newState,
                    Effect.run(async () => {
                        deps.onPageChange(newPage);
                    })
                ];
            }
            return [newState, Effect.none()];
        }
        case 'firstPage': {
            if (state.currentPage === 1) {
                return [state, Effect.none()];
            }
            const newState = {
                ...state,
                currentPage: 1
            };
            if (deps.onPageChange) {
                return [
                    newState,
                    Effect.run(async () => {
                        deps.onPageChange(1);
                    })
                ];
            }
            return [newState, Effect.none()];
        }
        case 'lastPage': {
            if (state.currentPage === state.totalPages) {
                return [state, Effect.none()];
            }
            const newPage = state.totalPages;
            const newState = {
                ...state,
                currentPage: newPage
            };
            if (deps.onPageChange) {
                return [
                    newState,
                    Effect.run(async () => {
                        deps.onPageChange(newPage);
                    })
                ];
            }
            return [newState, Effect.none()];
        }
        case 'itemsPerPageChanged': {
            const { itemsPerPage } = action;
            if (itemsPerPage < 1 || itemsPerPage === state.itemsPerPage) {
                return [state, Effect.none()];
            }
            const newState = recomputeTotalPages({
                ...state,
                itemsPerPage
            });
            const effects = [];
            // If items per page changes, callback
            if (deps.onItemsPerPageChange) {
                effects.push(Effect.run(async () => {
                    deps.onItemsPerPageChange(itemsPerPage);
                }));
            }
            // If current page changed due to recomputation, callback
            if (newState.currentPage !== state.currentPage && deps.onPageChange) {
                effects.push(Effect.run(async () => {
                    deps.onPageChange(newState.currentPage);
                }));
            }
            return [newState, effects.length > 0 ? Effect.batch(...effects) : Effect.none()];
        }
        case 'totalItemsChanged': {
            const { totalItems } = action;
            if (totalItems < 0 || totalItems === state.totalItems) {
                return [state, Effect.none()];
            }
            const newState = recomputeTotalPages({
                ...state,
                totalItems
            });
            // If current page changed due to recomputation, callback
            if (newState.currentPage !== state.currentPage && deps.onPageChange) {
                return [
                    newState,
                    Effect.run(async () => {
                        deps.onPageChange(newState.currentPage);
                    })
                ];
            }
            return [newState, Effect.none()];
        }
        default:
            return [state, Effect.none()];
    }
};
