<script lang="ts" generics="T">
	import { cn } from '../../utils.js';
	import type { Store } from '../../types.js';
	import type { TableState, TableAction } from './table.types.js';
	import type { Snippet } from 'svelte';
	import { Empty } from '../ui/empty/index.js';
	import { Spinner } from '../ui/spinner/index.js';

	// DataTable component - Main table container with Composable Architecture integration.

	interface DataTableProps<T> {
		/**
		 * Store managing table state.
		 */
		store: Store<TableState<T>, TableAction<T>>;

		/**
		 * Header row content (column headers with sorting controls).
		 */
		header?: Snippet | undefined;

		/**
		 * Row rendering snippet (receives row data).
		 */
		row: Snippet<[T]>;

		/**
		 * Optional footer content.
		 */
		footer?: Snippet | undefined;

		/**
		 * Empty state message (default: "No data available").
		 */
		emptyMessage?: string | undefined;

		/**
		 * Loading message (default: "Loading...").
		 */
		loadingMessage?: string | undefined;

		/**
		 * Additional CSS classes for the table container.
		 */
		class?: string | undefined;

		/**
		 * Additional CSS classes for the table element.
		 */
		tableClass?: string | undefined;

		/**
		 * Row identity for the keyed `{#each}`.
		 *
		 * Pass the same function given to `createTableReducer({ getRowId })` —
		 * the reducer closes over its copy, so the component cannot read it back
		 * off the store.
		 *
		 * @default (row) => String(row.id)
		 */
		getRowId?: ((row: T) => string) | undefined;
	}

	let {
		store,
		header,
		row,
		footer,
		emptyMessage = 'No data available',
		loadingMessage = 'Loading...',
		class: className,
		tableClass,
		getRowId = (row: T) => String((row as { id?: unknown }).id)
	}: DataTableProps<T> = $props();

	const state = $derived(store.state);
</script>

<div class={cn('w-full', className)}>
	<!-- Loading State -->
	{#if state.isLoading}
		<div class="flex items-center justify-center py-8">
			<Spinner />
			<span class="ml-2 text-muted-foreground">{loadingMessage}</span>
		</div>
	{:else if state.error}
		<!-- Error State -->
		<div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
			<p class="font-medium text-destructive">Error loading data</p>
			<p class="mt-1 text-sm text-destructive/80">{state.error}</p>
		</div>
	{:else if state.data.length === 0}
		<!-- Empty State -->
		<Empty title={emptyMessage} />
	{:else}
		<!-- Table -->
		<div class="relative w-full overflow-auto">
			<table class={cn('w-full caption-bottom text-sm', tableClass)}>
				{#if header}
					<thead class="[&_tr]:border-b">
						{@render header()}
					</thead>
				{/if}

				<tbody class="[&_tr:last-child]:border-0">
					{#each state.data as item (getRowId(item))}
						{@render row(item)}
					{/each}
				</tbody>

				{#if footer}
					<tfoot class="border-t bg-muted/50 font-medium [&>tr]:last:border-b-0">
						{@render footer()}
					</tfoot>
				{/if}
			</table>
		</div>
	{/if}
</div>
