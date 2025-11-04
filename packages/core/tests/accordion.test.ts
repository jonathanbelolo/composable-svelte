/**
 * Accordion Component Tests
 *
 * Comprehensive TestStore tests covering all accordion functionality:
 * - Toggle behavior (expand/collapse)
 * - Single vs multiple mode
 * - Collapsible vs non-collapsible mode
 * - Explicit expand/collapse actions
 * - Expand/collapse all actions
 * - Callbacks (onExpand, onCollapse)
 * - Items change handling
 * - Disabled item handling
 */

import { describe, it, expect, vi } from 'vitest';
import { TestStore } from '../src/lib/test/test-store.js';
import { accordionReducer } from '../src/lib/components/ui/accordion/accordion.reducer.js';
import { createInitialAccordionState } from '../src/lib/components/ui/accordion/accordion.types.js';
import type { AccordionItem } from '../src/lib/components/ui/accordion/accordion.types.js';

describe('Accordion - Toggle Tests', () => {
	it('should toggle item from collapsed to expanded', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['1']);
		});
	});

	it('should toggle item from expanded to collapsed', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1'], true, true),
			reducer: accordionReducer
		});

		// Item 1 starts expanded
		expect(store.getState().expandedIds).toEqual(['1']);

		// Toggle to collapse
		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should not toggle disabled item', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1', disabled: true },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should update expanded state correctly on toggle', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		// Initially collapsed
		expect(store.getState().expandedIds).toEqual([]);

		// Toggle to expand
		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['1']);
		});

		// Toggle back to collapse
		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should handle toggle of non-existent item gracefully', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: 'non-existent' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});
});

describe('Accordion - Single vs Multiple Mode Tests', () => {
	it('should allow multiple items expanded in multiple mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, [], true, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['1']);
		});

		await store.send({ type: 'itemToggled', id: '2' }, (state) => {
			expect(state.expandedIds).toEqual(['1', '2']);
		});

		await store.send({ type: 'itemToggled', id: '3' }, (state) => {
			expect(state.expandedIds).toEqual(['1', '2', '3']);
		});
	});

	it('should collapse others when expanding in single mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1'], false, true),
			reducer: accordionReducer
		});

		// Expanding item 2 should collapse item 1
		await store.send({ type: 'itemToggled', id: '2' }, (state) => {
			expect(state.expandedIds).toEqual(['2']);
		});

		// Expanding item 3 should collapse item 2
		await store.send({ type: 'itemToggled', id: '3' }, (state) => {
			expect(state.expandedIds).toEqual(['3']);
		});
	});

	it('should maintain only one expanded item in single mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, [], false, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['1']);
		});

		await store.send({ type: 'itemToggled', id: '2' }, (state) => {
			expect(state.expandedIds).toEqual(['2']);
		});
	});

	it('should allow collapsing current item in single mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1'], false, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});
});

describe('Accordion - Collapsible Tests', () => {
	it('should allow all items to be collapsed in collapsible mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1'], true, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should prevent collapsing last item in non-collapsible mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1'], true, false),
			reducer: accordionReducer
		});

		// Try to collapse the only expanded item
		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			// Should remain expanded
			expect(state.expandedIds).toEqual(['1']);
		});
	});

	it('should maintain at least one expanded in non-collapsible mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1', '2'], true, false),
			reducer: accordionReducer
		});

		// Can collapse item 1 because item 2 is still expanded
		await store.send({ type: 'itemToggled', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['2']);
		});

		// Cannot collapse item 2 because it's the last one
		await store.send({ type: 'itemToggled', id: '2' }, (state) => {
			expect(state.expandedIds).toEqual(['2']);
		});
	});

	it('should enforce non-collapsible with itemCollapsed action', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1'], true, false),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemCollapsed', id: '1' }, (state) => {
			// Should remain expanded
			expect(state.expandedIds).toEqual(['1']);
		});
	});
});

describe('Accordion - Explicit Expand/Collapse Tests', () => {
	it('should expand item with itemExpanded action', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemExpanded', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['1']);
		});
	});

	it('should do nothing if item already expanded', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1']),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemExpanded', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual(['1']);
		});
	});

	it('should collapse item with itemCollapsed action', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1']),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemCollapsed', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should do nothing if item already collapsed', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemCollapsed', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should respect disabled state on explicit expand', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1', disabled: true }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemExpanded', id: '1' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should respect disabled state on explicit collapse', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1', disabled: true }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1']),
			reducer: accordionReducer
		});

		await store.send({ type: 'itemCollapsed', id: '1' }, (state) => {
			// Should remain expanded because it's disabled
			expect(state.expandedIds).toEqual(['1']);
		});
	});
});

