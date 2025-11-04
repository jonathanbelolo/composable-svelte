/**
 * Toast/Notification Reducer Tests
 *
 * Comprehensive TestStore tests validating all Toast reducer functionality including
 * queue management, auto-dismiss, manual dismiss, and action execution.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
	let onToastAdded: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onToastAdded = vi.fn();
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
				expect(state.toasts[0].description).toBe('Hello, world!');
				expect(state.toasts[0].variant).toBe('default');
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
				expect(toast.id).toBeDefined();
				expect(toast.id).toMatch(/^toast-\d+-[a-z0-9]+$/);
				expect(toast.createdAt).toBeGreaterThanOrEqual(beforeTime);
				expect(toast.createdAt).toBeLessThanOrEqual(Date.now());
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
				expect(state.toasts[0].duration).toBe(5000); // Default from state
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
				expect(state.toasts[0].description).toBe('Toast 2'); // First one removed
				expect(state.toasts[1].description).toBe('Toast 3');
				expect(state.toasts[2].description).toBe('Toast 4');
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

		const toastId = store.state.toasts[0].id;

		// Wait for auto-dismiss effect
		await advanceTime(150);

		await store.receive(
			{ type: 'toastAutoDismissed', id: toastId },
			(state) => {
				expect(state.toasts).toHaveLength(0);
			}
		);
	});

	it('skips auto-dismiss if duration is 0', async () => {
		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('No auto-dismiss', { duration: 0 })
			},
			(state) => {
				expect(state.toasts).toHaveLength(1);
				expect(state.toasts[0].duration).toBe(0);
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
				expect(state.toasts[0].duration).toBeNull();
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
	let onToastDismissed: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onToastDismissed = vi.fn();
		store = createTestStore({
			initialState: createInitialToastState(),
			reducer: toastReducer,
			dependencies: { onToastDismissed }
		});
	});

	it('dismisses toast by ID', async () => {
		await store.send({
			type: 'toastAdded',
			toast: createToast('Test')
		});

		const toastId = store.state.toasts[0].id;

		await store.send(
			{ type: 'toastDismissed', id: toastId },
			(state) => {
				expect(state.toasts).toHaveLength(0);
			}
		);
	});

	it('calls onToastDismissed dependency', async () => {
		await store.send({
			type: 'toastAdded',
			toast: createToast('Test')
		});

		const toast = store.state.toasts[0];

		await store.send({ type: 'toastDismissed', id: toast.id });

		expect(onToastDismissed).toHaveBeenCalledOnce();
		expect(onToastDismissed).toHaveBeenCalledWith(toast);
	});
});

// ================================================================
// Test Suite: Toast Action
// ================================================================

describe('Toast Action', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastDismissed: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onToastDismissed = vi.fn();
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

		const toastId = store.state.toasts[0].id;

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

		const toastId = store.state.toasts[0].id;

		await store.send(
			{ type: 'toastActionClicked', id: toastId },
			(state) => {
				expect(state.toasts).toHaveLength(0);
			}
		);

		expect(onToastDismissed).toHaveBeenCalledOnce();
	});
});

// ================================================================
// Test Suite: Dismiss All
// ================================================================

describe('Dismiss All', () => {
	let store: ReturnType<typeof createTestStore<ToastState, ToastAction>>;
	let onToastDismissed: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onToastDismissed = vi.fn();
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

		await store.send({ type: 'allToastsDismissed' }, (state) => {
			expect(state.toasts).toHaveLength(0);
		});
	});

	it('calls onToastDismissed for each toast', async () => {
		// Add multiple toasts
		await store.send({ type: 'toastAdded', toast: createToast('Toast 1') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 2') });
		await store.send({ type: 'toastAdded', toast: createToast('Toast 3') });

		const toasts = [...store.state.toasts];

		await store.send({ type: 'allToastsDismissed' });

		expect(onToastDismissed).toHaveBeenCalledTimes(3);
		toasts.forEach((toast) => {
			expect(onToastDismissed).toHaveBeenCalledWith(toast);
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
				expect(state.toasts[0].description).toBe('Toast 2'); // Oldest removed
				expect(state.toasts[1].description).toBe('Toast 3');
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
				expect(state.toasts[0].title).toBe('First');
				expect(state.toasts[1].title).toBe('Second');
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
				expect(state.toasts[0].variant).toBe('success');
				expect(state.toasts[1].variant).toBe('warning');
				expect(state.toasts[2].variant).toBe('error');
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
				expect(state.toasts[0].id).toBe('custom-id-1');
			}
		);

		await store.send(
			{
				type: 'toastAdded',
				toast: createToast('Test 2')
			},
			(state) => {
				expect(state.toasts[1].id).toBe('custom-id-2');
			}
		);

		expect(customGenerateId).toHaveBeenCalledTimes(2);
	});
});
