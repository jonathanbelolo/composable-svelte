/**
 * DataTable System Unit Tests
 *
 * Tests the DataTable reducer using TestStore.
 */

import { describe, it, expect } from 'vitest';
import { TestStore } from '../src/lib/test/test-store.js';
import {
	createTableReducer,
	createInitialState
} from '../src/lib/components/data-table/table.reducer.js';
import type { TableState, TableAction } from '../src/lib/components/data-table/table.types.js';

interface Product {
	id: string;
	name: string;
	price: number;
	category: string;
	inStock: boolean;
}

const mockProducts: Product[] = [
	{ id: '1', name: 'Laptop', price: 999, category: 'Electronics', inStock: true },
	{ id: '2', name: 'Mouse', price: 25, category: 'Electronics', inStock: true },
	{ id: '3', name: 'Keyboard', price: 75, category: 'Electronics', inStock: false },
	{ id: '4', name: 'Monitor', price: 300, category: 'Electronics', inStock: true },
	{ id: '5', name: 'Desk', price: 200, category: 'Furniture', inStock: true },
	{ id: '6', name: 'Chair', price: 150, category: 'Furniture', inStock: false },
	{ id: '7', name: 'Lamp', price: 50, category: 'Furniture', inStock: true },
	{ id: '8', name: 'Notebook', price: 5, category: 'Stationery', inStock: true },
	{ id: '9', name: 'Pen', price: 2, category: 'Stationery', inStock: true },
	{ id: '10', name: 'Pencil', price: 1, category: 'Stationery', inStock: false }
];

describe('DataTable - Data Loading', () => {
	it('should load data successfully', async () => {
		const reducer = createTableReducer<Product>();
		const initialState = createInitialState<Product>({});
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'dataLoaded', data: mockProducts }, (state) => {
			expect(state.data).toHaveLength(10);
			expect(state.originalData).toHaveLength(10);
			expect(state.isLoading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.pagination.total).toBe(10);
		});
	});

	it('should handle data load failure', async () => {
		const reducer = createTableReducer<Product>();
		const initialState = createInitialState<Product>({});
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'dataLoadFailed', error: 'Network error' }, (state) => {
			expect(state.isLoading).toBe(false);
			expect(state.error).toBe('Network error');
		});
	});
});

describe('DataTable - Sorting', () => {
	it('should sort by column ascending', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'sortChanged', column: 'price', direction: 'asc' }, (state) => {
			expect(state.sorting).toEqual([{ column: 'price', direction: 'asc' }]);
			// Data should be sorted by price ascending
			expect(state.data[0].price).toBe(1); // Pencil
			expect(state.data[1].price).toBe(2); // Pen
			expect(state.data[9].price).toBe(999); // Laptop
		});
	});

	it('should sort by column descending', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'sortChanged', column: 'price', direction: 'desc' }, (state) => {
			expect(state.sorting).toEqual([{ column: 'price', direction: 'desc' }]);
			// Data should be sorted by price descending
			expect(state.data[0].price).toBe(999); // Laptop
			expect(state.data[1].price).toBe(300); // Monitor
			expect(state.data[9].price).toBe(1); // Pencil
		});
	});

	it('should sort strings alphabetically', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'sortChanged', column: 'name', direction: 'asc' }, (state) => {
			expect(state.data[0].name).toBe('Chair');
			expect(state.data[1].name).toBe('Desk');
			expect(state.data[9].name).toBe('Pencil');
		});
	});

	it('should clear sorting', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		// First sort
		await store.send({ type: 'sortChanged', column: 'price', direction: 'asc' }, (state) => {
			expect(state.sorting).toHaveLength(1);
		});

		// Then clear
		await store.send({ type: 'sortCleared' }, (state) => {
			expect(state.sorting).toEqual([]);
			// Data should be back to original order
			expect(state.data[0].id).toBe('1'); // Laptop (first in original)
		});
	});

	it('should handle multi-column sorting', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts, multiSort: true });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		// Sort by category first
		await store.send({ type: 'sortChanged', column: 'category', direction: 'asc' }, (state) => {
			expect(state.sorting).toHaveLength(1);
		});

		// Then sort by price (should keep category sort)
		await store.send({ type: 'sortChanged', column: 'price', direction: 'asc' }, (state) => {
			expect(state.sorting).toHaveLength(2);
			expect(state.sorting[0].column).toBe('category');
			expect(state.sorting[1].column).toBe('price');
		});
	});
});

