<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		DataTable,
		DataTableHeader,
		DataTablePagination,
		createTableReducer,
		createInitialState,
		type TableAction
	} from '@composable-svelte/core/components/data-table';

	interface Product {
		id: string;
		name: string;
		price: number;
		category: string;
		inStock: boolean;
	}

	const products: Product[] = [
		{ id: '1', name: 'Laptop', price: 999, category: 'Electronics', inStock: true },
		{ id: '2', name: 'Mouse', price: 25, category: 'Electronics', inStock: true },
		{ id: '3', name: 'Keyboard', price: 75, category: 'Electronics', inStock: false },
		{ id: '4', name: 'Monitor', price: 300, category: 'Electronics', inStock: true },
		{ id: '5', name: 'Desk', price: 200, category: 'Furniture', inStock: true },
		{ id: '6', name: 'Chair', price: 150, category: 'Furniture', inStock: false },
		{ id: '7', name: 'Lamp', price: 50, category: 'Furniture', inStock: true },
		{ id: '8', name: 'Notebook', price: 5, category: 'Stationery', inStock: true },
		{ id: '9', name: 'Pen', price: 2, category: 'Stationery', inStock: true },
		{ id: '10', name: 'Pencil', price: 1, category: 'Stationery', inStock: false },
		{ id: '11', name: 'Headphones', price: 120, category: 'Electronics', inStock: true },
		{ id: '12', name: 'Tablet', price: 450, category: 'Electronics', inStock: true },
		{ id: '13', name: 'Bookshelf', price: 180, category: 'Furniture', inStock: false },
		{ id: '14', name: 'Stapler', price: 8, category: 'Stationery', inStock: true },
		{ id: '15', name: 'Paper', price: 3, category: 'Stationery', inStock: true }
	];

	const reducer = createTableReducer<Product>();
	const initialState = createInitialState<Product>({
		initialData: products,
		pageSize: 5
	});

	const store = createStore({
		initialState,
		reducer,
		dependencies: {}
	});

	function handleFilterByElectronics() {
		store.dispatch({
			type: 'filterAdded',
			filter: { column: 'category', operator: 'equals', value: 'Electronics' }
		});
	}

	function handleClearFilters() {
		store.dispatch({ type: 'filtersCleared' });
	}
</script>

<div class="container mx-auto p-8">
	<h1 class="text-3xl font-bold mb-6">DataTable Example</h1>

	<div class="mb-4 flex gap-2">
		<button
			onclick={handleFilterByElectronics}
			class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
			data-testid="filter-electronics-btn"
		>
			Filter Electronics
		</button>
		<button
			onclick={handleClearFilters}
			class="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
			data-testid="clear-filters-btn"
		>
			Clear Filters
		</button>
	</div>

	<div class="border rounded-lg">
		<DataTable {store}>
			{#snippet header()}
				<DataTableHeader
					{store}
					columns={[
						{ key: 'name', label: 'Name' },
						{ key: 'price', label: 'Price' },
						{ key: 'category', label: 'Category' },
						{ key: 'inStock', label: 'In Stock' }
					]}
				/>
			{/snippet}

			{#snippet row(product: Product)}
				<tr
					class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
					data-testid="table-row-{product.id}"
				>
					<td class="p-4 align-middle">{product.name}</td>
					<td class="p-4 align-middle">${product.price}</td>
					<td class="p-4 align-middle">{product.category}</td>
					<td class="p-4 align-middle">
						{#if product.inStock}
							<span class="text-green-600">Yes</span>
						{:else}
							<span class="text-red-600">No</span>
						{/if}
					</td>
				</tr>
			{/snippet}
		</DataTable>

		<DataTablePagination {store} pageSizeOptions={[3, 5, 10, 20]} />
	</div>
</div>
