<script lang="ts">
	import { createStore } from '../../../store.js';
	import { paginationReducer } from './pagination.reducer.js';
	import { createInitialPaginationState } from './pagination.types.js';
	import { cn } from '../../../utils.js';

	/**
	 * Pagination component - Page navigation with smart button generation.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * state management.
	 *
	 * @example
	 * ```svelte
	 * <Pagination
	 *   totalItems={100}
	 *   itemsPerPage={10}
	 *   bind:currentPage={page}
	 *   onPageChange={(page) => console.log('Page:', page)}
	 * />
	 * ```
	 */

	interface PaginationProps {
		/**
		 * Total number of items.
		 */
		totalItems: number;

		/**
		 * Number of items per page.
		 */
		itemsPerPage?: number;

		/**
		 * Current page (1-indexed). Use bind:currentPage for two-way binding.
		 */
		currentPage?: number;

		/**
		 * Maximum number of page buttons to show.
		 */
		maxPageButtons?: number;

		/**
		 * Show items per page selector.
		 */
		showItemsPerPage?: boolean;

		/**
		 * Items per page options.
		 */
		itemsPerPageOptions?: number[];

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Callback when page changes.
		 */
		onPageChange?: (page: number) => void;

		/**
		 * Callback when items per page changes.
		 */
		onItemsPerPageChange?: (itemsPerPage: number) => void;
	}

	let {
		totalItems,
		itemsPerPage = 10,
		currentPage = $bindable(1),
		maxPageButtons = 7,
		showItemsPerPage = false,
		itemsPerPageOptions = [10, 20, 50, 100],
		class: className,
		onPageChange,
		onItemsPerPageChange
	}: PaginationProps = $props();

	// Create pagination store with reducer
	const store = createStore({
		initialState: createInitialPaginationState(
			totalItems,
			itemsPerPage,
			currentPage,
			maxPageButtons
		),
		reducer: paginationReducer,
		dependencies: {
			onPageChange: (page) => {
				currentPage = page;
				onPageChange?.(page);
			},
			onItemsPerPageChange: (ipp) => {
				onItemsPerPageChange?.(ipp);
			}
		}
	});

	// Sync external currentPage changes to store
	$effect(() => {
		if (store.state.currentPage !== currentPage) {
			store.dispatch({ type: 'pageChanged', page: currentPage });
		}
	});

	// Sync totalItems changes
	$effect(() => {
		if (store.state.totalItems !== totalItems) {
			store.dispatch({ type: 'totalItemsChanged', totalItems });
		}
	});

	// Sync itemsPerPage changes
	$effect(() => {
		if (store.state.itemsPerPage !== itemsPerPage) {
			store.dispatch({ type: 'itemsPerPageChanged', itemsPerPage });
		}
	});

	/**
	 * Generate smart page buttons with ellipsis.
	 * Always shows first, last, current, and nearby pages.
	 */
	const pageButtons = $derived(() => {
		const { currentPage, totalPages, maxPageButtons } = $store;

		if (totalPages <= maxPageButtons) {
			// Show all pages
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		const buttons: (number | 'ellipsis')[] = [];
		const halfWindow = Math.floor((maxPageButtons - 3) / 2);

		// Always show first page
		buttons.push(1);

		// Calculate range around current page
		let start = Math.max(2, currentPage - halfWindow);
		let end = Math.min(totalPages - 1, currentPage + halfWindow);

		// Adjust range if we're near the start or end
		if (currentPage <= halfWindow + 2) {
			end = Math.min(totalPages - 1, maxPageButtons - 2);
		} else if (currentPage >= totalPages - halfWindow - 1) {
			start = Math.max(2, totalPages - maxPageButtons + 3);
		}

		// Add left ellipsis if needed
		if (start > 2) {
			buttons.push('ellipsis');
		}

		// Add range
		for (let i = start; i <= end; i++) {
			buttons.push(i);
		}

		// Add right ellipsis if needed
		if (end < totalPages - 1) {
			buttons.push('ellipsis');
		}

		// Always show last page if more than 1 page
		if (totalPages > 1) {
			buttons.push(totalPages);
		}

		return buttons;
	});

	function handlePageClick(page: number) {
		store.dispatch({ type: 'pageChanged', page });
	}

	function handlePrevious() {
		store.dispatch({ type: 'previousPage' });
	}

	function handleNext() {
		store.dispatch({ type: 'nextPage' });
	}

	function handleFirst() {
		store.dispatch({ type: 'firstPage' });
	}

	function handleLast() {
		store.dispatch({ type: 'lastPage' });
	}

	function handleItemsPerPageChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		const value = parseInt(select.value, 10);
		store.dispatch({ type: 'itemsPerPageChanged', itemsPerPage: value });
	}
</script>

<div class={cn('flex items-center justify-between gap-4', className)}>
	<!-- Items per page selector -->
	{#if showItemsPerPage}
		<div class="flex items-center gap-2 text-sm">
			<span class="text-muted-foreground">Items per page:</span>
			<select
				class="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
				value={$store.itemsPerPage}
				onchange={handleItemsPerPageChange}
			>
				{#each itemsPerPageOptions as option}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Pagination controls -->
	<div class="flex items-center gap-1">
		<!-- First button -->
		<button
			type="button"
			class={cn(
				'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				'disabled:pointer-events-none disabled:opacity-50'
			)}
			disabled={$store.currentPage === 1}
			onclick={handleFirst}
			aria-label="Go to first page"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="11 17 6 12 11 7"></polyline>
				<polyline points="18 17 13 12 18 7"></polyline>
			</svg>
		</button>

		<!-- Previous button -->
		<button
			type="button"
			class={cn(
				'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				'disabled:pointer-events-none disabled:opacity-50'
			)}
			disabled={$store.currentPage === 1}
			onclick={handlePrevious}
			aria-label="Go to previous page"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
		</button>

		<!-- Page buttons -->
		{#each pageButtons() as button}
			{#if button === 'ellipsis'}
				<span class="flex h-9 w-9 items-center justify-center text-sm text-muted-foreground">
					...
				</span>
			{:else}
				<button
					type="button"
					class={cn(
						'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors',
						$store.currentPage === button
							? 'bg-primary text-primary-foreground'
							: 'hover:bg-accent hover:text-accent-foreground'
					)}
					onclick={() => handlePageClick(button)}
					aria-label="Go to page {button}"
					aria-current={$store.currentPage === button ? 'page' : undefined}
				>
					{button}
				</button>
			{/if}
		{/each}

		<!-- Next button -->
		<button
			type="button"
			class={cn(
				'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				'disabled:pointer-events-none disabled:opacity-50'
			)}
			disabled={$store.currentPage === $store.totalPages}
			onclick={handleNext}
			aria-label="Go to next page"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="9 18 15 12 9 6"></polyline>
			</svg>
		</button>

		<!-- Last button -->
		<button
			type="button"
			class={cn(
				'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				'disabled:pointer-events-none disabled:opacity-50'
			)}
			disabled={$store.currentPage === $store.totalPages}
			onclick={handleLast}
			aria-label="Go to last page"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="13 17 18 12 13 7"></polyline>
				<polyline points="6 17 11 12 6 7"></polyline>
			</svg>
		</button>
	</div>

	<!-- Page info -->
	<div class="text-sm text-muted-foreground">
		Page {$store.currentPage} of {$store.totalPages}
	</div>
</div>
