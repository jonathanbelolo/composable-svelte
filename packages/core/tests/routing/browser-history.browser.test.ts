/**
 * Browser Tests: Browser History Integration
 *
 * Tests for syncBrowserHistory function with real browser APIs.
 * Phase 7, Day 5: Browser History Integration
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncBrowserHistory } from '../../src/lib/routing/browser-history';
import { createStore } from '../../src/lib/store';
import type { Reducer } from '../../src/lib/types';
import { Effect } from '../../src/lib/effect';

// Test State and Types
interface TestState {
	destination: TestDestination | null;
	items: string[];
}

type TestDestination =
	| { type: 'detail'; state: { id: string } }
	| { type: 'edit'; state: { id: string } }
	| { type: 'add'; state: {} };

type TestAction =
	| { type: 'itemSelected'; id: string }
	| { type: 'editTapped'; id: string }
	| { type: 'addTapped' }
	| { type: 'closeDestination' };

// Serializer/Parser helpers
const serializeState = (state: TestState): string => {
	if (!state.destination) return '/inventory';
	switch (state.destination.type) {
		case 'detail':
			return `/inventory/item-${state.destination.state.id}`;
		case 'edit':
			return `/inventory/item-${state.destination.state.id}/edit`;
		case 'add':
			return '/inventory/add';
	}
};

const parseURL = (path: string): TestDestination | null => {
	if (path === '/inventory') return null;
	if (path === '/inventory/add') return { type: 'add', state: {} };

	// Check edit pattern first (more specific)
	const editMatch = path.match(/^\/inventory\/item-([^/]+)\/edit$/);
	if (editMatch) {
		return { type: 'edit', state: { id: editMatch[1] } };
	}

	// Then check detail pattern
	const detailMatch = path.match(/^\/inventory\/item-([^/]+)$/);
	if (detailMatch) {
		return { type: 'detail', state: { id: detailMatch[1] } };
	}

	return null;
};

const destinationToAction = (dest: TestDestination | null): TestAction | null => {
	if (!dest) return { type: 'closeDestination' };
	switch (dest.type) {
		case 'detail':
			return { type: 'itemSelected', id: dest.state.id };
		case 'edit':
			return { type: 'editTapped', id: dest.state.id };
		case 'add':
			return { type: 'addTapped' };
	}
};

// Test Reducer
const testReducer: Reducer<TestState, TestAction, {}> = (state, action) => {
	switch (action.type) {
		case 'itemSelected':
			return [
				{
					...state,
					destination: { type: 'detail', state: { id: action.id } }
				},
				Effect.none()
			];
		case 'editTapped':
			return [
				{
					...state,
					destination: { type: 'edit', state: { id: action.id } }
				},
				Effect.none()
			];
		case 'addTapped':
			return [
				{
					...state,
					destination: { type: 'add', state: {} }
				},
				Effect.none()
			];
		case 'closeDestination':
			return [{ ...state, destination: null }, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

describe('syncBrowserHistory', () => {
	let originalPathname: string;

	beforeEach(() => {
		// Store original pathname
		originalPathname = window.location.pathname;

		// Reset to base URL
		history.replaceState(null, '', '/inventory');
	});

	afterEach(() => {
		// Restore original pathname
		history.replaceState(null, '', originalPathname);
	});

	describe('browser navigation to store', () => {
		it('dispatches action when back button is clicked', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Navigate forward
			history.pushState(null, '', '/inventory/item-123');

			// Trigger popstate (simulate back button)
			history.back();

			// Wait for popstate event
			await new Promise((resolve) => setTimeout(resolve, 100));

			// State should have been updated
			expect(store.state.destination).toBe(null);

			cleanup();
		});

		it('dispatches action for forward button', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Setup history: /inventory -> /item-123 -> /inventory
			history.pushState(null, '', '/inventory/item-123');
			history.pushState(null, '', '/inventory');

			// Go back to /item-123
			history.back();
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Go forward to /inventory
			history.forward();
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should be back at inventory root
			expect(store.state.destination).toBe(null);

			cleanup();
		});

		it('parses URL and dispatches correct action', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Navigate to detail page
			history.pushState(null, '', '/inventory/item-456');

			// Simulate popstate
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should be updated
			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { id: '456' }
			});

			cleanup();
		});

		it('handles multiple back clicks', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Setup history: / -> /item-1 -> /item-2 -> /item-3
			history.pushState(null, '', '/inventory/item-1');
			history.pushState(null, '', '/inventory/item-2');
			history.pushState(null, '', '/inventory/item-3');

			// Click back twice
			history.back();
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination?.state.id).toBe('2');

			history.back();
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination?.state.id).toBe('1');

			cleanup();
		});
	});

	describe('loop prevention', () => {
		it('ignores popstate events from own URL updates', async () => {
			const dispatchSpy = vi.fn();
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			// Spy on dispatch
			const originalDispatch = store.dispatch.bind(store);
			store.dispatch = vi.fn((action) => {
				dispatchSpy(action);
				return originalDispatch(action);
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Simulate URL sync effect update (with metadata flag)
			history.pushState({ composableSvelteSync: true }, '', '/inventory/item-789');

			// Trigger popstate
			window.dispatchEvent(
				new PopStateEvent('popstate', {
					state: { composableSvelteSync: true }
				})
			);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Dispatch should NOT have been called (loop prevented)
			expect(dispatchSpy).not.toHaveBeenCalled();

			cleanup();
		});

		it('processes popstate without metadata flag', async () => {
			const dispatchSpy = vi.fn();
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			// Spy on dispatch
			const originalDispatch = store.dispatch.bind(store);
			store.dispatch = vi.fn((action) => {
				dispatchSpy(action);
				return originalDispatch(action);
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Simulate browser navigation (no metadata)
			history.pushState(null, '', '/inventory/item-999');

			// Trigger popstate
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Dispatch SHOULD have been called
			expect(dispatchSpy).toHaveBeenCalledWith({ type: 'itemSelected', id: '999' });

			cleanup();
		});
	});

	describe('cleanup', () => {
		it('removes event listener on cleanup', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Cleanup immediately
			cleanup();

			// Try to trigger popstate
			history.pushState(null, '', '/inventory/item-123');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should NOT have changed (listener was removed)
			expect(store.state.destination).toBe(null);
		});

		it('can call cleanup multiple times safely', () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Call cleanup multiple times
			expect(() => {
				cleanup();
				cleanup();
				cleanup();
			}).not.toThrow();
		});
	});

	describe('invalid URLs', () => {
		it('handles invalid URL gracefully', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Navigate to invalid URL
			history.pushState(null, '', '/invalid/path');

			// Trigger popstate
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should remain unchanged (or handle as closeDestination)
			expect(store.state.destination).toBe(null);

			cleanup();
		});

		it('handles null action from destinationToAction', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction: () => null // Always return null
			});

			// Navigate to valid URL
			history.pushState(null, '', '/inventory/item-123');

			// Trigger popstate
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// State should remain unchanged (no action dispatched)
			expect(store.state.destination).toBe(null);

			cleanup();
		});
	});

	describe('different destination types', () => {
		it('handles detail destination', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			history.pushState(null, '', '/inventory/item-abc');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).toEqual({
				type: 'detail',
				state: { id: 'abc' }
			});

			cleanup();
		});

		it('handles edit destination', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			history.pushState(null, '', '/inventory/item-def/edit');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).toEqual({
				type: 'edit',
				state: { id: 'def' }
			});

			cleanup();
		});

		it('handles add destination', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			history.pushState(null, '', '/inventory/add');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).toEqual({
				type: 'add',
				state: {}
			});

			cleanup();
		});

		it('handles return to root', async () => {
			const store = createStore({
				initialState: {
					destination: { type: 'detail', state: { id: '123' } },
					items: []
				},
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			history.pushState(null, '', '/inventory');
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(store.state.destination).toBe(null);

			cleanup();
		});
	});

	describe('rapid navigation', () => {
		it('handles rapid back/forward clicks', async () => {
			const store = createStore({
				initialState: { destination: null, items: [] },
				reducer: testReducer,
				dependencies: {}
			});

			const cleanup = syncBrowserHistory(store, {
				parse: parseURL,
				serialize: serializeState,
				destinationToAction
			});

			// Setup history
			history.pushState(null, '', '/inventory/item-1');
			history.pushState(null, '', '/inventory/item-2');

			// Rapid navigation with small delays between each
			history.back();
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			history.forward();
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			history.back();
			window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should end up at item-1 (after final back click)
			expect(store.state.destination?.state.id).toBe('1');

			cleanup();
		});
	});
});
