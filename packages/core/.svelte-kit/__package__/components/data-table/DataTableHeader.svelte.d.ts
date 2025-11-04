import type { Store } from '../../store.svelte.js';
import type { TableState, TableAction } from './table.types.js';
interface ColumnDef<T> {
    /**
     * Column key (must match a key in T).
     */
    key: keyof T;
    /**
     * Display label for the column.
     */
    label: string;
    /**
     * Whether this column is sortable (default: true).
     */
    sortable?: boolean;
    /**
     * Custom CSS classes for the header cell.
     */
    class?: string;
}
interface DataTableHeaderProps<T> {
    /**
     * Store managing table state.
     */
    store: Store<TableState<T>, TableAction<T>>;
    /**
     * Column definitions.
     */
    columns: ColumnDef<T>[];
    /**
     * Additional CSS classes for the header row.
     */
    class?: string;
}
declare function $$render<T>(): {
    props: DataTableHeaderProps<T>;
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
declare const DataTableHeader: $$IsomorphicComponent;
type DataTableHeader<T> = InstanceType<typeof DataTableHeader<T>>;
export default DataTableHeader;
//# sourceMappingURL=DataTableHeader.svelte.d.ts.map