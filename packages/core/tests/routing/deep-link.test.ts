/**
 * Unit Tests: Deep Linking
 *
 * Tests for createInitialStateFromURL function.
 * Phase 7, Day 6: Deep Linking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInitialStateFromURL } from '../../src/lib/routing/deep-link';

// Test State Types
interface TestState {
	destination: TestDestination | null;
	items: string[];
	user: { name: string } | null;
}

type TestDestination =
	| { type: 'detail'; state: { id: string } }
	| { type: 'edit'; state: { id: string; field?: string } }
	| { type: 'add'; state: {} };

// Default State
const defaultState: TestState = {
	destination: null,
	items: ['item1', 'item2', 'item3'],
	user: { name: 'Test User' }
};

// Parse function for tests
const parseURL = (path: string): TestDestination | null => {
	if (path === '/inventory') return null;
	if (path === '/inventory/add') return { type: 'add', state: {} };

	// Edit with field
	const editFieldMatch = path.match(/^\/inventory\/item-([^/]+)\/edit\/([^/]+)$/);
	if (editFieldMatch) {
		return {
			type: 'edit',
			state: { id: editFieldMatch[1], field: editFieldMatch[2] }
		};
	}

	// Edit without field
	const editMatch = path.match(/^\/inventory\/item-([^/]+)\/edit$/);
	if (editMatch) {
		return { type: 'edit', state: { id: editMatch[1] } };
	}

	// Detail
	const detailMatch = path.match(/^\/inventory\/item-([^/]+)$/);
	if (detailMatch) {
		return { type: 'detail', state: { id: detailMatch[1] } };
	}

	return null;
};

// Set destination function
const setDestination = (state: TestState, destination: TestDestination | null): TestState => {
	return { ...state, destination };
};

describe('createInitialStateFromURL', () => {
	let originalPathname: string;

	beforeEach(() => {
		originalPathname = window.location.pathname;
	});

	afterEach(() => {
		// Restore original pathname
		history.replaceState(null, '', originalPathname);
	});

	describe('root URL handling', () => {
		it('returns default state for root URL', () => {
			history.replaceState(null, '', '/inventory');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState).toEqual(defaultState);
			expect(initialState.destination).toBe(null);
			expect(initialState.items).toEqual(['item1', 'item2', 'item3']);
			expect(initialState.user).toEqual({ name: 'Test User' });
		});

		it('returns default state for base "/" URL', () => {
			history.replaceState(null, '', '/');

			const parse = (path: string) => (path === '/' ? null : parseURL(path));
			const initialState = createInitialStateFromURL(defaultState, parse, setDestination);

			expect(initialState).toEqual(defaultState);
			expect(initialState.destination).toBe(null);
		});

		it('preserves all fields from default state', () => {
			history.replaceState(null, '', '/inventory');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			// All fields should be preserved
			expect(initialState.items).toBe(defaultState.items); // Same reference
			expect(initialState.user).toBe(defaultState.user); // Same reference
		});
	});

	describe('valid URL parsing', () => {
		it('creates state from detail URL', () => {
			history.replaceState(null, '', '/inventory/item-123');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: '123' }
			});
			// Other fields preserved
			expect(initialState.items).toEqual(['item1', 'item2', 'item3']);
			expect(initialState.user).toEqual({ name: 'Test User' });
		});

		it('creates state from edit URL', () => {
			history.replaceState(null, '', '/inventory/item-456/edit');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'edit',
				state: { id: '456' }
			});
		});

		it('creates state from edit URL with field', () => {
			history.replaceState(null, '', '/inventory/item-789/edit/name');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'edit',
				state: { id: '789', field: 'name' }
			});
		});

		it('creates state from add URL', () => {
			history.replaceState(null, '', '/inventory/add');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'add',
				state: {}
			});
		});
	});

	describe('invalid URL handling', () => {
		it('returns default state for invalid URL', () => {
			history.replaceState(null, '', '/invalid/path');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState).toEqual(defaultState);
			expect(initialState.destination).toBe(null);
		});

		it('returns default state for unknown route', () => {
			history.replaceState(null, '', '/inventory/unknown/route');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState).toEqual(defaultState);
		});

		it('returns default state for malformed URL', () => {
			history.replaceState(null, '', '/inventory/item-');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState).toEqual(defaultState);
		});
	});

	describe('special characters in URLs', () => {
		it('handles IDs with dashes', () => {
			history.replaceState(null, '', '/inventory/item-my-item-123');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: 'my-item-123' }
			});
		});

		it('handles IDs with underscores', () => {
			history.replaceState(null, '', '/inventory/item-my_item_456');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: 'my_item_456' }
			});
		});

		it('handles numeric IDs', () => {
			history.replaceState(null, '', '/inventory/item-12345');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: '12345' }
			});
		});

		it('handles UUID IDs', () => {
			history.replaceState(null, '', '/inventory/item-550e8400-e29b-41d4-a716-446655440000');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: '550e8400-e29b-41d4-a716-446655440000' }
			});
		});
	});

	describe('setDestination function variations', () => {
		it('uses custom setDestination logic', () => {
			history.replaceState(null, '', '/inventory/item-999');

			// Custom setDestination that adds metadata
			const customSetDestination = (
				state: TestState,
				destination: TestDestination | null
			): TestState => {
				return {
					...state,
					destination,
					items: [...state.items, 'new-item'] // Add item when destination is set
				};
			};

			const initialState = createInitialStateFromURL(
				defaultState,
				parseURL,
				customSetDestination
			);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: '999' }
			});
			expect(initialState.items).toEqual(['item1', 'item2', 'item3', 'new-item']);
		});

		it('handles setDestination that modifies other fields', () => {
			history.replaceState(null, '', '/inventory/add');

			const customSetDestination = (
				state: TestState,
				destination: TestDestination | null
			): TestState => {
				return {
					...state,
					destination,
					user: destination?.type === 'add' ? null : state.user // Clear user for add
				};
			};

			const initialState = createInitialStateFromURL(
				defaultState,
				parseURL,
				customSetDestination
			);

			expect(initialState.destination).toEqual({ type: 'add', state: {} });
			expect(initialState.user).toBe(null);
		});
	});

	describe('query strings and hashes (ignored in v1)', () => {
		it('ignores query string in URL', () => {
			// Query strings should be stripped before parsing (browser behavior)
			// For this test, we manually set pathname without query
			history.replaceState(null, '', '/inventory/item-123?filter=active');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			// Should parse the pathname part only
			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: '123' }
			});
		});

		it('ignores hash fragment in URL', () => {
			// Hash fragments should be stripped before parsing (browser behavior)
			history.replaceState(null, '', '/inventory/item-456#section');

			const initialState = createInitialStateFromURL(defaultState, parseURL, setDestination);

			// Should parse the pathname part only
			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: '456' }
			});
		});
	});

	describe('complex state structures', () => {
		interface ComplexState {
			destination: TestDestination | null;
			ui: {
				sidebarOpen: boolean;
				theme: 'light' | 'dark';
			};
			data: {
				items: string[];
				filters: Record<string, string>;
			};
		}

		const complexDefaultState: ComplexState = {
			destination: null,
			ui: {
				sidebarOpen: true,
				theme: 'light'
			},
			data: {
				items: ['a', 'b', 'c'],
				filters: { category: 'all' }
			}
		};

		const complexSetDestination = (
			state: ComplexState,
			destination: TestDestination | null
		): ComplexState => {
			return { ...state, destination };
		};

		it('preserves complex nested state structure', () => {
			history.replaceState(null, '', '/inventory/item-complex');

			const initialState = createInitialStateFromURL(
				complexDefaultState,
				parseURL,
				complexSetDestination
			);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: 'complex' }
			});
			expect(initialState.ui).toEqual({
				sidebarOpen: true,
				theme: 'light'
			});
			expect(initialState.data).toEqual({
				items: ['a', 'b', 'c'],
				filters: { category: 'all' }
			});
		});
	});

	describe('edge cases', () => {
		it('handles empty default state', () => {
			const emptyState: TestState = {
				destination: null,
				items: [],
				user: null
			};

			history.replaceState(null, '', '/inventory/item-empty');

			const initialState = createInitialStateFromURL(emptyState, parseURL, setDestination);

			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: 'empty' }
			});
			expect(initialState.items).toEqual([]);
			expect(initialState.user).toBe(null);
		});

		it('handles destination that matches default state structure', () => {
			const stateWithDestination: TestState = {
				destination: { type: 'detail', state: { id: 'existing' } },
				items: [],
				user: null
			};

			history.replaceState(null, '', '/inventory/item-new');

			const initialState = createInitialStateFromURL(
				stateWithDestination,
				parseURL,
				setDestination
			);

			// Should override existing destination
			expect(initialState.destination).toEqual({
				type: 'detail',
				state: { id: 'new' }
			});
		});
	});
});
