import type { Store } from '../../store.svelte.js';
import type { TableState, TableAction } from './table.types.js';
import type { Snippet } from 'svelte';
interface DataTableProps<T> {
    /**
     * Store managing table state.
     */
    store: Store<TableState<T>, TableAction<T>>;
    /**
     * Header row content (column headers with sorting controls).
     */
    header?: Snippet;
    /**
     * Row rendering snippet (receives row data).
     */
    row: Snippet<[T]>;
    /**
     * Optional footer content.
     */
    footer?: Snippet;
    /**
     * Empty state message (default: "No data available").
     */
    emptyMessage?: string;
    /**
     * Loading message (default: "Loading...").
     */
    loadingMessage?: string;
    /**
     * Additional CSS classes for the table container.
     */
    class?: string;
    /**
     * Additional CSS classes for the table element.
     */
    tableClass?: string;
}
declare function $$render<T>(): {
    props: DataTableProps<T>;
    exports: {};
    bindings: "";
    slots: {};
    events: {};
};
declare class __sveltets_Render<T> {
    props(): ReturnType<typeof $$render<T>>['props'];
    events(): ReturnType<typeof $$render<T>>['events'];
    slots(): ReturnType<typeof $$render<T>>['slots'];
    bindings(): "";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <T>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<T>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<T>['props']>, ReturnType<__sveltets_Render<T>['events']>, ReturnType<__sveltets_Render<T>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<T>['bindings']>;
    } & ReturnType<__sveltets_Render<T>['exports']>;
    <T>(internal: unknown, props: ReturnType<__sveltets_Render<T>['props']> & {}): ReturnType<__sveltets_Render<T>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const DataTable: $$IsomorphicComponent;
type DataTable<T> = InstanceType<typeof DataTable<T>>;
export default DataTable;
//# sourceMappingURL=DataTable.svelte.d.ts.map