describe('DataTable - Filtering', () => {
	it('should filter by equals operator', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'equals', value: 'Electronics' }
			},
			(state) => {
				expect(state.filters).toHaveLength(1);
				expect(state.data).toHaveLength(4); // 4 electronics products
				expect(state.data.every((p) => p.category === 'Electronics')).toBe(true);
				expect(state.pagination.total).toBe(4); // Total updated
			}
		);
	});

	it('should filter by contains operator', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'name', operator: 'contains', value: 'book' }
			},
			(state) => {
				expect(state.data).toHaveLength(1); // Only "Notebook"
				expect(state.data[0].name).toBe('Notebook');
			}
		);
	});

	it('should filter by greaterThan operator', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'price', operator: 'greaterThan', value: 100 }
			},
			(state) => {
				expect(state.data.length).toBeGreaterThan(0);
				expect(state.data.every((p) => p.price > 100)).toBe(true);
			}
		);
	});

	it('should filter by in operator', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'in', value: ['Electronics', 'Furniture'] }
			},
			(state) => {
				expect(state.data).toHaveLength(7); // 4 electronics + 3 furniture
				expect(
					state.data.every((p) => p.category === 'Electronics' || p.category === 'Furniture')
				).toBe(true);
			}
		);
	});

	it('should combine multiple filters', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		// Filter by category
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'equals', value: 'Electronics' }
			},
			(state) => {
				expect(state.data).toHaveLength(4);
			}
		);

		// Add price filter (should combine with category)
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'price', operator: 'lessThan', value: 100 }
			},
			(state) => {
				expect(state.data).toHaveLength(2); // Mouse and Keyboard
				expect(state.data.every((p) => p.category === 'Electronics' && p.price < 100)).toBe(true);
			}
		);
	});

	it('should remove a filter', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		// Add filter
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'equals', value: 'Electronics' }
			},
			(state) => {
				expect(state.data).toHaveLength(4);
			}
		);

		// Remove filter
		await store.send({ type: 'filterRemoved', column: 'category' }, (state) => {
			expect(state.filters).toHaveLength(0);
			expect(state.data).toHaveLength(10); // Back to all products
			expect(state.pagination.total).toBe(10);
		});
	});

	it('should clear all filters', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		// Add multiple filters
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'equals', value: 'Electronics' }
			},
			() => {}
		);
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'price', operator: 'lessThan', value: 100 }
			},
			(state) => {
				expect(state.filters).toHaveLength(2);
			}
		);

		// Clear all
		await store.send({ type: 'filtersCleared' }, (state) => {
			expect(state.filters).toEqual([]);
			expect(state.data).toHaveLength(10);
			expect(state.pagination.total).toBe(10);
		});
	});
});

describe('DataTable - Pagination', () => {
	it('should paginate data correctly', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 3 });
		const store = new TestStore({ initialState, reducer });

		// Initial page (0) should show first 3 items
		expect(store.state.data).toHaveLength(3);
		expect(store.state.data[0].id).toBe('1');
		expect(store.state.pagination.page).toBe(0);
		expect(store.state.pagination.total).toBe(10);

		// Go to page 1
		await store.send({ type: 'pageChanged', page: 1 }, (state) => {
			expect(state.pagination.page).toBe(1);
			expect(state.data).toHaveLength(3);
			expect(state.data[0].id).toBe('4'); // Fourth item
		});

		// Go to last page (page 3, items 10)
		await store.send({ type: 'pageChanged', page: 3 }, (state) => {
			expect(state.pagination.page).toBe(3);
			expect(state.data).toHaveLength(1); // Only 1 item on last page
			expect(state.data[0].id).toBe('10');
		});
	});

	it('should change page size', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 3 });
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'pageSizeChanged', pageSize: 5 }, (state) => {
			expect(state.pagination.pageSize).toBe(5);
			expect(state.pagination.page).toBe(0); // Reset to page 0
			expect(state.data).toHaveLength(5);
		});
	});

	it('should prevent navigating beyond bounds', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 5 });
		const store = new TestStore({ initialState, reducer });

		// Try to go to page 10 (only 2 pages exist)
		await store.send({ type: 'pageChanged', page: 10 }, (state) => {
			expect(state.pagination.page).toBe(1); // Clamped to max page
		});

		// Try to go to negative page
		await store.send({ type: 'pageChanged', page: -5 }, (state) => {
			expect(state.pagination.page).toBe(0); // Clamped to 0
		});
	});

	it('should reset page to 0 on sort', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 3 });
		const store = new TestStore({ initialState, reducer });

		// Go to page 2
		await store.send({ type: 'pageChanged', page: 2 }, (state) => {
			expect(state.pagination.page).toBe(2);
		});

		// Sort (should reset to page 0)
		await store.send({ type: 'sortChanged', column: 'price', direction: 'asc' }, (state) => {
			expect(state.pagination.page).toBe(0);
		});
	});

	it('should reset page to 0 on filter', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 3 });
		const store = new TestStore({ initialState, reducer });

		// Go to page 2
		await store.send({ type: 'pageChanged', page: 2 }, (state) => {
			expect(state.pagination.page).toBe(2);
		});

		// Filter (should reset to page 0)
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'equals', value: 'Electronics' }
			},
			(state) => {
				expect(state.pagination.page).toBe(0);
			}
		);
	});
});

