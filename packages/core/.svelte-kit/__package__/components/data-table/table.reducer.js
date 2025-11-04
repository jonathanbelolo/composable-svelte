/**
 * DataTable Reducer
 *
 * State management for the DataTable component following Composable Architecture patterns.
 */
import { Effect } from '../../effect.js';
/**
 * Creates initial table state from configuration.
 */
export function createInitialState(config) {
    const initialData = config.initialData || [];
    const pageSize = config.pageSize || 10;
    // Apply initial pagination
    const paginatedData = initialData.slice(0, pageSize);
    return {
        data: paginatedData,
        originalData: initialData,
        sorting: [],
        filters: [],
        pagination: {
            page: 0,
            pageSize,
            total: initialData.length
        },
        selectedRows: new Set(),
        isLoading: false,
        error: null
    };
}
/**
 * Applies filters to data array.
 */
function applyFilters(data, filters) {
    if (filters.length === 0)
        return data;
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
function applySorting(data, sorting) {
    if (sorting.length === 0)
        return data;
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
            }
            else if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            }
            else if (aVal instanceof Date && bVal instanceof Date) {
                comparison = aVal.getTime() - bVal.getTime();
            }
            else {
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
function applyPagination(data, page, pageSize) {
    const start = page * pageSize;
    const end = start + pageSize;
    return data.slice(start, end);
}
/**
 * Processes data through filters, sorting, and pagination (client-side).
 */
function processData(state) {
    let processed = state.originalData;
    // Apply filters
    processed = applyFilters(processed, state.filters);
    // Apply sorting
    processed = applySorting(processed, state.sorting);
    // Update total count for pagination
    const total = processed.length;
    // Apply pagination
    processed = applyPagination(processed, state.pagination.page, state.pagination.pageSize);
    return processed;
}
/**
 * Creates a DataTable reducer with the given configuration.
 */
export function createTableReducer(config = {}) {
    const getRowId = config.getRowId || ((row) => String(row.id));
    const serverSide = config.serverSide || false;
    return (state, action, deps) => {
        switch (action.type) {
            // Data actions
            case 'dataLoaded': {
                const newData = action.data;
                const updatedState = {
                    ...state,
                    originalData: newData,
                    isLoading: false,
                    error: null,
                    pagination: {
                        ...state.pagination,
                        total: newData.length
                    }
                };
                // Process data if client-side
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                    updatedState.pagination.total = updatedState.data.length;
                }
                else {
                    updatedState.data = newData;
                }
                return [updatedState, Effect.none()];
            }
            case 'dataLoadFailed': {
                return [
                    {
                        ...state,
                        isLoading: false,
                        error: action.error
                    },
                    Effect.none()
                ];
            }
            case 'refreshTriggered': {
                if (!config.fetchData) {
                    return [state, Effect.none()];
                }
                const loadingState = {
                    ...state,
                    isLoading: true,
                    error: null
                };
                const effect = Effect.run(async (dispatch) => {
                    try {
                        const result = await config.fetchData(loadingState);
                        dispatch({ type: 'dataLoaded', data: result.data });
                    }
                    catch (error) {
                        dispatch({
                            type: 'dataLoadFailed',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                });
                return [loadingState, effect];
            }
            // Sorting actions
            case 'sortChanged': {
                let newSorting = [...state.sorting];
                // Find existing sort for this column
                const existingIndex = newSorting.findIndex((s) => s.column === action.column);
                if (config.multiSort) {
                    // Multi-column sort: add or update
                    if (existingIndex >= 0) {
                        newSorting[existingIndex] = { column: action.column, direction: action.direction };
                    }
                    else {
                        newSorting.push({ column: action.column, direction: action.direction });
                    }
                }
                else {
                    // Single column sort: replace
                    newSorting = [{ column: action.column, direction: action.direction }];
                }
                const updatedState = {
                    ...state,
                    sorting: newSorting,
                    pagination: {
                        ...state.pagination,
                        page: 0 // Reset to first page on sort
                    }
                };
                // Reprocess data if client-side
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                }
                return [updatedState, Effect.none()];
            }
            case 'sortCleared': {
                const updatedState = {
                    ...state,
                    sorting: []
                };
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                }
                return [updatedState, Effect.none()];
            }
            // Filtering actions
            case 'filterAdded': {
                // Remove existing filter for same column
                const newFilters = state.filters.filter((f) => f.column !== action.filter.column);
                newFilters.push(action.filter);
                const updatedState = {
                    ...state,
                    filters: newFilters,
                    pagination: {
                        ...state.pagination,
                        page: 0 // Reset to first page on filter
                    }
                };
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                    // Update total based on filtered data
                    const filteredData = applyFilters(state.originalData, newFilters);
                    updatedState.pagination.total = filteredData.length;
                }
                return [updatedState, Effect.none()];
            }
            case 'filterRemoved': {
                const newFilters = state.filters.filter((f) => f.column !== action.column);
                const updatedState = {
                    ...state,
                    filters: newFilters
                };
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                    const filteredData = applyFilters(state.originalData, newFilters);
                    updatedState.pagination.total = filteredData.length;
                }
                return [updatedState, Effect.none()];
            }
            case 'filtersCleared': {
                const updatedState = {
                    ...state,
                    filters: []
                };
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                    updatedState.pagination.total = state.originalData.length;
                }
                return [updatedState, Effect.none()];
            }
            // Pagination actions
            case 'pageChanged': {
                const maxPage = Math.ceil(state.pagination.total / state.pagination.pageSize) - 1;
                const newPage = Math.max(0, Math.min(action.page, maxPage));
                const updatedState = {
                    ...state,
                    pagination: {
                        ...state.pagination,
                        page: newPage
                    }
                };
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                }
                return [updatedState, Effect.none()];
            }
            case 'pageSizeChanged': {
                const updatedState = {
                    ...state,
                    pagination: {
                        ...state.pagination,
                        pageSize: action.pageSize,
                        page: 0 // Reset to first page
                    }
                };
                if (!serverSide) {
                    updatedState.data = processData(updatedState);
                }
                return [updatedState, Effect.none()];
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
                const _exhaustive = action;
                return [state, Effect.none()];
            }
        }
    };
}
