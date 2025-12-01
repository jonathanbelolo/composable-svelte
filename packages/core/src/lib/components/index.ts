/**
 * UI Components - Combined Entry Point
 *
 * This module re-exports from all component submodules.
 *
 * NOTE: Due to potential naming conflicts between submodules (e.g., `Pagination`
 * type from data-table vs `Pagination` component from UI), we recommend importing
 * from specific submodule paths for better clarity:
 *
 * - @composable-svelte/core/components/ui
 * - @composable-svelte/core/components/form
 * - @composable-svelte/core/components/command
 * - @composable-svelte/core/components/data-table
 * - @composable-svelte/core/components/toast
 * - @composable-svelte/core/components/image-gallery
 *
 * @packageDocumentation
 */

// UI Components - all exports
export * from './ui/index.js';

// Form components
export * from './form/index.js';

// Command components (already re-exported from ui, but explicit for clarity)
// export * from './command/index.js';

// Data table - explicit exports to rename Pagination type and avoid conflict
export {
	createTableReducer,
	createInitialState,
	DataTable,
	DataTableHeader,
	DataTablePagination
} from './data-table/index.js';

export type {
	TableState,
	TableAction,
	TableConfig,
	ColumnSort,
	ColumnFilter,
	FilterOperator,
	Pagination as TablePagination,
	SortDirection
} from './data-table/index.js';

// Toast components (already re-exported from ui, but explicit for clarity)
// export * from './toast/index.js';

// Image gallery components
export * from './image-gallery/index.js';