describe('Accordion - All Expand/Collapse Tests', () => {
	it('should expand all non-disabled items', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, [], true, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'allExpanded' }, (state) => {
			expect(state.expandedIds).toEqual(['1', '2', '3']);
		});
	});

	it('should skip disabled items when expanding all', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2', disabled: true },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		await store.send({ type: 'allExpanded' }, (state) => {
			expect(state.expandedIds).toEqual(['1', '3']);
		});
	});

	it('should collapse all items in collapsible mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1', '2'], true, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'allCollapsed' }, (state) => {
			expect(state.expandedIds).toEqual([]);
		});
	});

	it('should not allow collapse all in non-collapsible mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1', '2'], true, false),
			reducer: accordionReducer
		});

		await store.send({ type: 'allCollapsed' }, (state) => {
			// Should remain unchanged
			expect(state.expandedIds).toEqual(['1', '2']);
		});
	});

	it('should not expand all in single mode', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, [], false, true),
			reducer: accordionReducer
		});

		await store.send({ type: 'allExpanded' }, (state) => {
			// Should remain empty in single mode
			expect(state.expandedIds).toEqual([]);
		});
	});
});

describe('Accordion - Callback Tests', () => {
	it('should trigger onExpand callback when item expands', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];
		const onExpand = vi.fn();

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer,
			dependencies: { onExpand }
		});

		await store.send({ type: 'itemToggled', id: '1' });

		// Wait for effect to execute
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onExpand).toHaveBeenCalledWith('1');
	});

	it('should trigger onCollapse callback when item collapses', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];
		const onCollapse = vi.fn();

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1']),
			reducer: accordionReducer,
			dependencies: { onCollapse }
		});

		await store.send({ type: 'itemToggled', id: '1' });

		// Wait for effect to execute
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onCollapse).toHaveBeenCalledWith('1');
	});

	it('should trigger multiple expand callbacks when expanding all', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];
		const onExpand = vi.fn();

		const store = new TestStore({
			initialState: createInitialAccordionState(items, [], true, true),
			reducer: accordionReducer,
			dependencies: { onExpand }
		});

		await store.send({ type: 'allExpanded' });

		// Wait for effects to execute
		await new Promise(resolve => setTimeout(resolve, 10));

		expect(onExpand).toHaveBeenCalledTimes(2);
		expect(onExpand).toHaveBeenCalledWith('1');
		expect(onExpand).toHaveBeenCalledWith('2');
	});

	it('should trigger multiple collapse callbacks when collapsing all', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];
		const onCollapse = vi.fn();

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1', '2'], true, true),
			reducer: accordionReducer,
			dependencies: { onCollapse }
		});

		await store.send({ type: 'allCollapsed' });

		// Wait for effects to execute
		await new Promise(resolve => setTimeout(resolve, 10));

		expect(onCollapse).toHaveBeenCalledTimes(2);
		expect(onCollapse).toHaveBeenCalledWith('1');
		expect(onCollapse).toHaveBeenCalledWith('2');
	});
});

describe('Accordion - Items Change Tests', () => {
	it('should update items when itemsChanged action is dispatched', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items),
			reducer: accordionReducer
		});

		const newItems: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		await store.send({ type: 'itemsChanged', items: newItems }, (state) => {
			expect(state.items).toEqual(newItems);
			expect(state.items.length).toBe(2);
		});
	});

	it('should preserve existing expanded state when items change', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1', '2']),
			reducer: accordionReducer
		});

		// Add a new item but keep existing ones
		const newItems: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		await store.send({ type: 'itemsChanged', items: newItems }, (state) => {
			// Should preserve expanded state for items 1 and 2
			expect(state.expandedIds).toEqual(['1', '2']);
		});
	});

	it('should remove expanded IDs for items that no longer exist', async () => {
		const items: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '2', title: 'Item 2', content: 'Content 2' },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		const store = new TestStore({
			initialState: createInitialAccordionState(items, ['1', '2', '3']),
			reducer: accordionReducer
		});

		// Remove item 2
		const newItems: AccordionItem[] = [
			{ id: '1', title: 'Item 1', content: 'Content 1' },
			{ id: '3', title: 'Item 3', content: 'Content 3' }
		];

		await store.send({ type: 'itemsChanged', items: newItems }, (state) => {
			// Should remove '2' from expandedIds
			expect(state.expandedIds).toEqual(['1', '3']);
		});
	});
});
