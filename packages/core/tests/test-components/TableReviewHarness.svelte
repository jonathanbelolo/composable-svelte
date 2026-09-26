<script lang="ts">
 import DataTable from '../../src/lib/components/data-table/DataTable.svelte';
 import DataTablePagination from '../../src/lib/components/data-table/DataTablePagination.svelte';
 import type { Store } from '../../src/lib/types.js';
 import type { TableState, TableAction } from '../../src/lib/components/data-table/table.types.js';
 type Row = { id: number; value: number };
 let {store,pageSizeOptions}: {store: Store<TableState<Row>, TableAction<Row>>; pageSizeOptions?: number[] | undefined} = $props();
</script>
{#snippet row(item: Row)}<tr><td>{item.id}</td><td>{item.value}</td></tr>{/snippet}
<DataTable {store} {row} />
<DataTablePagination {store} {pageSizeOptions} />
