<script lang="ts" generics="T">
	import { cn } from '$lib/utils.js';
	import type { Store } from '../../store.svelte.js';
	import type { TableState, TableAction, SortDirection } from './table.types.js';
	import { Button } from '../ui/button/index.js';

	// DataTableHeader component - Column headers with sorting controls.

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

	let { store, columns, class: className }: DataTableHeaderProps<T> = $props();

	const state = $derived(store.state);

	function getSortDirection(column: keyof T): SortDirection | null {
		const sort = state.sorting.find((s) => s.column === column);
		return sort ? sort.direction : null;
	}

	function handleSort(column: keyof T) {
		const currentDirection = getSortDirection(column);
		let newDirection: SortDirection;

		if (currentDirection === null) {
			newDirection = 'asc';
		} else if (currentDirection === 'asc') {
			newDirection = 'desc';
		} else {
			// Cycling back to asc (or could remove sort)
			newDirection = 'asc';
		}

		store.dispatch({
			type: 'sortChanged',
			column,
			direction: newDirection
		});
	}
</script>

<tr class={cn('border-b transition-colors hover:bg-muted/50', className)}>
	{#each columns as col}
		<th
			class={cn(
				'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
				col.class
			)}
		>
			{#if col.sortable !== false}
				<Button
					variant="ghost"
					size="sm"
					class="-ml-3 h-8 data-[state=open]:bg-accent"
					onclick={() => handleSort(col.key)}
				>
					<span>{col.label}</span>
					{#if getSortDirection(col.key) === 'asc'}
						<svg
							class="ml-2 h-4 w-4"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m7 15 5 5 5-5" />
							<path d="m7 9 5-5 5 5" />
						</svg>
					{:else if getSortDirection(col.key) === 'desc'}
						<svg
							class="ml-2 h-4 w-4"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m7 15 5 5 5-5" />
							<path d="m7 9 5-5 5 5" />
						</svg>
					{:else}
						<svg
							class="ml-2 h-4 w-4 opacity-50"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m7 15 5 5 5-5" />
							<path d="m7 9 5-5 5 5" />
						</svg>
					{/if}
				</Button>
			{:else}
				{col.label}
			{/if}
		</th>
	{/each}
</tr>
