/**
 * Tests for DropdownMenu component
 *
 * Tests keyboard navigation, selection, and accessibility.
 */

import { describe, it, expect } from 'vitest';
import { createTestStore } from '../src/lib/test/test-store.js';
import { dropdownMenuReducer } from '../src/lib/components/ui/dropdown-menu/dropdown-menu.reducer.js';
import {
	createInitialDropdownMenuState,
	type MenuItem
} from '../src/lib/components/ui/dropdown-menu/dropdown-menu.types.js';

describe('DropdownMenu', () => {
	const items: MenuItem[] = [
		{ id: '1', label: 'Edit', icon: '✏️' },
		{ id: '2', label: 'Duplicate', icon: '📋' },
		{ id: 'sep1', label: '', isSeparator: true },
		{ id: '3', label: 'Archive', icon: '📦' },
		{ id: '4', label: 'Delete', icon: '🗑️', disabled: true }
	];

	describe('Open/Close/Toggle', () => {
		it('opens menu on toggle', async () => {
			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('closes menu on second toggle', async () => {
			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
		});

		it('opens menu explicitly', async () => {
			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('closes menu explicitly', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'closed' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('closes menu on escape', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'escape' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Keyboard Navigation', () => {
		it('highlights first item on arrow down when nothing highlighted', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0); // First item (Edit)
			});

			store.assertNoPendingActions();
		});

		it('highlights last item on arrow up when nothing highlighted', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedIndex).toBe(3); // Last enabled item (Archive)
			});

			store.assertNoPendingActions();
		});

		it('skips disabled items when navigating down', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 3 // Start at Archive
				},
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				// Should skip disabled Delete (index 4) and wrap to Edit (index 0)
				expect(state.highlightedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});

		it('skips separator items when navigating down', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 1 // Start at Duplicate
				},
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				// Should skip separator (index 2) and go to Archive (index 3)
				expect(state.highlightedIndex).toBe(3);
			});

			store.assertNoPendingActions();
		});

		it('skips separator items when navigating up', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 3 // Start at Archive
				},
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				// Should skip separator (index 2) and go to Duplicate (index 1)
				expect(state.highlightedIndex).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('navigates to first item on Home key', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 3
				},
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'home' }, (state) => {
				expect(state.highlightedIndex).toBe(0); // Edit
			});

			store.assertNoPendingActions();
		});

		it('navigates to last item on End key', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'end' }, (state) => {
				expect(state.highlightedIndex).toBe(3); // Archive (last enabled)
			});

			store.assertNoPendingActions();
		});

		it('does nothing on arrow keys when menu is closed', async () => {
			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Item Highlighting', () => {
		it('highlights item on mouse enter', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'itemHighlighted', index: 1 }, (state) => {
				expect(state.highlightedIndex).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('ignores highlight on disabled item', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'itemHighlighted', index: 4 }, (state) => {
				// Disabled item (Delete) should not be highlighted
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('ignores highlight on separator', async () => {
			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'itemHighlighted', index: 2 }, (state) => {
				// Separator should not be highlighted
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Item Selection', () => {
		it('selects item and closes menu', async () => {
			const selectedItems: MenuItem[] = [];

			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: dropdownMenuReducer,
				dependencies: {
					onSelect: (item) => selectedItems.push(item)
				}
			});

			await store.send({ type: 'itemSelected', index: 0 }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});

			// Wait for effect to execute
			store.assertNoPendingActions();

			expect(selectedItems).toHaveLength(1);
			expect(selectedItems[0].id).toBe('1');
			expect(selectedItems[0].label).toBe('Edit');
		});

		it('ignores selection of disabled item', async () => {
			const selectedItems: MenuItem[] = [];

			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer,
				dependencies: {
					onSelect: (item) => selectedItems.push(item)
				}
			});

			await store.send({ type: 'itemSelected', index: 4 }, (state) => {
				// Disabled item - menu should stay open
				expect(state.isOpen).toBe(true);
			});

			store.assertNoPendingActions();

			// onSelect should not have been called
			expect(selectedItems).toHaveLength(0);
		});

		it('ignores selection of separator', async () => {
			const selectedItems: MenuItem[] = [];

			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(items), isOpen: true },
				reducer: dropdownMenuReducer,
				dependencies: {
					onSelect: (item) => selectedItems.push(item)
				}
			});

			await store.send({ type: 'itemSelected', index: 2 }, (state) => {
				// Separator - menu should stay open
				expect(state.isOpen).toBe(true);
			});

			store.assertNoPendingActions();

			// onSelect should not have been called
			expect(selectedItems).toHaveLength(0);
		});

		it('works without onSelect callback', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialDropdownMenuState(items),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: dropdownMenuReducer,
				dependencies: {}
			});

			await store.send({ type: 'itemSelected', index: 0 }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Full User Flows', () => {
		it('complete keyboard navigation flow', async () => {
			const selectedItems: MenuItem[] = [];

			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer,
				dependencies: {
					onSelect: (item) => selectedItems.push(item)
				}
			});

			// User opens menu
			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			// User presses arrow down (highlights first item)
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0); // Edit
			});

			// User presses arrow down (highlights second item)
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(1); // Duplicate
			});

			// User presses arrow down (skips separator, highlights Archive)
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(3); // Archive
			});

			// User selects Archive
			await store.send({ type: 'itemSelected', index: 3 }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();

			expect(selectedItems).toHaveLength(1);
			expect(selectedItems[0].label).toBe('Archive');
		});

		it('complete mouse interaction flow', async () => {
			const selectedItems: MenuItem[] = [];

			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer,
				dependencies: {
					onSelect: (item) => selectedItems.push(item)
				}
			});

			// User clicks trigger
			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			// User hovers over Duplicate
			await store.send({ type: 'itemHighlighted', index: 1 }, (state) => {
				expect(state.highlightedIndex).toBe(1);
			});

			// User clicks Duplicate
			await store.send({ type: 'itemSelected', index: 1 }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();

			expect(selectedItems).toHaveLength(1);
			expect(selectedItems[0].label).toBe('Duplicate');
		});

		it('escape key closes menu', async () => {
			const store = createTestStore({
				initialState: createInitialDropdownMenuState(items),
				reducer: dropdownMenuReducer
			});

			// User opens menu
			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			// User highlights an item
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			// User presses escape
			await store.send({ type: 'escape' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Edge Cases', () => {
		it('handles empty item list', async () => {
			const store = createTestStore({
				initialState: createInitialDropdownMenuState([]),
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1); // No items to highlight
			});

			store.assertNoPendingActions();
		});

		it('handles all disabled items', async () => {
			const allDisabled: MenuItem[] = [
				{ id: '1', label: 'Item 1', disabled: true },
				{ id: '2', label: 'Item 2', disabled: true }
			];

			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(allDisabled), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1); // No enabled items
			});

			store.assertNoPendingActions();
		});

		it('handles all separators', async () => {
			const allSeparators: MenuItem[] = [
				{ id: '1', label: '', isSeparator: true },
				{ id: '2', label: '', isSeparator: true }
			];

			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(allSeparators), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1); // No selectable items
			});

			store.assertNoPendingActions();
		});

		it('handles single enabled item', async () => {
			const singleItem: MenuItem[] = [{ id: '1', label: 'Only Item' }];

			const store = createTestStore({
				initialState: { ...createInitialDropdownMenuState(singleItem), isOpen: true },
				reducer: dropdownMenuReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			// Arrow down again should stay on same item (wraps)
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});
	});
});
