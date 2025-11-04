/**
 * Pagination Types
 *
 * State management types for pagination component.
 *
 * @packageDocumentation
 */
/**
 * Pagination state.
 */
export interface PaginationState {
    /**
     * Current page number (1-indexed).
     */
    currentPage: number;
    /**
     * Total number of items.
     */
    totalItems: number;
    /**
     * Number of items per page.
     */
    itemsPerPage: number;
    /**
     * Total number of pages (computed).
     */
    totalPages: number;
    /**
     * Maximum number of page buttons to show.
     */
    maxPageButtons: number;
}
/**
 * Pagination actions.
 */
export type PaginationAction = {
    type: 'pageChanged';
    page: number;
} | {
    type: 'nextPage';
} | {
    type: 'previousPage';
} | {
    type: 'firstPage';
} | {
    type: 'lastPage';
} | {
    type: 'itemsPerPageChanged';
    itemsPerPage: number;
} | {
    type: 'totalItemsChanged';
    totalItems: number;
};
/**
 * Pagination dependencies.
 */
export interface PaginationDependencies {
    /**
     * Callback when page changes.
     */
    onPageChange?: (page: number) => void;
    /**
     * Callback when items per page changes.
     */
    onItemsPerPageChange?: (itemsPerPage: number) => void;
}
/**
 * Create initial pagination state.
 */
export declare function createInitialPaginationState(totalItems: number, itemsPerPage?: number, currentPage?: number, maxPageButtons?: number): PaginationState;
//# sourceMappingURL=pagination.types.d.ts.map