import type { Store } from '../../store.svelte.js';
import type { TableState, TableAction } from './table.types.js';
interface DataTablePaginationProps<T> {
    /**
     * Store managing table state.
     */
    store: Store<TableState<T>, TableAction<T>>;
    /**
     * Available page size options (default: [10, 20, 50, 100]).
     */
    pageSizeOptions?: number[];
    /**
     * Additional CSS classes for the container.
     */
    class?: string;
}
declare function $$render<T>(): {
    props: DataTablePaginationProps<T>;
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
declare const DataTablePagination: $$IsomorphicComponent;
type DataTablePagination<T> = InstanceType<typeof DataTablePagination<T>>;
export default DataTablePagination;
//# sourceMappingURL=DataTablePagination.svelte.d.ts.map