/**
 * Pagination component - Page navigation with smart button generation.
 *
 * Uses Composable Architecture pattern with reducer and store for
 * state management.
 *
 * @example
 * ```svelte
 * <Pagination
 *   totalItems={100}
 *   itemsPerPage={10}
 *   bind:currentPage={page}
 *   onPageChange={(page) => console.log('Page:', page)}
 * />
 * ```
 */
interface PaginationProps {
    /**
     * Total number of items.
     */
    totalItems: number;
    /**
     * Number of items per page.
     */
    itemsPerPage?: number;
    /**
     * Current page (1-indexed). Use bind:currentPage for two-way binding.
     */
    currentPage?: number;
    /**
     * Maximum number of page buttons to show.
     */
    maxPageButtons?: number;
    /**
     * Show items per page selector.
     */
    showItemsPerPage?: boolean;
    /**
     * Items per page options.
     */
    itemsPerPageOptions?: number[];
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Callback when page changes.
     */
    onPageChange?: (page: number) => void;
    /**
     * Callback when items per page changes.
     */
    onItemsPerPageChange?: (itemsPerPage: number) => void;
}
declare const Pagination: import("svelte").Component<PaginationProps, {}, "currentPage">;
type Pagination = ReturnType<typeof Pagination>;
export default Pagination;
//# sourceMappingURL=Pagination.svelte.d.ts.map