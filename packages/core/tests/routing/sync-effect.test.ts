/**
 * Unit Tests: URL Sync Effect
 *
 * Tests for createURLSyncEffect function.
 * Phase 7, Day 4: URL Sync Effect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createURLSyncEffect } from '../../src/routing/sync-effect';
import { Effect } from '../../src/effect';

// Test State and Action Types
interface TestState {
	destination: TestDestination | null;
	items: string[];
}

type TestDestination =
	| { type: 'detail'; state: { id: string } }
	| { type: 'edit'; state: { id: string } }
	| { type: 'add'; state: {} };

type TestAction = { type: 'test' };

// Serializer for tests
const serializeState = (state: TestState): string => {
	if (!state.destination) {
		return '/inventory';
	}
	switch (state.destination.type) {
		case 'detail':
			return `/inventory/item-${state.destination.state.id}`;
		case 'edit':
			return `/inventory/item-${state.destination.state.id}/edit`;
		case 'add':
			return '/inventory/add';
	}
};

describe('createURLSyncEffect', () => {
	let pushStateSpy: ReturnType<typeof vi.spyOn>;
	let replaceStateSpy: ReturnType<typeof vi.spyOn>;
	let originalPathname: string;

	beforeEach(() => {
		// Store original pathname
		originalPathname = window.location.pathname;

		// Set initial URL (before mocking)
		history.replaceState(null, '', '/inventory');

		// Mock history methods AFTER setting initial state
		pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
		replaceStateSpy = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
	});

	afterEach(() => {
		pushStateSpy.mockRestore();
		replaceStateSpy.mockRestore();
		vi.clearAllTimers();
		// Restore original pathname
		history.replaceState(null, '', originalPathname);
	});

	describe('basic URL sync', () => {
		it('returns Effect.none when URL matches state', () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			const state: TestState = { destination: null, items: [] };
			// URL is already '/inventory' from beforeEach

			const effect = syncEffect(state);

			expect(effect._tag).toBe('None');
			expect(pushStateSpy).not.toHaveBeenCalled();
		});

		it('returns FireAndForget effect when URL differs from state', () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			const state: TestState = {
				destination: { type: 'detail', state: { id: '123' } },
				items: []
			};
			// URL is '/inventory' but state wants '/inventory/item-123'

			const effect = syncEffect(state);

			expect(effect._tag).toBe('FireAndForget');
		});

		it('calls pushState with correct arguments', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			const state: TestState = {
				destination: { type: 'detail', state: { id: '123' } },
				items: []
			};

			const effect = syncEffect(state);

			// Execute the effect
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(pushStateSpy).toHaveBeenCalledTimes(1);
			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-123'
			);
		});

		it('updates URL for different destination types', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			// Detail destination
			const state1: TestState = {
				destination: { type: 'detail', state: { id: '456' } },
				items: []
			};
			const effect1 = syncEffect(state1);
			if (effect1._tag === 'FireAndForget') {
				await effect1.execute(() => {});
			}
			expect(pushStateSpy).toHaveBeenLastCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-456'
			);

			// Edit destination
			const state2: TestState = {
				destination: { type: 'edit', state: { id: '789' } },
				items: []
			};
			const effect2 = syncEffect(state2);
			if (effect2._tag === 'FireAndForget') {
				await effect2.execute(() => {});
			}
			expect(pushStateSpy).toHaveBeenLastCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-789/edit'
			);

			// Add destination
			const state3: TestState = { destination: { type: 'add', state: {} }, items: [] };
			const effect3 = syncEffect(state3);
			if (effect3._tag === 'FireAndForget') {
				await effect3.execute(() => {});
			}
			expect(pushStateSpy).toHaveBeenLastCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/add'
			);
		});
	});

	describe('replace option', () => {
		it('uses replaceState when replace: true', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState, {
				replace: true
			});

			const state: TestState = {
				destination: { type: 'detail', state: { id: '123' } },
				items: []
			};

			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(replaceStateSpy).toHaveBeenCalledTimes(1);
			expect(pushStateSpy).not.toHaveBeenCalled();
			expect(replaceStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-123'
			);
		});

		it('uses pushState when replace: false (default)', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState, {
				replace: false
			});

			const state: TestState = {
				destination: { type: 'detail', state: { id: '123' } },
				items: []
			};

			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(pushStateSpy).toHaveBeenCalledTimes(1);
			expect(replaceStateSpy).not.toHaveBeenCalled();
		});
	});

	describe('debouncing', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('debounces URL updates', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState, {
				debounceMs: 300
			});

			const state1: TestState = {
				destination: { type: 'detail', state: { id: '1' } },
				items: []
			};
			const state2: TestState = {
				destination: { type: 'detail', state: { id: '2' } },
				items: []
			};
			const state3: TestState = {
				destination: { type: 'detail', state: { id: '3' } },
				items: []
			};


			// Trigger multiple updates rapidly
			const effect1 = syncEffect(state1);
			if (effect1._tag === 'FireAndForget') {
				await effect1.execute(() => {});
			}

			const effect2 = syncEffect(state2);
			if (effect2._tag === 'FireAndForget') {
				await effect2.execute(() => {});
			}

			const effect3 = syncEffect(state3);
			if (effect3._tag === 'FireAndForget') {
				await effect3.execute(() => {});
			}

			// No updates yet
			expect(pushStateSpy).not.toHaveBeenCalled();

			// Advance timers
			vi.advanceTimersByTime(300);

			// Only last update should be applied
			expect(pushStateSpy).toHaveBeenCalledTimes(1);
			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-3'
			);
		});

		it('cancels previous timeout on new update', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState, {
				debounceMs: 300
			});

			const state1: TestState = {
				destination: { type: 'detail', state: { id: '1' } },
				items: []
			};
			const state2: TestState = {
				destination: { type: 'detail', state: { id: '2' } },
				items: []
			};


			// First update
			const effect1 = syncEffect(state1);
			if (effect1._tag === 'FireAndForget') {
				await effect1.execute(() => {});
			}

			// Wait 200ms (not enough to trigger)
			vi.advanceTimersByTime(200);
			expect(pushStateSpy).not.toHaveBeenCalled();

			// Second update (should cancel first)
			const effect2 = syncEffect(state2);
			if (effect2._tag === 'FireAndForget') {
				await effect2.execute(() => {});
			}

			// Wait another 200ms (total 400ms from first, but only 200ms from second)
			vi.advanceTimersByTime(200);
			expect(pushStateSpy).not.toHaveBeenCalled();

			// Wait remaining 100ms
			vi.advanceTimersByTime(100);

			// Only second update should be applied
			expect(pushStateSpy).toHaveBeenCalledTimes(1);
			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-2'
			);
		});

		it('applies update after debounce delay', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState, {
				debounceMs: 500
			});

			const state: TestState = {
				destination: { type: 'detail', state: { id: '999' } },
				items: []
			};

			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(pushStateSpy).not.toHaveBeenCalled();

			vi.advanceTimersByTime(500);

			expect(pushStateSpy).toHaveBeenCalledTimes(1);
			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-999'
			);
		});
	});

	describe('metadata flag for loop prevention', () => {
		it('includes composableSvelteSync flag in state metadata', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			const state: TestState = {
				destination: { type: 'detail', state: { id: '123' } },
				items: []
			};

			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/item-123'
			);

			// Verify the flag is present
			const callArgs = pushStateSpy.mock.calls[0];
			expect(callArgs[0]).toHaveProperty('composableSvelteSync', true);
		});

		it('includes flag with replaceState as well', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState, {
				replace: true
			});

			const state: TestState = {
				destination: { type: 'add', state: {} },
				items: []
			};

			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(replaceStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory/add'
			);

			const callArgs = replaceStateSpy.mock.calls[0];
			expect(callArgs[0]).toHaveProperty('composableSvelteSync', true);
		});
	});

	describe('effect serialization', () => {
		it('can be batched with other effects', () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			const state: TestState = {
				destination: { type: 'detail', state: { id: '123' } },
				items: []
			};

			const urlEffect = syncEffect(state);
			const otherEffect = Effect.fireAndForget(() => console.log('other'));
			const batchedEffect = Effect.batch(urlEffect, otherEffect);

			expect(batchedEffect._tag).toBe('Batch');
			if (batchedEffect._tag === 'Batch') {
				expect(batchedEffect.effects).toHaveLength(2);
			}
		});
	});

	describe('edge cases', () => {
		it('handles null destination (root path)', async () => {
			// Temporarily unmock to actually change URL
			pushStateSpy.mockRestore();
			replaceStateSpy.mockRestore();

			// Start with item URL
			history.replaceState(null, '', '/inventory/item-123');

			// Re-mock after URL change
			pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
			replaceStateSpy = vi.spyOn(history, 'replaceState').mockImplementation(() => {});

			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);
			const state: TestState = { destination: null, items: [] };

			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory'
			);
		});

		it('handles transition from destination to null', async () => {
			// Temporarily unmock to actually change URL
			pushStateSpy.mockRestore();
			replaceStateSpy.mockRestore();

			// Start with destination URL
			history.replaceState(null, '', '/inventory/item-456');

			// Re-mock after URL change
			pushStateSpy = vi.spyOn(history, 'pushState').mockImplementation(() => {});
			replaceStateSpy = vi.spyOn(history, 'replaceState').mockImplementation(() => {});

			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);

			// Transition to null
			const state: TestState = { destination: null, items: [] };
			const effect = syncEffect(state);
			if (effect._tag === 'FireAndForget') {
				await effect.execute(() => {});
			}

			expect(pushStateSpy).toHaveBeenCalledWith(
				{ composableSvelteSync: true },
				'',
				'/inventory'
			);
		});

		it('handles rapid state changes without debouncing', async () => {
			const syncEffect = createURLSyncEffect<TestState, TestAction>(serializeState);


			const state1: TestState = {
				destination: { type: 'detail', state: { id: '1' } },
				items: []
			};
			const state2: TestState = {
				destination: { type: 'detail', state: { id: '2' } },
				items: []
			};
			const state3: TestState = {
				destination: { type: 'detail', state: { id: '3' } },
				items: []
			};

			const effect1 = syncEffect(state1);
			if (effect1._tag === 'FireAndForget') {
				await effect1.execute(() => {});
			}

			const effect2 = syncEffect(state2);
			if (effect2._tag === 'FireAndForget') {
				await effect2.execute(() => {});
			}

			const effect3 = syncEffect(state3);
			if (effect3._tag === 'FireAndForget') {
				await effect3.execute(() => {});
			}

			// All updates should be applied immediately
			expect(pushStateSpy).toHaveBeenCalledTimes(3);
		});
	});
});
