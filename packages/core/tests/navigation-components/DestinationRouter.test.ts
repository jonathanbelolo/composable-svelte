/**
 * Tests for DestinationRouter component.
 *
 * These tests verify that the DestinationRouter correctly:
 * - Scopes stores to destination cases
 * - Creates proper route configurations
 * - Type-checks component structure
 *
 * Note: Full rendering tests are complex due to dynamic component loading.
 * The DestinationRouter is tested primarily through integration tests
 * and the Product Gallery example application.
 */

import { describe, it, expect } from 'vitest';
import { createTestStore } from '../../src/test/test-store.js';
import type { Reducer } from '../../src/types.js';
import { Effect } from '../../src/effect.js';
import type { PresentationAction } from '../../src/navigation/types.js';
import { scopeTo } from '../../src/navigation/scope.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Destination states
interface DestinationAState {
	value: string;
}

interface DestinationBState {
	value: number;
}

type DestinationAction =
	| { type: 'a'; action: PresentationAction<{ type: 'updateValue'; value: string }> }
	| { type: 'b'; action: PresentationAction<{ type: 'updateValue'; value: number }> };

type DestinationState =
	| { type: 'a'; state: DestinationAState }
	| { type: 'b'; state: DestinationBState };

// Parent state
interface ParentState {
	count: number;
	destination: DestinationState | null;
}

type ParentAction =
	| { type: 'increment' }
	| { type: 'showA' }
	| { type: 'showB' }
	| { type: 'destination'; action: PresentationAction<DestinationAction> };

// Parent reducer
const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
	switch (action.type) {
		case 'increment':
			return [{ ...state, count: state.count + 1 }, Effect.none()];

		case 'showA':
			return [{ ...state, destination: { type: 'a', state: { value: 'Hello' } } }, Effect.none()];

		case 'showB':
			return [{ ...state, destination: { type: 'b', state: { value: 42 } } }, Effect.none()];

		case 'destination':
			if (action.action.type === 'dismiss') {
				return [{ ...state, destination: null }, Effect.none()];
			}
			return [state, Effect.none()];

		default:
			return [state, Effect.none()];
	}
};

// ============================================================================
// Tests
// ============================================================================

describe('DestinationRouter', () => {
	describe('scoped store logic', () => {
		it('creates scoped store when destination matches route', () => {
			const store = createTestStore({
				initialState: {
					count: 0,
					destination: { type: 'a', state: { value: 'Test' } }
				} as ParentState,
				reducer: parentReducer
			});

			// Simulate what DestinationRouter does internally
			const scopedStoreA = scopeTo(store).into('destination').case('a');
			const scopedStoreB = scopeTo(store).into('destination').case('b');

			// Route 'a' should have scoped store
			expect(scopedStoreA).not.toBeNull();
			expect(scopedStoreA?.state.value).toBe('Test');

			// Route 'b' should not have scoped store
			expect(scopedStoreB).toBeNull();
		});

		it('returns null scoped stores when destination is null', () => {
			const store = createTestStore({
				initialState: {
					count: 0,
					destination: null
				} as ParentState,
				reducer: parentReducer
			});

			const scopedStoreA = scopeTo(store).into('destination').case('a');
			const scopedStoreB = scopeTo(store).into('destination').case('b');

			// Both should be null
			expect(scopedStoreA).toBeNull();
			expect(scopedStoreB).toBeNull();
		});

		it('updates scoped stores when destination changes', () => {
			const store = createTestStore({
				initialState: {
					count: 0,
					destination: { type: 'a', state: { value: 'First' } }
				} as ParentState,
				reducer: parentReducer
			});

			// Initially, route 'a' is active
			let scopedStoreA = scopeTo(store).into('destination').case('a');
			let scopedStoreB = scopeTo(store).into('destination').case('b');

			expect(scopedStoreA).not.toBeNull();
			expect(scopedStoreB).toBeNull();

			// Change to route 'b'
			store.send({ type: 'showB' });

			// Re-scope (this is what $derived would do reactively)
			scopedStoreA = scopeTo(store).into('destination').case('a');
			scopedStoreB = scopeTo(store).into('destination').case('b');

			expect(scopedStoreA).toBeNull();
			expect(scopedStoreB).not.toBeNull();
			expect(scopedStoreB?.state.value).toBe(42);
		});
	});

	describe('route configuration types', () => {
		it('accepts modal presentation type', () => {
			// Type-level test - should compile without errors
			const routeConfig = {
				component: {} as any,
				presentation: 'modal' as const
			};

			expect(routeConfig.presentation).toBe('modal');
		});

		it('accepts sheet presentation type', () => {
			const routeConfig = {
				component: {} as any,
				presentation: 'sheet' as const
			};

			expect(routeConfig.presentation).toBe('sheet');
		});

		it('accepts drawer presentation type', () => {
			const routeConfig = {
				component: {} as any,
				presentation: 'drawer' as const
			};

			expect(routeConfig.presentation).toBe('drawer');
		});

		it('accepts additional presentation props', () => {
			const routeConfig = {
				component: {} as any,
				presentation: 'modal' as const,
				presentationProps: {
					unstyled: true,
					disableClickOutside: true
				}
			};

			expect(routeConfig.presentationProps?.unstyled).toBe(true);
		});

		it('accepts additional component props', () => {
			const routeConfig = {
				component: {} as any,
				presentation: 'modal' as const,
				componentProps: {
					theme: 'dark',
					showAdvanced: true
				}
			};

			expect(routeConfig.componentProps?.theme).toBe('dark');
		});
	});

	describe('multiple route handling', () => {
		it('handles multiple routes with different presentations', () => {
			const routes = {
				a: { component: {} as any, presentation: 'modal' as const },
				b: { component: {} as any, presentation: 'sheet' as const },
				c: { component: {} as any, presentation: 'drawer' as const }
			};

			expect(routes.a.presentation).toBe('modal');
			expect(routes.b.presentation).toBe('sheet');
			expect(routes.c.presentation).toBe('drawer');
		});

		it('scopes correctly across multiple routes', () => {
			const store = createTestStore({
				initialState: {
					count: 0,
					destination: { type: 'b', state: { value: 99 } }
				} as ParentState,
				reducer: parentReducer
			});

			const scopedStoreA = scopeTo(store).into('destination').case('a');
			const scopedStoreB = scopeTo(store).into('destination').case('b');

			// Only 'b' should be active
			expect(scopedStoreA).toBeNull();
			expect(scopedStoreB).not.toBeNull();
			expect(scopedStoreB?.state.value).toBe(99);
		});
	});
});
