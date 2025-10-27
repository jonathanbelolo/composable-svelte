<script lang="ts" generics="T">
	import { cn } from '$lib/utils.js';
	import type { Store } from '../../store.svelte.js';
	import type { TableState, TableAction } from './table.types.js';
	import { Button } from '../ui/button/index.js';

	// DataTablePagination component - Pagination controls for DataTable.

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

	let {
		store,
		pageSizeOptions = [10, 20, 50, 100],
		class: className
	}: DataTablePaginationProps<T> = $props();

	const state = $derived(store.state);
	const totalPages = $derived(Math.ceil(state.pagination.total / state.pagination.pageSize));
	const currentPage = $derived(state.pagination.page + 1); // Display 1-indexed
	const startItem = $derived(state.pagination.page * state.pagination.pageSize + 1);
	const endItem = $derived(
		Math.min((state.pagination.page + 1) * state.pagination.pageSize, state.pagination.total)
	);

	function goToPage(page: number) {
		store.dispatch({ type: 'pageChanged', page });
	}

	function changePageSize(event: Event) {
		const target = event.target as HTMLSelectElement;
		const pageSize = parseInt(target.value, 10);
		store.dispatch({ type: 'pageSizeChanged', pageSize });
	}
</script>

<div
	class={cn(
		'flex items-center justify-between space-x-6 py-4 lg:space-x-8 px-2',
		className
	)}
>
	<!-- Items per page selector -->
	<div class="flex items-center space-x-2">
		<p class="text-sm font-medium">Items per page</p>
		<select
			value={state.pagination.pageSize}
			onchange={changePageSize}
			class="h-8 w-[70px] rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		>
			{#each pageSizeOptions as option}
				<option value={option}>{option}</option>
			{/each}
		</select>
	</div>

	<!-- Page info and navigation -->
	<div class="flex items-center space-x-6 lg:space-x-8">
		<!-- Page info -->
		<div class="flex w-[100px] items-center justify-center text-sm font-medium">
			{#if state.pagination.total > 0}
				{startItem}-{endItem} of {state.pagination.total}
			{:else}
				0 items
			{/if}
		</div>

		<!-- Navigation buttons -->
		<div class="flex items-center space-x-2">
			<!-- First page -->
			<Button
				variant="outline"
				size="sm"
				class="h-8 w-8 p-0"
				onclick={() => goToPage(0)}
				disabled={state.pagination.page === 0}
				aria-label="Go to first page"
			>
				<svg
					class="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="11 17 6 12 11 7" />
					<polyline points="18 17 13 12 18 7" />
				</svg>
			</Button>

			<!-- Previous page -->
			<Button
				variant="outline"
				size="sm"
				class="h-8 w-8 p-0"
				onclick={() => goToPage(state.pagination.page - 1)}
				disabled={state.pagination.page === 0}
				aria-label="Go to previous page"
			>
				<svg
					class="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="15 18 9 12 15 6" />
				</svg>
			</Button>

			<!-- Page indicator -->
			<div class="flex w-[100px] items-center justify-center text-sm font-medium">
				Page {currentPage} of {totalPages}
			</div>

			<!-- Next page -->
			<Button
				variant="outline"
				size="sm"
				class="h-8 w-8 p-0"
				onclick={() => goToPage(state.pagination.page + 1)}
				disabled={state.pagination.page >= totalPages - 1}
				aria-label="Go to next page"
			>
				<svg
					class="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</Button>

			<!-- Last page -->
			<Button
				variant="outline"
				size="sm"
				class="h-8 w-8 p-0"
				onclick={() => goToPage(totalPages - 1)}
				disabled={state.pagination.page >= totalPages - 1}
				aria-label="Go to last page"
			>
				<svg
					class="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="13 17 18 12 13 7" />
					<polyline points="6 17 11 12 6 7" />
				</svg>
			</Button>
		</div>
	</div>
</div>
