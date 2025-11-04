/**
 * Pagination Types
 *
 * State management types for pagination component.
 *
 * @packageDocumentation
 */
/**
 * Create initial pagination state.
 */
export function createInitialPaginationState(totalItems, itemsPerPage = 10, currentPage = 1, maxPageButtons = 7) {
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    return {
        currentPage: Math.max(1, Math.min(currentPage, totalPages)),
        totalItems,
        itemsPerPage,
        totalPages,
        maxPageButtons
    };
}
