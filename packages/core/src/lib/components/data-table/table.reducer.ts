/**
 * DataTable Reducer
 *
 * State management for the DataTable component following Composable Architecture patterns.
 */

import type { Reducer } from '../../types.js';
import { Effect } from '../../effect.js';
import type {
	TableState,
	TableAction,
	TableConfig,
	ColumnFilter
} from './table.types.js';

/**
 * Creates initial table state from configuration.
 */
export function createInitialState<T>(config: TableConfig<T>): TableState<T> {
	const initialData = config.initialData || [];
	const pageSize = validPageSize(config.pageSize) ? config.pageSize : 10;
	const total = config.serverSide ? validTotal(config.initialTotal, initialData.length) : initialData.length;

	let page = 0;
	if (config.initialPage !== undefined && Number.isFinite(config.initialPage)) {
		page = clampPage(config.initialPage, total, pageSize);
	}

	// Apply initial pagination
	const paginatedData = config.serverSide
		? initialData
		: initialData.slice(page * pageSize, (page + 1) * pageSize);

	return {
		data: paginatedData,
		originalData: initialData,
		sorting: [],
		filters: [],
		pagination: {
			page,
			pageSize,
			total
		},
		selectedRows: new Set(),
		isLoading: false,
		error: null
	};
}

/**
 * Applies filters to data array.
 */
function applyFilters<T>(data: T[], filters: ColumnFilter<T>[]): T[] {
	if (filters.length === 0) return data;

	return data.filter((row) => {
		return filters.every((filter) => {
			const value = row[filter.column];
			const filterValue = filter.value;

			switch (filter.operator) {
				case 'equals':
					return value === filterValue;
				case 'notEquals':
					return value !== filterValue;
				case 'contains':
					return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
				case 'notContains':
					return !String(value).toLowerCase().includes(String(filterValue).toLowerCase());
				case 'startsWith':
					return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
				case 'endsWith':
					return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
				case 'greaterThan':
					return Number(value) > Number(filterValue);
				case 'lessThan':
					return Number(value) < Number(filterValue);
				case 'greaterThanOrEqual':
					return Number(value) >= Number(filterValue);
				case 'lessThanOrEqual':
					return Number(value) <= Number(filterValue);
				case 'in':
					return Array.isArray(filterValue) && filterValue.includes(value);
				case 'notIn':
					return Array.isArray(filterValue) && !filterValue.includes(value);
				default:
					return true;
			}
		});
	});
}

/**
 * Applies sorting to data array (stable sort).
 */
