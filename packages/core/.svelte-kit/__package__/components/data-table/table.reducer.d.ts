/**
 * DataTable Reducer
 *
 * State management for the DataTable component following Composable Architecture patterns.
 */
import type { Reducer } from '../../types.js';
import type { TableState, TableAction, TableConfig } from './table.types.js';
/**
 * Creates initial table state from configuration.
 */
export declare function createInitialState<T>(config: TableConfig<T>): TableState<T>;
/**
 * Creates a DataTable reducer with the given configuration.
 */
export declare function createTableReducer<T>(config?: TableConfig<T>): Reducer<TableState<T>, TableAction<T>, {}>;
//# sourceMappingURL=table.reducer.d.ts.map