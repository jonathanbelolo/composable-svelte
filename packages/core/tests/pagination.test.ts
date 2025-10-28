/**
 * Tests for Pagination component
 *
 * Tests page navigation, items per page changes, and callbacks.
 */

import { describe, it, expect } from 'vitest';
import { createTestStore } from '../src/test/test-store.js';
import { paginationReducer } from '../src/components/ui/pagination/pagination.reducer.js';
import { createInitialPaginationState } from '../src/components/ui/pagination/pagination.types.js';

describe('Pagination', () => {
	describe('Page Navigation', () => {
		it('changes to specific page', async () => {
			const pageChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer,
				dependencies: {
					onPageChange: (page) => pageChanges.push(page)
				}
			});

			await store.send({ type: 'pageChanged', page: 5 }, (state) => {
				expect(state.currentPage).toBe(5);
			});

			store.assertNoPendingActions();
			expect(pageChanges).toEqual([5]);
		});

		it('goes to next page', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 3),
				reducer: paginationReducer
			});

			await store.send({ type: 'nextPage' }, (state) => {
				expect(state.currentPage).toBe(4);
			});

			store.assertNoPendingActions();
		});

		it('goes to previous page', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 3),
				reducer: paginationReducer
			});

			await store.send({ type: 'previousPage' }, (state) => {
				expect(state.currentPage).toBe(2);
			});

			store.assertNoPendingActions();
		});

		it('goes to first page', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer
			});

			await store.send({ type: 'firstPage' }, (state) => {
				expect(state.currentPage).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('goes to last page', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer
			});

			await store.send({ type: 'lastPage' }, (state) => {
				expect(state.currentPage).toBe(10);
				expect(state.totalPages).toBe(10);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Boundary Conditions', () => {
		it('does not go below page 1', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer
			});

			await store.send({ type: 'previousPage' }, (state) => {
				expect(state.currentPage).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('does not go above total pages', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 10),
				reducer: paginationReducer
			});

			await store.send({ type: 'nextPage' }, (state) => {
				expect(state.currentPage).toBe(10);
			});

			store.assertNoPendingActions();
		});

		it('ignores invalid page numbers', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer
			});

			// Try to go to page 0
			await store.send({ type: 'pageChanged', page: 0 }, (state) => {
				expect(state.currentPage).toBe(5); // Unchanged
			});

			// Try to go beyond total pages
			await store.send({ type: 'pageChanged', page: 20 }, (state) => {
				expect(state.currentPage).toBe(5); // Unchanged
			});

			store.assertNoPendingActions();
		});

		it('ignores same page change', async () => {
			const pageChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer,
				dependencies: {
					onPageChange: (page) => pageChanges.push(page)
				}
			});

			await store.send({ type: 'pageChanged', page: 5 }, (state) => {
				expect(state.currentPage).toBe(5);
			});

			store.assertNoPendingActions();
			expect(pageChanges).toEqual([]); // No callback
		});
	});

	describe('Items Per Page', () => {
		it('changes items per page', async () => {
			const ippChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer,
				dependencies: {
					onItemsPerPageChange: (ipp) => ippChanges.push(ipp)
				}
			});

			await store.send({ type: 'itemsPerPageChanged', itemsPerPage: 20 }, (state) => {
				expect(state.itemsPerPage).toBe(20);
				expect(state.totalPages).toBe(5); // 100 / 20
			});

			store.assertNoPendingActions();
			expect(ippChanges).toEqual([20]);
		});

		it('adjusts current page when total pages decrease', async () => {
			const pageChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 10), // Page 10 of 10
				reducer: paginationReducer,
				dependencies: {
					onPageChange: (page) => pageChanges.push(page)
				}
			});

			// Change to 50 items per page -> 2 total pages
			await store.send({ type: 'itemsPerPageChanged', itemsPerPage: 50 }, (state) => {
				expect(state.itemsPerPage).toBe(50);
				expect(state.totalPages).toBe(2);
				expect(state.currentPage).toBe(2); // Adjusted from 10 to 2
			});

			store.assertNoPendingActions();
			expect(pageChanges).toEqual([2]); // Page changed
		});

		it('ignores invalid items per page', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer
			});

			await store.send({ type: 'itemsPerPageChanged', itemsPerPage: 0 }, (state) => {
				expect(state.itemsPerPage).toBe(10); // Unchanged
			});

			await store.send({ type: 'itemsPerPageChanged', itemsPerPage: -5 }, (state) => {
				expect(state.itemsPerPage).toBe(10); // Unchanged
			});

			store.assertNoPendingActions();
		});

		it('ignores same items per page', async () => {
			const ippChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer,
				dependencies: {
					onItemsPerPageChange: (ipp) => ippChanges.push(ipp)
				}
			});

			await store.send({ type: 'itemsPerPageChanged', itemsPerPage: 10 }, (state) => {
				expect(state.itemsPerPage).toBe(10);
			});

			store.assertNoPendingActions();
			expect(ippChanges).toEqual([]); // No callback
		});
	});

	describe('Total Items Changes', () => {
		it('updates total pages when total items change', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer
			});

			await store.send({ type: 'totalItemsChanged', totalItems: 150 }, (state) => {
				expect(state.totalItems).toBe(150);
				expect(state.totalPages).toBe(15); // 150 / 10
				expect(state.currentPage).toBe(5); // Unchanged
			});

			store.assertNoPendingActions();
		});

		it('adjusts current page when total items decrease', async () => {
			const pageChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 10), // Page 10 of 10
				reducer: paginationReducer,
				dependencies: {
					onPageChange: (page) => pageChanges.push(page)
				}
			});

			// Decrease to 50 items -> 5 total pages
			await store.send({ type: 'totalItemsChanged', totalItems: 50 }, (state) => {
				expect(state.totalItems).toBe(50);
				expect(state.totalPages).toBe(5);
				expect(state.currentPage).toBe(5); // Adjusted from 10 to 5
			});

			store.assertNoPendingActions();
			expect(pageChanges).toEqual([5]); // Page changed
		});

		it('ignores negative total items', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer
			});

			await store.send({ type: 'totalItemsChanged', totalItems: -10 }, (state) => {
				expect(state.totalItems).toBe(100); // Unchanged
			});

			store.assertNoPendingActions();
		});

		it('ignores same total items', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer
			});

			await store.send({ type: 'totalItemsChanged', totalItems: 100 }, (state) => {
				expect(state.totalItems).toBe(100);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Edge Cases', () => {
		it('handles zero total items', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(0, 10, 1),
				reducer: paginationReducer
			});

			expect(store.state.totalPages).toBe(1); // At least 1 page
			expect(store.state.currentPage).toBe(1);

			store.assertNoPendingActions();
		});

		it('handles single item', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(1, 10, 1),
				reducer: paginationReducer
			});

			expect(store.state.totalPages).toBe(1);
			expect(store.state.currentPage).toBe(1);

			// Cannot navigate
			await store.send({ type: 'nextPage' }, (state) => {
				expect(state.currentPage).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('handles exact multiple of items per page', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer
			});

			expect(store.state.totalPages).toBe(10);
			expect(store.state.totalItems).toBe(100);
			expect(store.state.itemsPerPage).toBe(10);

			store.assertNoPendingActions();
		});

		it('handles non-exact division', async () => {
			const store = createTestStore({
				initialState: createInitialPaginationState(105, 10, 1),
				reducer: paginationReducer
			});

			expect(store.state.totalPages).toBe(11); // Ceiling of 105 / 10
			expect(store.state.totalItems).toBe(105);
			expect(store.state.itemsPerPage).toBe(10);

			store.assertNoPendingActions();
		});
	});

	describe('Full User Flow', () => {
		it('complete navigation flow', async () => {
			const pageChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 1),
				reducer: paginationReducer,
				dependencies: {
					onPageChange: (page) => pageChanges.push(page)
				}
			});

			// Go to page 5
			await store.send({ type: 'pageChanged', page: 5 }, (state) => {
				expect(state.currentPage).toBe(5);
			});

			// Next page
			await store.send({ type: 'nextPage' }, (state) => {
				expect(state.currentPage).toBe(6);
			});

			// Previous page
			await store.send({ type: 'previousPage' }, (state) => {
				expect(state.currentPage).toBe(5);
			});

			// Last page
			await store.send({ type: 'lastPage' }, (state) => {
				expect(state.currentPage).toBe(10);
			});

			// First page
			await store.send({ type: 'firstPage' }, (state) => {
				expect(state.currentPage).toBe(1);
			});

			store.assertNoPendingActions();
			expect(pageChanges).toEqual([5, 6, 5, 10, 1]);
		});

		it('items per page change flow', async () => {
			const pageChanges: number[] = [];
			const ippChanges: number[] = [];

			const store = createTestStore({
				initialState: createInitialPaginationState(100, 10, 5),
				reducer: paginationReducer,
				dependencies: {
					onPageChange: (page) => pageChanges.push(page),
					onItemsPerPageChange: (ipp) => ippChanges.push(ipp)
				}
			});

			// Change items per page
			await store.send({ type: 'itemsPerPageChanged', itemsPerPage: 25 }, (state) => {
				expect(state.itemsPerPage).toBe(25);
				expect(state.totalPages).toBe(4); // 100 / 25
				expect(state.currentPage).toBe(4); // Adjusted from 5 to 4
			});

			store.assertNoPendingActions();
			expect(ippChanges).toEqual([25]);
			expect(pageChanges).toEqual([4]); // Page adjusted
		});
	});
});
