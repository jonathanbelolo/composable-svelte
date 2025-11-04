/**
 * DataTable Types
 *
 * Type definitions for the DataTable system following Composable Architecture patterns.
 */

/**
 * Sort direction for columns.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Column sorting configuration.
 */
export interface ColumnSort<T> {
	/**
	 * Column key (must be a key of T).
	 */
	column: keyof T;

	/**
	 * Sort direction.
	 */
	direction: SortDirection;
}

/**
 * Filter operator types.
 */
export type FilterOperator =
	| 'equals'
	| 'notEquals'
	| 'contains'
	| 'notContains'
	| 'startsWith'
	| 'endsWith'
	| 'greaterThan'
	| 'lessThan'
	| 'greaterThanOrEqual'
	| 'lessThanOrEqual'
	| 'in'
	| 'notIn';

/**
 * Column filter configuration.
 */
export interface ColumnFilter<T> {
	/**
	 * Column key to filter on.
	 */
	column: keyof T;

	/**
	 * Filter operator.
	 */
	operator: FilterOperator;

	/**
	 * Filter value(s).
	 */
	value: unknown;
}

/**
 * Pagination configuration.
 */
export interface Pagination {
	/**
	 * Current page (0-indexed).
	 */
	page: number;

	/**
	 * Number of items per page.
	 */
	pageSize: number;

	/**
	 * Total number of items (for server-side pagination).
	 */
	total: number;
}

/**
 * DataTable state.
 *
 * @template T - The row data type
 */
export interface TableState<T> {
	/**
	 * Table data rows.
	 */
	data: T[];

	/**
	 * Original unfiltered data (for client-side operations).
	 */
	originalData: T[];

	/**
	 * Current sorting configuration (supports multi-column sort).
	 */
	sorting: ColumnSort<T>[];

	/**
	 * Active filters.
	 */
	filters: ColumnFilter<T>[];

	/**
	 * Pagination state.
	 */
	pagination: Pagination;

	/**
	 * Selected row IDs (using a row ID accessor).
	 */
	selectedRows: Set<string>;

	/**
	 * Loading state.
	 */
	isLoading: boolean;

	/**
	 * Error state (if data loading failed).
	 */
	error: string | null;
}

/**
 * DataTable actions.
 *
 * @template T - The row data type
 */
export type TableAction<T> =
	// Data actions
	| { type: 'dataLoaded'; data: T[] }
	| { type: 'dataLoadFailed'; error: string }
	| { type: 'refreshTriggered' }

	// Sorting actions
	| { type: 'sortChanged'; column: keyof T; direction: SortDirection }
	| { type: 'sortCleared' }

	// Filtering actions
	| { type: 'filterAdded'; filter: ColumnFilter<T> }
	| { type: 'filterRemoved'; column: keyof T }
	| { type: 'filtersCleared' }

	// Pagination actions
	| { type: 'pageChanged'; page: number }
	| { type: 'pageSizeChanged'; pageSize: number }

	// Selection actions
	| { type: 'rowSelected'; rowId: string }
	| { type: 'rowDeselected'; rowId: string }
	| { type: 'allRowsSelected' }
	| { type: 'selectionCleared' };

/**
 * DataTable configuration.
 *
 * @template T - The row data type
 */
export interface TableConfig<T> {
	/**
	 * Initial data (for client-side tables).
	 */
	initialData?: T[];

	/**
	 * Row ID accessor function (default: uses 'id' field).
	 */
	getRowId?: (row: T) => string;

	/**
	 * Initial page size (default: 10).
	 */
	pageSize?: number;

	/**
	 * Enable multi-column sorting (default: false).
	 */
	multiSort?: boolean;

	/**
	 * Server-side mode (if true, sorting/filtering doesn't happen client-side).
	 */
	serverSide?: boolean;

	/**
	 * Data fetcher for server-side tables.
	 */
	fetchData?: (state: TableState<T>) => Promise<{ data: T[]; total: number }>;
}
