/**
 * Integration Tests: Complete Routing Flows
 *
 * End-to-end tests for URL synchronization with real browser APIs.
 * Tests the full cycle: State → URL → Browser History → State
 * Phase 7, Day 7: Integration & Public API
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/store.svelte';
import { Effect } from '../../src/effect';
import type { Reducer } from '../../src/types';
import {
	serializeDestination,
	parseDestination,
	createURLSyncEffect,
	syncBrowserHistory,
	createInitialStateFromURL
} from '../../src/routing';
import type { SerializerConfig, ParserConfig } from '../../src/routing';
import { matchPath } from '../../src/routing/parser';

// ============================================================================
// Test Domain: Inventory Management App
// ============================================================================

interface InventoryState {
	destination: InventoryDestination | null;
	items: InventoryItem[];
	searchQuery: string;
}

type InventoryDestination =
	| { type: 'detail'; state: { itemId: string } }
	| { type: 'edit'; state: { itemId: string } }
	| { type: 'add'; state: {} };

interface InventoryItem {
	id: string;
	name: string;
	quantity: number;
}

type InventoryAction =
	| { type: 'itemSelected'; itemId: string }
	| { type: 'editTapped'; itemId: string }
	| { type: 'addTapped' }
	| { type: 'closeDestination' }
	| { type: 'searchChanged'; query: string }
	| { type: 'itemDeleted'; itemId: string };

// ============================================================================
// Routing Configuration
// ============================================================================

const serializerConfig: SerializerConfig<InventoryDestination> = {
	basePath: '/inventory',
	serializers: {
		detail: (state) => `/inventory/item-${state.itemId}`,
		edit: (state) => `/inventory/item-${state.itemId}/edit`,
		add: () => '/inventory/add'
	}
};

const parserConfig: ParserConfig<InventoryDestination> = {
	basePath: '/inventory',
	parsers: [
		// More specific patterns first
		(path) => {
			const params = matchPath('/item-:itemId/edit', path);
			if (params) {
				return { type: 'edit', state: { itemId: params.itemId } };
			}
			return null;
		},
		(path) => {
			const params = matchPath('/item-:itemId', path);
			if (params) {
				return { type: 'detail', state: { itemId: params.itemId } };
			}
			return null;
		},
		(path) => {
			if (path === '/add') {
				return { type: 'add', state: {} };
			}
			return null;
		}
	]
};

const destinationToAction = (dest: InventoryDestination | null): InventoryAction | null => {
	if (!dest) return { type: 'closeDestination' };
	switch (dest.type) {
		case 'detail':
			return { type: 'itemSelected', itemId: dest.state.itemId };
		case 'edit':
			return { type: 'editTapped', itemId: dest.state.itemId };
		case 'add':
			return { type: 'addTapped' };
	}
};

// ============================================================================
// Reducer
// ============================================================================

const inventoryReducer: Reducer<InventoryState, InventoryAction, {}> = (state, action) => {
	switch (action.type) {
		case 'itemSelected': {
			const newState = {
				...state,
				destination: { type: 'detail' as const, state: { itemId: action.itemId } }
			};
			return [newState, createURLSyncEffect<InventoryState, InventoryAction>(serializeState)(newState)];
		}

		case 'editTapped': {
			const newState = {
				...state,
				destination: { type: 'edit' as const, state: { itemId: action.itemId } }
			};
			return [newState, createURLSyncEffect<InventoryState, InventoryAction>(serializeState)(newState)];
		}

		case 'addTapped': {
			const newState = {
				...state,
				destination: { type: 'add' as const, state: {} }
			};
			return [newState, createURLSyncEffect<InventoryState, InventoryAction>(serializeState)(newState)];
		}

		case 'closeDestination': {
			const newState = { ...state, destination: null };
			return [newState, createURLSyncEffect<InventoryState, InventoryAction>(serializeState)(newState)];
		}

		case 'searchChanged':
			return [{ ...state, searchQuery: action.query }, Effect.none()];

		case 'itemDeleted': {
			const newItems = state.items.filter((item) => item.id !== action.itemId);
			return [{ ...state, items: newItems }, Effect.none()];
		}

		default:
			return [state, Effect.none()];
	}
};

const serializeState = (state: InventoryState): string => {
	return serializeDestination(state.destination, serializerConfig);
};

// ============================================================================
// Tests
// ============================================================================

describe('Routing Integration', () => {
	let originalPathname: string;

	beforeEach(() => {
		originalPathname = window.location.pathname;
		history.replaceState(null, '', '/inventory');
	});

	afterEach(() => {
		history.replaceState(null, '', originalPathname);
	});

	describe('complete state → URL flow', () => {
		it('updates URL when state changes', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [
					{ id: '1', name: 'Item 1', quantity: 10 },
					{ id: '2', name: 'Item 2', quantity: 5 }
				],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			// Initial URL should be base path
			expect(window.location.pathname).toBe('/inventory');

			// Select an item
			store.dispatch({ type: 'itemSelected', itemId: '1' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// URL should update
			expect(window.location.pathname).toBe('/inventory/item-1');
			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { itemId: '1' }
			});

			// Edit the item
			store.dispatch({ type: 'editTapped', itemId: '1' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// URL should update to edit
			expect(window.location.pathname).toBe('/inventory/item-1/edit');
			expect(store.state.destination).toEqual({
				type: 'edit',
				state: { itemId: '1' }
			});

			// Close destination
			store.dispatch({ type: 'closeDestination' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// URL should return to base
			expect(window.location.pathname).toBe('/inventory');
			expect(store.state.destination).toBe(null);
		});

		it('handles rapid state changes', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			// Rapidly change destinations
			store.dispatch({ type: 'itemSelected', itemId: '1' });
			store.dispatch({ type: 'itemSelected', itemId: '2' });
			store.dispatch({ type: 'itemSelected', itemId: '3' });

			await new Promise((resolve) => setTimeout(resolve, 100));

			// URL should reflect final state
			expect(window.location.pathname).toBe('/inventory/item-3');
			expect(store.state.destination?.state.itemId).toBe('3');
		});
	});

	describe('complete URL → state flow (browser history)', () => {
		it('updates state when browser back/forward is used', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			// Navigate forward in browser
			history.pushState(null, '', '/inventory/item-123');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should update
			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { itemId: '123' }
			});

			// Navigate to edit
			history.pushState(null, '', '/inventory/item-123/edit');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should update to edit
			expect(store.state.destination).toEqual({
				type: 'edit',
				state: { itemId: '123' }
			});

			// Browser back
			history.back();
			await new Promise((resolve) => setTimeout(resolve, 100));

			// State should revert to detail
			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { itemId: '123' }
			});

			cleanup();
		});

		it('handles browser back to root', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			// Navigate to item
			history.pushState(null, '', '/inventory/item-999');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).not.toBe(null);

			// Navigate back to root
			history.pushState(null, '', '/inventory');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should clear destination
			expect(store.state.destination).toBe(null);

			cleanup();
		});
	});

	describe('bidirectional sync (state ↔ URL)', () => {
		it('syncs state and URL in both directions', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			// 1. State → URL: Dispatch action
			store.dispatch({ type: 'itemSelected', itemId: 'abc' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory/item-abc');
			expect(store.state.destination?.state.itemId).toBe('abc');

			// 2. URL → State: Browser navigation
			history.pushState(null, '', '/inventory/item-xyz');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination?.state.itemId).toBe('xyz');

			// 3. State → URL: Another action
			store.dispatch({ type: 'editTapped', itemId: 'xyz' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory/item-xyz/edit');

			// 4. URL → State: Browser back
			history.back();
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { itemId: 'xyz' }
			});

			cleanup();
		});

		it('prevents infinite loops', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			// Dispatch action (will trigger URL update with metadata flag)
			store.dispatch({ type: 'itemSelected', itemId: '123' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// URL was updated, but popstate handler should ignore it (metadata flag)
			expect(window.location.pathname).toBe('/inventory/item-123');
			expect(store.state.destination?.state.itemId).toBe('123');

			// No loop should occur (test passes if no infinite recursion)

			cleanup();
		});
	});

	describe('deep linking', () => {
		it('initializes state from URL on load', () => {
			history.replaceState(null, '', '/inventory/item-deep-link');

			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const initialState = createInitialStateFromURL(
				defaultState,
				(path) => parseDestination(path, parserConfig),
				(state, destination) => ({ ...state, destination })
			);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { itemId: 'deep-link' }
			});
		});

		it('creates store with initial state from URL', () => {
			history.replaceState(null, '', '/inventory/item-456/edit');

			const defaultState: InventoryState = {
				destination: null,
				items: [{ id: '456', name: 'Deep Link Item', quantity: 1 }],
				searchQuery: ''
			};

			const initialState = createInitialStateFromURL(
				defaultState,
				(path) => parseDestination(path, parserConfig),
				(state, destination) => ({ ...state, destination })
			);

			const store = createStore({
				initialState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			// State should match URL
			expect(store.state.destination).toEqual({
				type: 'edit',
				state: { itemId: '456' }
			});

			// Items should be preserved
			expect(store.state.items).toHaveLength(1);
			expect(store.state.items[0].id).toBe('456');
		});

		it('falls back to default state for invalid URL', () => {
			history.replaceState(null, '', '/invalid/path');

			const defaultState: InventoryState = {
				destination: null,
				items: [{ id: '1', name: 'Item 1', quantity: 10 }],
				searchQuery: ''
			};

			const initialState = createInitialStateFromURL(
				defaultState,
				(path) => parseDestination(path, parserConfig),
				(state, destination) => ({ ...state, destination })
			);

			expect(initialState).toEqual(defaultState);
			expect(initialState.destination).toBe(null);
		});
	});

	describe('edge cases', () => {
		it('handles actions that do not affect URL', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			// Action that doesn't change destination
			store.dispatch({ type: 'searchChanged', query: 'test' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// URL should remain unchanged
			expect(window.location.pathname).toBe('/inventory');
			expect(store.state.searchQuery).toBe('test');
		});

		it('handles destination change followed by non-destination action', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [{ id: '1', name: 'Item 1', quantity: 10 }],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			// Change destination
			store.dispatch({ type: 'itemSelected', itemId: '1' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory/item-1');

			// Non-destination action
			store.dispatch({ type: 'searchChanged', query: 'test' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// URL should remain at item-1
			expect(window.location.pathname).toBe('/inventory/item-1');
			expect(store.state.searchQuery).toBe('test');
		});

		it('handles item deletion while viewing that item', async () => {
			const defaultState: InventoryState = {
				destination: { type: 'detail', state: { itemId: '1' } },
				items: [{ id: '1', name: 'Item 1', quantity: 10 }],
				searchQuery: ''
			};

			const store = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			// Delete the item
			store.dispatch({ type: 'itemDeleted', itemId: '1' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Destination remains (orphaned state - app logic could handle this)
			expect(store.state.destination?.state.itemId).toBe('1');
			expect(store.state.items).toHaveLength(0);
		});

		it('handles multiple store instances', async () => {
			const defaultState: InventoryState = {
				destination: null,
				items: [],
				searchQuery: ''
			};

			const store1 = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const store2 = createStore({
				initialState: defaultState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const cleanup1 = syncBrowserHistory(store1, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			const cleanup2 = syncBrowserHistory(store2, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			// Browser navigation affects both stores
			history.pushState(null, '', '/inventory/item-multi');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store1.state.destination?.state.itemId).toBe('multi');
			expect(store2.state.destination?.state.itemId).toBe('multi');

			cleanup1();
			cleanup2();
		});
	});

	describe('complete user journey', () => {
		it('simulates full user workflow', async () => {
			// 1. User loads app from bookmarked URL
			history.replaceState(null, '', '/inventory/item-999');

			const defaultState: InventoryState = {
				destination: null,
				items: [
					{ id: '999', name: 'Bookmarked Item', quantity: 5 },
					{ id: '1000', name: 'Another Item', quantity: 3 }
				],
				searchQuery: ''
			};

			const initialState = createInitialStateFromURL(
				defaultState,
				(path) => parseDestination(path, parserConfig),
				(state, destination) => ({ ...state, destination })
			);

			const store = createStore({
				initialState,
				reducer: inventoryReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: (path) => parseDestination(path, parserConfig),
				serialize: serializeState,
				destinationToAction
			});

			// Should load with item 999 selected
			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { itemId: '999' }
			});

			// 2. User clicks edit
			store.dispatch({ type: 'editTapped', itemId: '999' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory/item-999/edit');
			expect(store.state.destination?.type).toBe('edit');

			// 3. User selects different item
			store.dispatch({ type: 'itemSelected', itemId: '1000' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory/item-1000');
			expect(store.state.destination?.state.itemId).toBe('1000');

			// 4. User searches (URL unchanged)
			store.dispatch({ type: 'searchChanged', query: 'another' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory/item-1000');
			expect(store.state.searchQuery).toBe('another');

			// 5. User closes detail view
			store.dispatch({ type: 'closeDestination' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.location.pathname).toBe('/inventory');
			expect(store.state.destination).toBe(null);

			// 6. User manually types URL for edit page
			history.pushState(null, '', '/inventory/item-999/edit');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).toEqual({
				type: 'edit',
				state: { itemId: '999' }
			});

			// 7. User closes via action
			store.dispatch({ type: 'closeDestination' });
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).toBe(null);
			expect(window.location.pathname).toBe('/inventory');

			cleanup();
		});
	});
});
