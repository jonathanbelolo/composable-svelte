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
	 * Filtered dataset row count in client mode; server total when supplied, otherwise legacy page-length fallback.
	 */
	total: number;
}

/**
 * DataTable state.
 *
 * @template T - The row data type
 */
export interface TableState<T> {
	/** Internal monotonic refresh/query revision; stale effect results cannot overwrite newer state. */
	requestVersion?: number | undefined;

	/** Server query needs an explicit refresh. Query changes clear previous-query rows.
	 * Also true after a failed fetch: this is status, not an automatic retry instruction.
	 * Dispatch refreshTriggered explicitly; automatic retries require a bounded retry policy. */
	needsRefresh?: boolean | undefined;

	/** Internal flag indicating a corrective fetch for a clamped server page is pending. */
	correctionPending?: boolean | undefined;

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
	 * Error state (if data loading failed or page out of range).
	 */
	error: string | null;

	/**
	 * Typed reason for the current error state.
	 */
	errorReason?: 'page-out-of-range' | 'load-failed' | null | undefined;
}

/**
 * DataTable actions.
 *
 * @template T - The row data type
 */
export type TableAction<T> =
	// Data actions
	| {
			type: 'dataLoaded';
			data: T[];
			/** Server-reported count; client mode computes its filtered dataset total. */
			total?: number | undefined;
			/** Framework refresh correlation. Omit for an authoritative externally supplied dataset. */
			requestVersion?: number | undefined;
	  }
	| { type: 'dataLoadFailed'; error: string; requestVersion?: number | undefined }
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
	 * Initial data (for client-side tables or initial server page).
	 */
	initialData?: T[];

	/** Server-reported total for an initial server page. Ignored in client mode. */
	initialTotal?: number | undefined;

	/** Initial page index (0-indexed, default: 0). Clamped to valid page range based on total and pageSize.
	 * Server pages beyond the initial rows require initialTotal. */
	initialPage?: number | undefined;

	/**
	 * Row ID accessor function (default: uses 'id' field).
	 */
	getRowId?: (row: T) => string;

	/**
	 * Initial positive integer page size (default: 10; invalid values use the default).
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
	 * Configurable error message or pure presentation generator when a requested page is out of range.
	 * The generator runs during reduction and must be deterministic and side-effect free.
	 */
	pageOutOfRangeMessage?: string | ((state: TableState<T>) => string) | undefined;

	/**
	 * Data fetcher. Newer refreshes and server query changes supersede older results.
	 * Client query changes retain the pending full dataset request.
	 * A shrinking server total clamps the page and refetches the corrected page.
	 * The optional signal ends with the owning effect/store; supersession gates results
	 * but does not promise transport cancellation. Ordinary query actions do not auto-fetch.
	 */
	fetchData?: (state: TableState<T>, signal?: AbortSignal) => Promise<{ data: T[]; total: number }>;
}
