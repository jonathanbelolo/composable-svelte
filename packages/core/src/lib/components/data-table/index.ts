/**
 * DataTable System Exports
 */

// Reducer and state management
export { createTableReducer, createInitialState } from './table.reducer.js';
export type {
	TableState,
	TableAction,
	TableConfig,
	ColumnSort,
	ColumnFilter,
	FilterOperator,
	Pagination,
	SortDirection
} from './table.types.js';

// Components
export { default as DataTable } from './DataTable.svelte';
export { default as DataTableHeader } from './DataTableHeader.svelte';
export { default as DataTablePagination } from './DataTablePagination.svelte';