describe('DataTable - Row Selection', () => {
	it('should select a row', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts });
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'rowSelected', rowId: '1' }, (state) => {
			expect(state.selectedRows.has('1')).toBe(true);
			expect(state.selectedRows.size).toBe(1);
		});
	});

	it('should deselect a row', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts });
		const store = new TestStore({ initialState, reducer });

		// Select
		await store.send({ type: 'rowSelected', rowId: '1' }, (state) => {
			expect(state.selectedRows.has('1')).toBe(true);
		});

		// Deselect
		await store.send({ type: 'rowDeselected', rowId: '1' }, (state) => {
			expect(state.selectedRows.has('1')).toBe(false);
			expect(state.selectedRows.size).toBe(0);
		});
	});

	it('should select all rows on current page', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 5 });
		const store = new TestStore({ initialState, reducer });

		await store.send({ type: 'allRowsSelected' }, (state) => {
			expect(state.selectedRows.size).toBe(5); // Page size is 5
			// Check that IDs match current page data
			const currentPageIds = state.data.map((p) => p.id);
			currentPageIds.forEach((id) => {
				expect(state.selectedRows.has(id)).toBe(true);
			});
		});
	});

	it('should clear selection', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts });
		const store = new TestStore({ initialState, reducer });

		// Select multiple
		await store.send({ type: 'rowSelected', rowId: '1' }, () => {});
		await store.send({ type: 'rowSelected', rowId: '2' }, () => {});
		await store.send({ type: 'rowSelected', rowId: '3' }, (state) => {
			expect(state.selectedRows.size).toBe(3);
		});

		// Clear
		await store.send({ type: 'selectionCleared' }, (state) => {
			expect(state.selectedRows.size).toBe(0);
		});
	});
});

describe('DataTable - Combined Operations', () => {
	it('should handle filter + sort + pagination together', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 2 });
		const store = new TestStore({ initialState, reducer });

		// 1. Filter by category
		await store.send(
			{
				type: 'filterAdded',
				filter: { column: 'category', operator: 'equals', value: 'Electronics' }
			},
			(state) => {
				expect(state.data).toHaveLength(2); // Page size 2, showing first 2 of 4 electronics
				expect(state.pagination.total).toBe(4);
			}
		);

		// 2. Sort by price ascending
		await store.send({ type: 'sortChanged', column: 'price', direction: 'asc' }, (state) => {
			expect(state.data[0].price).toBe(25); // Mouse (cheapest electronics)
			expect(state.data[1].price).toBe(75); // Keyboard
		});

		// 3. Go to page 2
		await store.send({ type: 'pageChanged', page: 1 }, (state) => {
			expect(state.data).toHaveLength(2);
			expect(state.data[0].price).toBe(300); // Monitor
			expect(state.data[1].price).toBe(999); // Laptop
		});
	});

	it('should maintain selection after sort', async () => {
		const reducer = createTableReducer<Product>({ initialData: mockProducts });
		const initialState = createInitialState<Product>({ initialData: mockProducts, pageSize: 100 });
		const store = new TestStore({ initialState, reducer });

		// Select some rows
		await store.send({ type: 'rowSelected', rowId: '1' }, () => {});
		await store.send({ type: 'rowSelected', rowId: '5' }, (state) => {
			expect(state.selectedRows.size).toBe(2);
		});

		// Sort (selection should persist)
		await store.send({ type: 'sortChanged', column: 'price', direction: 'asc' }, (state) => {
			expect(state.selectedRows.size).toBe(2);
			expect(state.selectedRows.has('1')).toBe(true);
			expect(state.selectedRows.has('5')).toBe(true);
		});
	});
});
