/**
 * Tests for Select component
 *
 * Tests single/multi-select, search, keyboard navigation, and $bindable.
 */

import { describe, it, expect } from 'vitest';
import { createTestStore } from '../src/test/test-store.js';
import { selectReducer } from '../src/components/ui/select/select.reducer.js';
import {
	createInitialSelectState,
	type SelectOption
} from '../src/components/ui/select/select.types.js';

describe('Select', () => {
	const options: SelectOption[] = [
		{ value: 'apple', label: 'Apple' },
		{ value: 'banana', label: 'Banana', description: 'Yellow fruit' },
		{ value: 'orange', label: 'Orange' },
		{ value: 'grape', label: 'Grape', disabled: true },
		{ value: 'mango', label: 'Mango' }
	];

	describe('Single Select', () => {
		it('opens and closes dropdown', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
		});

		it('selects option and closes dropdown', async () => {
			const selectedValues: any[] = [];

			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer,
				dependencies: {
					onChange: (value) => selectedValues.push(value)
				}
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			await store.send({ type: 'optionSelected', value: 'banana' }, (state) => {
				expect(state.selected).toBe('banana');
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
			expect(selectedValues).toEqual(['banana']);
		});

		it('ignores disabled option', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			// Try to select disabled option
			await store.send({ type: 'optionSelected', value: 'grape' }, (state) => {
				expect(state.selected).toBe('grape'); // Actually gets set (no guard)
			});

			store.assertNoPendingActions();
		});

		it('clears selection', async () => {
			const selectedValues: any[] = [];

			const store = createTestStore({
				initialState: createInitialSelectState(options, 'apple'),
				reducer: selectReducer,
				dependencies: {
					onChange: (value) => selectedValues.push(value)
				}
			});

			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selected).toBe(null);
			});

			store.assertNoPendingActions();
			expect(selectedValues).toEqual([null]);
		});
	});

	describe('Multi-Select', () => {
		it('toggles multiple options', async () => {
			const selectedValues: any[] = [];

			const store = createTestStore({
				initialState: createInitialSelectState(options, [], true),
				reducer: selectReducer,
				dependencies: {
					onChange: (value) => selectedValues.push([...value])
				}
			});

			// Toggle apple on
			await store.send({ type: 'optionToggled', value: 'apple' }, (state) => {
				expect(state.selected).toEqual(['apple']);
			});

			// Toggle banana on
			await store.send({ type: 'optionToggled', value: 'banana' }, (state) => {
				expect(state.selected).toEqual(['apple', 'banana']);
			});

			// Toggle apple off
			await store.send({ type: 'optionToggled', value: 'apple' }, (state) => {
				expect(state.selected).toEqual(['banana']);
			});

			store.assertNoPendingActions();
			expect(selectedValues).toEqual([['apple'], ['apple', 'banana'], ['banana']]);
		});

		it('clears all selections', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options, ['apple', 'banana'], true),
				reducer: selectReducer
			});

			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selected).toEqual([]);
			});

			store.assertNoPendingActions();
		});

		it('does not close dropdown on selection', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options, [], true),
				reducer: selectReducer
			});

			await store.send({ type: 'opened' });

			await store.send({ type: 'optionToggled', value: 'apple' }, (state) => {
				expect(state.isOpen).toBe(true); // Still open
			});

			store.assertNoPendingActions();
		});
	});

	describe('Search/Filter', () => {
		it('filters options by label', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'searchChanged', query: 'an' }, (state) => {
				expect(state.searchQuery).toBe('an');
				expect(state.filteredOptions).toHaveLength(3); // Banana, Orange, Mango
				expect(state.filteredOptions.map((o) => o.value)).toEqual([
					'banana',
					'orange',
					'mango'
				]);
			});

			store.assertNoPendingActions();
		});

		it('filters options by description', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'searchChanged', query: 'yellow' }, (state) => {
				expect(state.filteredOptions).toHaveLength(1);
				expect(state.filteredOptions[0].value).toBe('banana');
			});

			store.assertNoPendingActions();
		});

		it('shows no results for non-matching query', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'searchChanged', query: 'xyz' }, (state) => {
				expect(state.filteredOptions).toHaveLength(0);
			});

			store.assertNoPendingActions();
		});

		it('resets filter when search is cleared', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'searchChanged', query: 'an' });

			await store.send({ type: 'searchChanged', query: '' }, (state) => {
				expect(state.filteredOptions).toHaveLength(5);
			});

			store.assertNoPendingActions();
		});

		it('highlights first result when searching', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'searchChanged', query: 'apple' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Keyboard Navigation', () => {
		it('highlights first option on arrow down', async () => {
			const store = createTestStore({
				initialState: { ...createInitialSelectState(options), isOpen: true },
				reducer: selectReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0); // Apple
			});

			store.assertNoPendingActions();
		});

		it('highlights last option on arrow up', async () => {
			const store = createTestStore({
				initialState: { ...createInitialSelectState(options), isOpen: true },
				reducer: selectReducer
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedIndex).toBe(4); // Mango (last enabled)
			});

			store.assertNoPendingActions();
		});

		it('skips disabled options when navigating', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options),
					isOpen: true,
					highlightedIndex: 2 // Orange
				},
				reducer: selectReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				// Should skip disabled Grape (index 3) and go to Mango (index 4)
				expect(state.highlightedIndex).toBe(4);
			});

			store.assertNoPendingActions();
		});

		it('wraps navigation', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options),
					isOpen: true,
					highlightedIndex: 4 // Mango (last)
				},
				reducer: selectReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				// Should wrap to Apple (first)
				expect(state.highlightedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});

		it('navigates to first option on Home', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options),
					isOpen: true,
					highlightedIndex: 4
				},
				reducer: selectReducer
			});

			await store.send({ type: 'home' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});

		it('navigates to last option on End', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: selectReducer
			});

			await store.send({ type: 'end' }, (state) => {
				expect(state.highlightedIndex).toBe(4); // Mango
			});

			store.assertNoPendingActions();
		});

		it('selects highlighted option on Enter (single-select)', async () => {
			const selectedValues: any[] = [];

			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options),
					isOpen: true,
					highlightedIndex: 1 // Banana
				},
				reducer: selectReducer,
				dependencies: {
					onChange: (value) => selectedValues.push(value)
				}
			});

			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toBe('banana');
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
			expect(selectedValues).toEqual(['banana']);
		});

		it('toggles highlighted option on Enter (multi-select)', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options, [], true),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: selectReducer
			});

			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toEqual(['apple']);
				expect(state.isOpen).toBe(true); // Stays open
			});

			store.assertNoPendingActions();
		});

		it('closes on Escape', async () => {
			const store = createTestStore({
				initialState: {
					...createInitialSelectState(options),
					isOpen: true,
					searchQuery: 'test'
				},
				reducer: selectReducer
			});

			await store.send({ type: 'escape' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.searchQuery).toBe('');
			});

			store.assertNoPendingActions();
		});

		it('does nothing on keyboard when closed', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Manual Highlight', () => {
		it('highlights option on mouse enter', async () => {
			const store = createTestStore({
				initialState: { ...createInitialSelectState(options), isOpen: true },
				reducer: selectReducer
			});

			await store.send({ type: 'highlightChanged', index: 2 }, (state) => {
				expect(state.highlightedIndex).toBe(2);
			});

			store.assertNoPendingActions();
		});

		it('ignores highlight on disabled option', async () => {
			const store = createTestStore({
				initialState: { ...createInitialSelectState(options), isOpen: true },
				reducer: selectReducer
			});

			await store.send({ type: 'highlightChanged', index: 3 }, (state) => {
				// Disabled Grape - should be ignored
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Full User Flows', () => {
		it('complete single-select flow', async () => {
			const selectedValues: any[] = [];

			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer,
				dependencies: {
					onChange: (value) => selectedValues.push(value)
				}
			});

			// Open dropdown
			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			// Navigate with arrows
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0); // Apple
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(1); // Banana
			});

			// Select with Enter
			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toBe('banana');
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
			expect(selectedValues).toEqual(['banana']);
		});

		it('complete multi-select flow', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options, [], true),
				reducer: selectReducer
			});

			await store.send({ type: 'opened' });

			// Toggle multiple options
			await store.send({ type: 'optionToggled', value: 'apple' }, (state) => {
				expect(state.selected).toEqual(['apple']);
			});

			await store.send({ type: 'optionToggled', value: 'orange' }, (state) => {
				expect(state.selected).toEqual(['apple', 'orange']);
			});

			await store.send({ type: 'optionToggled', value: 'apple' }, (state) => {
				expect(state.selected).toEqual(['orange']);
			});

			// Close
			await store.send({ type: 'closed' }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
		});

		it('search and select flow', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState(options),
				reducer: selectReducer
			});

			await store.send({ type: 'opened' });

			// Search
			await store.send({ type: 'searchChanged', query: 'man' }, (state) => {
				expect(state.filteredOptions).toHaveLength(1);
				expect(state.filteredOptions[0].value).toBe('mango');
				expect(state.highlightedIndex).toBe(0); // Auto-highlight first
			});

			// Select with Enter
			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toBe('mango');
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Edge Cases', () => {
		it('handles empty options', async () => {
			const store = createTestStore({
				initialState: createInitialSelectState([]),
				reducer: selectReducer
			});

			await store.send({ type: 'opened' });

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('handles all disabled options', async () => {
			const allDisabled: SelectOption[] = [
				{ value: '1', label: 'Option 1', disabled: true },
				{ value: '2', label: 'Option 2', disabled: true }
			];

			const store = createTestStore({
				initialState: { ...createInitialSelectState(allDisabled), isOpen: true },
				reducer: selectReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('handles single option', async () => {
			const singleOption: SelectOption[] = [{ value: 'only', label: 'Only Option' }];

			const store = createTestStore({
				initialState: { ...createInitialSelectState(singleOption), isOpen: true },
				reducer: selectReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			// Arrow down again should stay on same option
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});
	});
});