function applySorting<T>(data: T[], sorting: { column: keyof T; direction: 'asc' | 'desc' }[]): T[] {
	if (sorting.length === 0) return data;

	// Create a copy to avoid mutation
	const sorted = [...data];

	// Stable multi-column sort
	sorted.sort((a, b) => {
		for (const sort of sorting) {
			const aVal = a[sort.column];
			const bVal = b[sort.column];

			let comparison = 0;

			// Handle different types
			if (typeof aVal === 'string' && typeof bVal === 'string') {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else if (aVal instanceof Date && bVal instanceof Date) {
				comparison = aVal.getTime() - bVal.getTime();
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			if (comparison !== 0) {
				return sort.direction === 'asc' ? comparison : -comparison;
			}
		}

		return 0;
	});

	return sorted;
}

/**
 * Applies pagination to data array.
 */
function applyPagination<T>(data: T[], page: number, pageSize: number): T[] {
	const start = page * pageSize;
	const end = start + pageSize;
	return data.slice(start, end);
}

/** Validate pagination bounds before changing the query. */
function validPageSize(value: number | undefined): value is number {
	return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function validTotal(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function clampPage(page: number, total: number, pageSize: number): number {
	return Math.max(0, Math.min(Math.floor(page), Math.max(0, Math.ceil(total / pageSize) - 1)));
}

function queryChanged<T>(prev: TableState<T>, next: TableState<T>): boolean {
	if (prev.pagination.page !== next.pagination.page) return true;
	if (prev.pagination.pageSize !== next.pagination.pageSize) return true;
	if (prev.sorting.length !== next.sorting.length) return true;
	for (let i = 0; i < prev.sorting.length; i++) {
		if (
			prev.sorting[i]!.column !== next.sorting[i]!.column ||
			prev.sorting[i]!.direction !== next.sorting[i]!.direction
		) {
			return true;
		}
	}
	if (prev.filters.length !== next.filters.length) return true;
	for (let i = 0; i < prev.filters.length; i++) {
		const pf = prev.filters[i]!;
		const nf = next.filters[i]!;
		if (pf.column !== nf.column || pf.operator !== nf.operator || !Object.is(pf.value, nf.value)) {
			return true;
		}
	}
	return false;
}

function getPageOutOfRangeMessage<T>(config: TableConfig<T>, state: TableState<T>): string {
	if (typeof config.pageOutOfRangeMessage === 'function') {
		return config.pageOutOfRangeMessage(state);
	}
	if (typeof config.pageOutOfRangeMessage === 'string') {
		return config.pageOutOfRangeMessage;
	}
	return 'The requested page is no longer available. Refresh to load the current page.';
}

/** Derive page rows and total from one filter pass; never mutate the previous state. */
function processData<T>(state: TableState<T>): TableState<T> {
	const filtered = applyFilters(state.originalData, state.filters);
	const pagination = {
		...state.pagination,
		total: filtered.length,
		page: clampPage(state.pagination.page, filtered.length, state.pagination.pageSize)
	};
	const sorted = applySorting(filtered, state.sorting);
	return {
		...state,
		pagination,
		data: applyPagination(sorted, pagination.page, pagination.pageSize)
	};
}

/**
 * Creates a DataTable reducer with the given configuration.
 */
export function createTableReducer<T>(config: TableConfig<T> = {}): Reducer<TableState<T>, TableAction<T>, {}> {
	const getRowId = config.getRowId || ((row: T) => String((row as any).id));
	const serverSide = config.serverSide || false;

	function refresh(state: TableState<T>, correctionPending = false): ReturnType<Reducer<TableState<T>, TableAction<T>, {}>> {
		if (!config.fetchData) return [state, Effect.none()];
		const requestVersion = (state.requestVersion ?? 0) + 1;
		const loadingState: TableState<T> = {
			...state,
			isLoading: true,
			error: null,
			errorReason: null,
			needsRefresh: false,
			correctionPending,
			requestVersion
		};
		return [loadingState, Effect.run<TableAction<T>>(async (dispatch, signal) => {
			let result: { data: T[]; total: number } | undefined;
			let error: unknown;
			let failed = false;
			try {
				result = await config.fetchData!(loadingState, signal);
				if (!result || !Array.isArray(result.data)) throw new TypeError('fetchData must return an object with a data array');
			} catch (err) {
				error = err;
				failed = true;
			}
			if (signal?.aborted) return;
			if (failed) {
				dispatch({
					type: 'dataLoadFailed',
					error: error instanceof Error ? error.message : 'Unknown error',
					requestVersion
				});
			} else if (result !== undefined) {
				dispatch({
					type: 'dataLoaded',
					data: result.data,
					total: result.total,
					requestVersion
				});
			}
		})];
	}

	function handleQueryAction(
		state: TableState<T>,
		updater: (s: TableState<T>) => TableState<T>
	): readonly [TableState<T>, Effect<TableAction<T>>] {
		const candidate = updater(state);
		if (!queryChanged(state, candidate)) {
			return [state, Effect.none()];
		}

		let updatedState: TableState<T> = {
			...candidate,
			...(serverSide ? { requestVersion: (state.requestVersion ?? 0) + 1 } : {}),
			isLoading: serverSide ? false : state.isLoading,
			...(serverSide ? { needsRefresh: true, data: [] } : {}),
			...(state.errorReason === 'page-out-of-range' ? {error: null, errorReason: null} : {})
		};

		if (serverSide && state.correctionPending) {
			updatedState.correctionPending = false;
		}

		if (!serverSide) {
			updatedState = processData(updatedState);
		}

		return [updatedState, Effect.none()];
	}

	return (state, action) => {
		if (action.type === 'pageSizeChanged' && !validPageSize(action.pageSize)) return [state, Effect.none()];
		if (action.type === 'pageChanged' && !Number.isFinite(action.page)) return [state, Effect.none()];

		switch (action.type) {
			// Data actions
			case 'dataLoaded': {
				if (action.requestVersion !== undefined && action.requestVersion !== state.requestVersion) return [state, Effect.none()];
				const newData = action.data;
				let updatedState: TableState<T> = {
					...state,
					originalData: newData,
					data: newData,
					isLoading: false,
					error: null,
					errorReason: null,
					needsRefresh: false,
					correctionPending: false,
					requestVersion: (state.requestVersion ?? 0) + 1,
					pagination: { ...state.pagination, total: serverSide ? validTotal(action.total, newData.length) : newData.length }
				};

				if (!serverSide) {
					const liveIds = new Set(newData.map(getRowId));
					updatedState.selectedRows = new Set([...state.selectedRows].filter((id) => liveIds.has(id)));
					updatedState = processData(updatedState);
				} else {
					if (action.total !== undefined && Number.isSafeInteger(action.total) && action.total >= 0) {
						const page = clampPage(state.pagination.page, updatedState.pagination.total, state.pagination.pageSize);
						if (page !== state.pagination.page) {
							updatedState = { ...updatedState, data: [], originalData: [], pagination: { ...updatedState.pagination, page } };
							// Returned rows belong to the old page. Never relabel them as the clamped page.
							if (updatedState.pagination.total > 0) {
								if (config.fetchData && action.requestVersion !== undefined && !state.correctionPending) {
									updatedState.correctionPending = true;
									return refresh(updatedState, true);
								}
								updatedState.error = getPageOutOfRangeMessage(config, updatedState);
								updatedState.errorReason = 'page-out-of-range';
				updatedState.needsRefresh = true;
							}
						}
					}
				}

				return [updatedState, Effect.none()];
			}

			case 'dataLoadFailed': {
				if (action.requestVersion !== undefined && action.requestVersion !== state.requestVersion) return [state, Effect.none()];
				return [
					{
						...state,
						isLoading: false,
						error: action.error,
						errorReason: 'load-failed',
						needsRefresh: serverSide,
						correctionPending: false,
						requestVersion: (state.requestVersion ?? 0) + 1
					},
					Effect.none()
				];
			}

			case 'refreshTriggered':
				return refresh(state);

			// Sorting actions
			case 'sortChanged': {
				return handleQueryAction(state, (s) => {
					let newSorting = [...s.sorting];
					const existingIndex = newSorting.findIndex((item) => item.column === action.column);
					if (config.multiSort) {
						if (existingIndex >= 0) {
							newSorting[existingIndex] = { column: action.column, direction: action.direction };
						} else {
							newSorting.push({ column: action.column, direction: action.direction });
						}
					} else {
						newSorting = [{ column: action.column, direction: action.direction }];
					}
					return {
						...s,
						sorting: newSorting,
						pagination: {
							...s.pagination,
							page: 0
						}
					};
				});
			}

			case 'sortCleared': {
				return handleQueryAction(state, (s) => ({
					...s,
					sorting: []
				}));
			}

			// Filtering actions
			case 'filterAdded': {
				return handleQueryAction(state, (s) => {
					const existing = s.filters.findIndex(f => f.column === action.filter.column);
					const newFilters = [...s.filters];
					if (existing < 0) newFilters.push(action.filter);
					else newFilters[existing] = action.filter;
					return {
						...s,
						filters: newFilters,
						pagination: {
							...s.pagination,
							page: 0
						}
					};
				});
			}

			case 'filterRemoved': {
				return handleQueryAction(state, (s) => ({
					...s,
					filters: s.filters.filter((f) => f.column !== action.column)
				}));
			}

			case 'filtersCleared': {
				return handleQueryAction(state, (s) => ({
					...s,
					filters: []
				}));
			}

			// Pagination actions
			case 'pageChanged': {
				return handleQueryAction(state, (s) => {
					const newPage = clampPage(action.page, s.pagination.total, s.pagination.pageSize);
					return {
						...s,
						pagination: {
							...s.pagination,
							page: newPage
						}
					};
				});
			}

			case 'pageSizeChanged': {
				return handleQueryAction(state, (s) => ({
					...s,
					pagination: {
						...s.pagination,
						pageSize: action.pageSize,
						page: 0
					}
				}));
			}

			// Selection actions
			case 'rowSelected': {
				const newSelection = new Set(state.selectedRows);
				newSelection.add(action.rowId);

				return [
					{
						...state,
						selectedRows: newSelection
					},
					Effect.none()
				];
			}

			case 'rowDeselected': {
				const newSelection = new Set(state.selectedRows);
				newSelection.delete(action.rowId);

				return [
					{
						...state,
						selectedRows: newSelection
					},
					Effect.none()
				];
			}

			case 'allRowsSelected': {
				const allRowIds = new Set(state.data.map(getRowId));

				return [
					{
						...state,
						selectedRows: allRowIds
					},
					Effect.none()
				];
			}

			case 'selectionCleared': {
				return [
					{
						...state,
						selectedRows: new Set()
					},
					Effect.none()
				];
			}

			default: {
				const _exhaustive: never = action;
				return [state, Effect.none()];
			}
		}
	};
}
