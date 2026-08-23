/**
 * Toast/Notification Reducer Tests
 *
 * Comprehensive TestStore tests validating all Toast reducer functionality including
 * queue management, auto-dismiss, manual dismiss, and action execution.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { createTestStore } from '../src/lib/test/test-store.js';
import { toastReducer } from '../src/lib/components/toast/toast.reducer.js';
import {
	createInitialToastState,
	createToast,
	type ToastState,
	type ToastAction,
	type ToastDependencies,
	type Toast
} from '../src/lib/components/toast/toast.types.js';

// ================================================================
// Helper: Advance Time (for auto-dismiss tests)
// ================================================================

function advanceTime(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

// ================================================================
// Test Suite: Adding Toasts
// ================================================================

describe('Adding Toasts', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastAdded: Mock<(toast: Toast) => void>;

	beforeEach(() => {
		onToastAdded = vi.fn<(toast: Toast) => void>();
		store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: { onToastAdded }
		});
	});

	it('adds toast to queue', async () => {
		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Hello, world!')
			},
			(state) => {
				expect(state.toasts).toHaveLength(1);
				expect(state.toasts[0]!.description).toBe('Hello, world!');
				expect(state.toasts[0]!.variant).toBe('default');
			}
		);
	});

	it('generates unique ID and createdAt timestamp', async () => {
		const beforeTime = Date.now();

		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Test')
			},
			(state) => {
				const toast = state.toasts[0];
				expect(toast!.id).toBeDefined();
				expect(toast!.id).toMatch(/^toast-\d+-[a-z0-9]+$/);
				expect(toast!.createdAt).toBeGreaterThanOrEqual(beforeTime);
				expect(toast!.createdAt).toBeLessThanOrEqual(Date.now());
			}
		);
	});

	it('uses default duration if not specified', async () => {
		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Test')
			},
			(state) => {
				expect(state.toasts[0]!.duration).toBe(5000); // Default from state
			}
		);
	});

	it('enforces max toasts limit (removes oldest)', async () => {
		// Add 4 toasts (max is 3)
		await store.send({
			type: 'toastAdded',
			toast: createToast('Toast 1')
		});

		await store.send({
			type: 'toastAdded',
			toast: createToast('Toast 2')
		});

		await store.send({
			type: 'toastAdded',
			toast: createToast('Toast 3')
		});

		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Toast 4')
			},
			(state) => {
				expect(state.toasts).toHaveLength(3);
				expect(state.toasts[0]!.description).toBe('Toast 2'); // First one removed
				expect(state.toasts[1]!.description).toBe('Toast 3');
				expect(state.toasts[2]!.description).toBe('Toast 4');
			}
		);
	});

	it('calls onToastAdded dependency', async () => {
		await store.send({
			type: 'toastAdded',
			toast: createToast('Test')
		});

		expect(onToastAdded).toHaveBeenCalledOnce();
		expect(onToastAdded).toHaveBeenCalledWith(
			expect.objectContaining({
				description: 'Test',
				variant: 'default'
			})
		);
	});
});

// ================================================================
// Test Suite: Auto-Dismiss
// ================================================================

describe('Auto-Dismiss', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;

	beforeEach(() => {
		store = createTestStore({
			initialState: createInitialToastState({ defaultDuration: 100 }), // Short duration for tests
			reducer: toastReducer,
			dependencies: {}
		});
	});

	it('creates afterDelay effect with correct duration', async () => {
		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Test', { duration: 200 })
			},
			(state) => {
				expect(state.toasts).toHaveLength(1);
			}
		);

		// Effect should be created (we can verify by waiting for auto-dismiss)
	});

	it('auto-dismisses toast after duration', async () => {
		await store.send({
			type: 'toastAdded',
			toast: createToast('Auto-dismiss test', { duration: 100 })
		});

		const toastId = store.state.toasts[0]!.id;

		// Wait for auto-dismiss effect
		await advanceTime(150);

		// An auto-dismissed toast now takes the same two-step path as a manual
		// one, so it animates out instead of vanishing.
		await store.receive({ type: 'toastAutoDismissed', id: toastId }, (state) => {
			expect(state.toasts).toHaveLength(1);
			expect(state.toasts[0]!.dismissing).toBe(true);
		});

		await advanceTime(250);

		await store.receive({ type: 'toastRemoved', id: toastId }, (state) => {
			expect(state.toasts).toHaveLength(0);
		});
	});

	it('skips auto-dismiss if duration is 0', async () => {
		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('No auto-dismiss', { duration: 0 })
			},
			(state) => {
				expect(state.toasts).toHaveLength(1);
				expect(state.toasts[0]!.duration).toBe(0);
			}
		);

		// Wait to ensure no auto-dismiss happens
		await advanceTime(200);

		await store.assertNoPendingActions();
		expect(store.state.toasts).toHaveLength(1);
	});

	it('skips auto-dismiss if duration is null', async () => {
		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('No auto-dismiss', { duration: null })
			},
			(state) => {
				expect(state.toasts).toHaveLength(1);
				expect(state.toasts[0]!.duration).toBeNull();
			}
		);

		// Wait to ensure no auto-dismiss happens
		await advanceTime(200);

		await store.assertNoPendingActions();
		expect(store.state.toasts).toHaveLength(1);
	});
});

// ================================================================
// Test Suite: Manual Dismiss
// ================================================================

describe('Manual Dismiss', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastDismissed: Mock<(toast: Toast) => void>;

	beforeEach(() => {
		onToastDismissed = vi.fn<(toast: Toast) => void>();
		store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: { onToastDismissed }
		});
	});

	it('dismisses toast by ID, animating out first', async () => {
		// Dismissal is two-step now: `toastDismissed` marks the toast
		// `dismissing` and schedules `toastRemoved`, so the view has time to
		// animate it out. It used to delete immediately, which is why
		// `animateToastOut` existed with no caller and toasts popped out of
		// existence. These assertions follow the transition rather than
		// asserting the end state and calling it done.
		await store.send({
			type: 'toastAdded',
			toast: createToast('Test')
		});

		const toastId = store.state.toasts[0]!.id;

		await store.send({ type: 'toastDismissed', id: toastId }, (state) => {
			// Still present, now marked.
			expect(state.toasts).toHaveLength(1);
			expect(state.toasts[0]!.dismissing).toBe(true);
		});

		await store.receive({ type: 'toastRemoved', id: toastId }, (state) => {
			expect(state.toasts).toHaveLength(0);
		});
	});

	it('calls onToastDismissed once, when the toast is actually gone', async () => {
		await store.send({
			type: 'toastAdded',
			toast: createToast('Test')
		});

		const toast = store.state.toasts[0];

		await store.send({ type: 'toastDismissed', id: toast!.id });
		// Deliberately asserted mid-flight: firing the callback on the mark
		// rather than the removal would report a dismissal that has not
		// happened yet, and would fire twice if the toast were re-dismissed.
		expect(onToastDismissed, 'fired before the toast was removed').not.toHaveBeenCalled();

		await store.receive({ type: 'toastRemoved', id: toast!.id });

		expect(onToastDismissed).toHaveBeenCalledOnce();
		expect(onToastDismissed).toHaveBeenCalledWith({ ...toast, dismissing: true });
	});
});

// ================================================================
// Test Suite: Toast Action
// ================================================================

describe('Toast Action', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastDismissed: Mock<(toast: Toast) => void>;

	beforeEach(() => {
		onToastDismissed = vi.fn<(toast: Toast) => void>();
		store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: { onToastDismissed }
		});
	});

	it('executes action.onClick callback', async () => {
		const actionCallback = vi.fn();

		await store.send({
			type: 'toastAdded',
			toast: createToast('Test', {
				action: { label: 'Undo', onClick: actionCallback }
			})
		});

		const toastId = store.state.toasts[0]!.id;

		await store.send({ type: 'toastActionClicked', id: toastId });

		expect(actionCallback).toHaveBeenCalledOnce();
	});

	it('dismisses toast after action execution', async () => {
		const actionCallback = vi.fn();

		await store.send({
			type: 'toastAdded',
			toast: createToast('Test', {
				action: { label: 'Undo', onClick: actionCallback }
			})
		});

		const toastId = store.state.toasts[0]!.id;

		await store.send({ type: 'toastActionClicked', id: toastId }, (state) => {
			expect(state.toasts).toHaveLength(1);
			expect(state.toasts[0]!.dismissing).toBe(true);
		});

		await store.receive({ type: 'toastRemoved', id: toastId }, (state) => {
			expect(state.toasts).toHaveLength(0);
		});

		expect(onToastDismissed).toHaveBeenCalledOnce();
	});
});

// ================================================================
// Test Suite: Dismiss All
// ================================================================

describe('Dismiss All', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastDismissed: Mock<(toast: Toast) => void>;

	beforeEach(() => {
		onToastDismissed = vi.fn<(toast: Toast) => void>();
		store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: { onToastDismissed }
		});
	});

	it('clears all toasts', async () => {
		// Add multiple toasts
		await store.send({ type: 'toastAdded', toast: createToast('Toast 1') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 2') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 3') });

		expect(store.state.toasts).toHaveLength(3);

		// Now marks and defers, like every other dismissal path, so the toasts
		// animate out instead of vanishing.
		await store.send({ type: 'allToastsDismissed' }, (state) => {
			expect(state.toasts).toHaveLength(3);
			expect(state.toasts.every((t) => t.dismissing)).toBe(true);
		});

		for (const id of store.state.toasts.map((t) => t.id)) {
			await store.receive({ type: 'toastRemoved', id });
		}

		expect(store.state.toasts).toHaveLength(0);
	});

	it('calls onToastDismissed for each toast', async () => {
		// Add multiple toasts
		await store.send({ type: 'toastAdded', toast: createToast('Toast 1') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 2') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 3') });

		const toasts = [...store.state.toasts];

		await store.send({ type: 'allToastsDismissed' });
		// Fires on removal, not on the mark — the same rule as a single dismiss.
		expect(onToastDismissed, 'fired before the toasts were removed').not.toHaveBeenCalled();

		for (const id of store.state.toasts.map((t) => t.id)) {
			await store.receive({ type: 'toastRemoved', id });
		}

		expect(onToastDismissed).toHaveBeenCalledTimes(3);
		toasts.forEach((toast) => {
			expect(onToastDismissed).toHaveBeenCalledWith({ ...toast, dismissing: true });
		});
	});
});

// ================================================================
// Test Suite: Configuration Changes
// ================================================================

describe('Configuration Changes', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;

	beforeEach(() => {
		store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: {}
		});
	});

	it('changes maxToasts and removes excess toasts', async () => {
		// Add 3 toasts (at max)
		await store.send({ type: 'toastAdded', toast: createToast('Toast 1') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 2') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 3') });

		expect(store.state.toasts).toHaveLength(3);

		// Reduce max to 2
		await store.send(
			{ type: 'maxToastsChanged', maxToasts: 2 },
			(state) => {
				expect(state.maxToasts).toBe(2);
				expect(state.toasts).toHaveLength(2);
				expect(state.toasts[0]!.description).toBe('Toast 2'); // Oldest removed
				expect(state.toasts[1]!.description).toBe('Toast 3');
			}
		);
	});

	it('changes defaultDuration', async () => {
		await store.send(
			{ type: 'defaultDurationChanged', duration: 3000 },
			(state) => {
				expect(state.defaultDuration).toBe(3000);
			}
		);
	});

	it('changes position', async () => {
		await store.send(
			{ type: 'positionChanged', position: 'top-center' },
			(state) => {
				expect(state.position).toBe('top-center');
			}
		);
	});
});

// ================================================================
// Test Suite: Queue Management
// ================================================================

describe('Queue Management', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;

	beforeEach(() => {
		store = createTestStore({
			initialState: createInitialToastState({ maxToasts: 3 }),
			reducer: toastReducer,
			dependencies: {}
		});
	});

	it('adds multiple toasts in sequence', async () => {
		await store.send({
			type: 'toastAdded',
			toast: createToast({ title: 'First', description: 'Toast 1' })
		});

		await store.send(
			{
				type: 'toastAdded',
				toast: createToast({ title: 'Second', description: 'Toast 2' })
			},
			(state) => {
				expect(state.toasts).toHaveLength(2);
				expect(state.toasts[0]!.title).toBe('First');
				expect(state.toasts[1]!.title).toBe('Second');
			}
		);
	});

	it('removes oldest toast when exceeding maxToasts', async () => {
		// Add 4 toasts (max is 3)
		await store.send({ type: 'toastAdded', toast: createToast('Toast 1', { variant: 'info' }) });
		await store.send({
			type: 'toastAdded',
			toast: createToast('Toast 2', { variant: 'success' })
		});
		await store.send({
			type: 'toastAdded',
			toast: createToast('Toast 3', { variant: 'warning' })
		});

		expect(store.state.toasts).toHaveLength(3);

		await store.send(
			{ type: 'toastAdded', toast: createToast('Toast 4', { variant: 'error' }) },
			(state) => {
				expect(state.toasts).toHaveLength(3);
				// First toast (info) should be removed
				expect(state.toasts[0]!.variant).toBe('success');
				expect(state.toasts[1]!.variant).toBe('warning');
				expect(state.toasts[2]!.variant).toBe('error');
			}
		);
	});
});

// ================================================================
// Test Suite: Custom ID Generator
// ================================================================

describe('Custom ID Generator', () => {
	it('uses custom generateId from dependencies', async () => {
		let counter = 0;
		const customGenerateId = vi.fn(() => `custom-id-${++counter}`);

		const store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: { generateId: customGenerateId }
		});

		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Test 1')
			},
			(state) => {
				expect(state.toasts[0]!.id).toBe('custom-id-1');
			}
		);

		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Test 2')
			},
			(state) => {
				expect(state.toasts[1]!.id).toBe('custom-id-2');
			}
		);

		expect(customGenerateId).toHaveBeenCalledTimes(2);
	});
});

// ================================================================
// Test Suite: Two-step dismissal edge cases
// ================================================================

describe('Dismissal edge cases', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastDismissed: Mock<(toast: Toast) => void>;

	beforeEach(() => {
		onToastDismissed = vi.fn<(toast: Toast) => void>();
		store = createTestStore({
			initialState: createInitialToastState({ maxToasts: 2 }),
			reducer: toastReducer,
			dependencies: { onToastDismissed }
		});
	});

	it('a toast evicted by the cap while dismissing still reports', async () => {
		// Deferring removal opened a window the old immediate-removal code did
		// not have: `toastAdded`'s cap could slice a dismissing toast out of the
		// array before its `toastRemoved` landed, so `toastRemoved` found nothing
		// and returned early — `onToastDismissed` fired ZERO times for a toast
		// the user had actually dismissed.
		await store.send({ type: 'toastAdded', toast: createToast('A') });
		const a = store.state.toasts[0]!.id;
		await store.send({ type: 'toastAdded', toast: createToast('B') });
		await store.send({ type: 'toastDismissed', id: a });
		await store.send({ type: 'toastAdded', toast: createToast('C') });

		expect(
			onToastDismissed,
			'a dismissed toast was evicted by the cap and never reported'
		).toHaveBeenCalledTimes(1);
	});

	it('the cap evicts a live toast before a dismissing one', async () => {
		// A toast already animating away should give up its slot first. It used
		// to be kept while a fully live toast was evicted in its place.
		await store.send({ type: 'toastAdded', toast: createToast('A') });
		await store.send({ type: 'toastAdded', toast: createToast('B') });
		const b = store.state.toasts[1]!.id;
		await store.send({ type: 'toastDismissed', id: b });
		await store.send({ type: 'toastAdded', toast: createToast('C') });

		const descriptions = store.state.toasts.map((t) => t.description);
		expect(descriptions, 'the live toast was evicted, not the dismissing one').toContain('A');
	});

	it('an action can only be triggered once', async () => {
		// The action button stays in the DOM for the whole exit-animation window
		// now, so it stays clickable. `toastDismissed` is idempotent;
		// `toastActionClicked` was not, so a second click re-ran `onClick`.
		// For an "Undo" or "Retry" action that is a data bug.
		const onClick = vi.fn();
		await store.send({
			type: 'toastAdded',
			toast: createToast('X', { action: { label: 'Undo', onClick } })
		});
		const id = store.state.toasts[0]!.id;

		await store.send({ type: 'toastActionClicked', id });
		await store.send({ type: 'toastActionClicked', id });

		expect(onClick, 'the action ran twice during the exit window').toHaveBeenCalledTimes(1);
	});

	it('allToastsDismissed animates out like every other path', async () => {
		// The commit's thesis is that `animateToastOut` had no caller. On this
		// path it still had none — the array was cleared outright.
		await store.send({ type: 'toastAdded', toast: createToast('A') });
		await store.send({ type: 'toastAdded', toast: createToast('B') });

		await store.send({ type: 'allToastsDismissed' }, (state) => {
			expect(state.toasts, 'toasts vanished instead of animating out').toHaveLength(2);
			expect(state.toasts.every((t) => t.dismissing)).toBe(true);
		});
	});
});
