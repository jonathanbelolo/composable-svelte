/**
 * Collapsible Component Tests
 *
 * Comprehensive TestStore tests covering all collapsible functionality:
 * - Toggle behavior (expand/collapse)
 * - Explicit expand/collapse actions
 * - Disabled state handling
 * - Callbacks (onExpand, onCollapse)
 * - Edge cases
 */

import { describe, it, expect, vi } from 'vitest';
import { TestStore } from '../src/test/test-store.js';
import { collapsibleReducer } from '../src/components/ui/collapsible/collapsible.reducer.js';
import { createInitialCollapsibleState } from '../src/components/ui/collapsible/collapsible.types.js';

describe('Collapsible - Basic Toggle Tests', () => {
	it('should toggle from collapsed to expanded', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer
		});

		expect(store.getState().isExpanded).toBe(false);

		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});
	});

	it('should toggle from expanded to collapsed', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer
		});

		expect(store.getState().isExpanded).toBe(true);

		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});
	});

	it('should toggle multiple times correctly', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer
		});

		// Toggle to expanded
		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});

		// Toggle back to collapsed
		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});

		// Toggle to expanded again
		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});
	});

	it('should not toggle when disabled', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, true),
			reducer: collapsibleReducer
		});

		expect(store.getState().disabled).toBe(true);

		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(false);
			expect(state.disabled).toBe(true);
		});
	});
});

describe('Collapsible - Explicit Expand/Collapse Tests', () => {
	it('should expand with expanded action', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'expanded' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});
	});

	it('should collapse with collapsed action', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'collapsed' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});
	});

	it('should do nothing if already expanded on expand action', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'expanded' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});
	});

	it('should do nothing if already collapsed on collapse action', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'collapsed' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});
	});

	it('should not expand when disabled', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, true),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'expanded' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});
	});

	it('should not collapse when disabled', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(true, true),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'collapsed' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});
	});
});

describe('Collapsible - Disabled State Tests', () => {
	it('should change disabled state', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, false),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'disabledChanged', disabled: true }, (state) => {
			expect(state.disabled).toBe(true);
		});
	});

	it('should allow toggling after being re-enabled', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, true),
			reducer: collapsibleReducer
		});

		// Cannot toggle when disabled
		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});

		// Enable
		await store.send({ type: 'disabledChanged', disabled: false }, (state) => {
			expect(state.disabled).toBe(false);
		});

		// Should now be able to toggle
		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});
	});

	it('should preserve expanded state when disabled', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(true, false),
			reducer: collapsibleReducer
		});

		await store.send({ type: 'disabledChanged', disabled: true }, (state) => {
			expect(state.isExpanded).toBe(true);
			expect(state.disabled).toBe(true);
		});
	});
});

describe('Collapsible - Callback Tests', () => {
	it('should trigger onExpand callback when expanding via toggle', async () => {
		const onExpand = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer,
			dependencies: { onExpand }
		});

		await store.send({ type: 'toggled' });

		// Wait for effect to execute
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onExpand).toHaveBeenCalledTimes(1);
	});

	it('should trigger onCollapse callback when collapsing via toggle', async () => {
		const onCollapse = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer,
			dependencies: { onCollapse }
		});

		await store.send({ type: 'toggled' });

		// Wait for effect to execute
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onCollapse).toHaveBeenCalledTimes(1);
	});

	it('should trigger onExpand callback with explicit expand action', async () => {
		const onExpand = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer,
			dependencies: { onExpand }
		});

		await store.send({ type: 'expanded' });

		// Wait for effect to execute
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onExpand).toHaveBeenCalledTimes(1);
	});

	it('should trigger onCollapse callback with explicit collapse action', async () => {
		const onCollapse = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer,
			dependencies: { onCollapse }
		});

		await store.send({ type: 'collapsed' });

		// Wait for effect to execute
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onCollapse).toHaveBeenCalledTimes(1);
	});

	it('should not trigger callbacks when disabled', async () => {
		const onExpand = vi.fn();
		const onCollapse = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, true),
			reducer: collapsibleReducer,
			dependencies: { onExpand, onCollapse }
		});

		await store.send({ type: 'toggled' });
		await store.send({ type: 'expanded' });
		await store.send({ type: 'collapsed' });

		// Wait for any effects
		await new Promise(resolve => setTimeout(resolve, 10));

		expect(onExpand).not.toHaveBeenCalled();
		expect(onCollapse).not.toHaveBeenCalled();
	});

	it('should not trigger callback when state does not change', async () => {
		const onExpand = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer,
			dependencies: { onExpand }
		});

		// Try to expand when already expanded
		await store.send({ type: 'expanded' });

		// Wait for any effects
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onExpand).not.toHaveBeenCalled();
	});
});

describe('Collapsible - Edge Cases', () => {
	it('should handle initial collapsed state', () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(),
			reducer: collapsibleReducer
		});

		expect(store.getState().isExpanded).toBe(false);
		expect(store.getState().disabled).toBe(false);
	});

	it('should handle initial expanded state', () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(true),
			reducer: collapsibleReducer
		});

		expect(store.getState().isExpanded).toBe(true);
		expect(store.getState().disabled).toBe(false);
	});

	it('should handle initial disabled state', () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, true),
			reducer: collapsibleReducer
		});

		expect(store.getState().isExpanded).toBe(false);
		expect(store.getState().disabled).toBe(true);
	});

	it('should handle multiple state changes in sequence', async () => {
		const onExpand = vi.fn();
		const onCollapse = vi.fn();

		const store = new TestStore({
			initialState: createInitialCollapsibleState(false, false),
			reducer: collapsibleReducer,
			dependencies: { onExpand, onCollapse }
		});

		// Expand
		await store.send({ type: 'expanded' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});

		// Disable
		await store.send({ type: 'disabledChanged', disabled: true }, (state) => {
			expect(state.disabled).toBe(true);
			expect(state.isExpanded).toBe(true);
		});

		// Try to collapse (should fail because disabled)
		await store.send({ type: 'collapsed' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});

		// Enable
		await store.send({ type: 'disabledChanged', disabled: false }, (state) => {
			expect(state.disabled).toBe(false);
		});

		// Now collapse should work
		await store.send({ type: 'collapsed' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});
	});

	it('should handle rapid toggles correctly', async () => {
		const store = new TestStore({
			initialState: createInitialCollapsibleState(false),
			reducer: collapsibleReducer
		});

		// Rapid toggles
		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});

		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});

		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(true);
		});

		await store.send({ type: 'toggled' }, (state) => {
			expect(state.isExpanded).toBe(false);
		});
	});
});
