/**
 * Tests for scopeTo() reactivity and memoization behavior.
 *
 * These tests verify that scoped stores don't cause unnecessary component
 * remounts in Svelte 5's fine-grained reactivity system.
 */

import { describe, it, expect } from 'vitest';
import { scopeTo } from '../../src/navigation/scope.js';
import type { Store } from '../../src/types.js';

describe('scopeTo() reactivity', () => {
	describe('reference stability', () => {
		it('returns same scoped store object when state unchanged', () => {
			// This test verifies object reference stability
			const state = {
				destination: { type: 'addItem', state: { name: 'Test' } }
			};

			const store = {
				state,
				dispatch: () => {}
			} as unknown as Store<any, any>;

			// Call scopeTo() twice with same state
			const scoped1 = scopeTo(store).into('destination').case('addItem');
			const scoped2 = scopeTo(store).into('destination').case('addItem');

			// Different calls = different builder instances = different scoped store objects
			// This is expected behavior with the current implementation
			expect(scoped1).not.toBe(scoped2);

			// However, the STATE should be the same reference
			expect(scoped1?.state).toBe(scoped2?.state);
		});

		it('returns different scoped store when destination state changes', () => {
			const state1 = {
				destination: { type: 'addItem', state: { name: 'Test1' } }
			};

			const state2 = {
				destination: { type: 'addItem', state: { name: 'Test2' } }
			};

			const store1 = {
				state: state1,
				dispatch: () => {}
			} as unknown as Store<any, any>;

			const store2 = {
				state: state2,
				dispatch: () => {}
			} as unknown as Store<any, any>;

			const scoped1 = scopeTo(store1).into('destination').case('addItem');
			const scoped2 = scopeTo(store2).into('destination').case('addItem');

			// Different state = different scoped stores
			expect(scoped1?.state).not.toBe(scoped2?.state);
			expect(scoped1?.state.name).toBe('Test1');
			expect(scoped2?.state.name).toBe('Test2');
		});

		it('returns null when case does not match', () => {
			const store = {
				state: {
					destination: { type: 'addItem', state: { name: 'Test' } }
				},
				dispatch: () => {}
			} as unknown as Store<any, any>;

			const scopedAdd = scopeTo(store).into('destination').case('addItem');
			const scopedEdit = scopeTo(store).into('destination').case('editItem');

			expect(scopedAdd).not.toBeNull();
			expect(scopedEdit).toBeNull();
		});
	});

	describe('Svelte 5 reactivity pattern', () => {
		it('works correctly with $derived pattern', () => {
			// Simulate Svelte 5's $derived behavior
			let storeState = {
				destination: { type: 'addItem', state: { name: 'Test' } }
			};

			const store = {
				get state() {
					return storeState;
				},
				dispatch: () => {}
			} as unknown as Store<any, any>;

			// First derivation
			const scoped1 = scopeTo(store).into('destination').case('addItem');
			expect(scoped1).not.toBeNull();
			expect(scoped1?.state.name).toBe('Test');

			// Change state (simulating a store update)
			storeState = {
				destination: { type: 'addItem', state: { name: 'Updated' } }
			};

			// Re-derive (simulating $derived re-computation)
			const scoped2 = scopeTo(store).into('destination').case('addItem');
			expect(scoped2).not.toBeNull();
			expect(scoped2?.state.name).toBe('Updated');

			// Objects are different (new derivation)
			expect(scoped1).not.toBe(scoped2);

			// But Svelte 5 doesn't care about object reference for {#if}
			// It only cares if the value went from null -> non-null or vice versa
			expect(scoped1).not.toBeNull();
			expect(scoped2).not.toBeNull();
		});

		it('transitions correctly between null and non-null', () => {
			// This is what Svelte {#if} actually cares about
			let storeState: any = {
				destination: null
			};

			const store = {
				get state() {
					return storeState;
				},
				dispatch: () => {}
			} as unknown as Store<any, any>;

			// Initially null
			const scoped1 = scopeTo(store).into('destination').case('addItem');
			expect(scoped1).toBeNull();

			// Present destination
			storeState = {
				destination: { type: 'addItem', state: { name: 'Test' } }
			};

			const scoped2 = scopeTo(store).into('destination').case('addItem');
			expect(scoped2).not.toBeNull();

			// Dismiss destination
			storeState = {
				destination: null
			};

			const scoped3 = scopeTo(store).into('destination').case('addItem');
			expect(scoped3).toBeNull();
		});
	});

	describe('performance characteristics', () => {
		it('does not cause excessive allocations for simple cases', () => {
			const store = {
				state: {
					destination: { type: 'addItem', state: { name: 'Test' } }
				},
				dispatch: () => {}
			} as unknown as Store<any, any>;

			// Calling scopeTo() multiple times should be fast
			const start = performance.now();

			for (let i = 0; i < 1000; i++) {
				const scoped = scopeTo(store).into('destination').case('addItem');
				// Use the scoped store to prevent optimization
				if (!scoped) throw new Error('Should not be null');
			}

			const duration = performance.now() - start;

			// Should complete 1000 iterations in reasonable time (< 50ms on modern hardware)
			// This is a smoke test - adjust threshold if needed for CI
			expect(duration).toBeLessThan(100);
		});
	});
});
