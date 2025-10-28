import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestStore } from '../src/test/test-store.js';
import { comboboxReducer } from '../src/components/ui/combobox/combobox.reducer.js';
import {
	createInitialComboboxState,
	type ComboboxOption
} from '../src/components/ui/combobox/combobox.types.js';

describe('Combobox', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	const testOptions: ComboboxOption[] = [
		{ value: '1', label: 'Apple', description: 'A red fruit' },
		{ value: '2', label: 'Banana', description: 'A yellow fruit' },
		{ value: '3', label: 'Cherry', description: 'A small red fruit' },
		{ value: '4', label: 'Date', description: 'A sweet brown fruit' },
		{ value: '5', label: 'Elderberry', description: 'A dark purple berry' }
	];

	describe('Open/Close/Toggle', () => {
		it('should open dropdown', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
			});
		});

		it('should close dropdown', async () => {
			const store = new TestStore({
				initialState: { ...createInitialComboboxState(testOptions), isOpen: true },
				reducer: comboboxReducer
			});

			await store.send({ type: 'closed' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});
		});

		it('should toggle dropdown', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});
		});

		it('should close dropdown on escape key', async () => {
			const store = new TestStore({
				initialState: { ...createInitialComboboxState(testOptions), isOpen: true },
				reducer: comboboxReducer
			});

			await store.send({ type: 'escape' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.highlightedIndex).toBe(-1);
			});
		});
	});

	describe('Search and Filter', () => {
		it('should filter options by label', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'searchChanged', query: 'ban' }, (state) => {
				expect(state.searchQuery).toBe('ban');
				expect(state.filteredOptions).toHaveLength(1);
				expect(state.filteredOptions[0].label).toBe('Banana');
				expect(state.isOpen).toBe(true);
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should filter options by description', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'searchChanged', query: 'red fruit' }, (state) => {
				expect(state.searchQuery).toBe('red fruit');
				expect(state.filteredOptions).toHaveLength(2);
				expect(state.filteredOptions[0].label).toBe('Apple');
				expect(state.filteredOptions[1].label).toBe('Cherry');
			});
		});

		it('should show all options on empty search', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					searchQuery: 'test',
					filteredOptions: []
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'searchChanged', query: '' }, (state) => {
				expect(state.searchQuery).toBe('');
				expect(state.filteredOptions).toHaveLength(5);
			});
		});

		it('should highlight first result on search', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'searchChanged', query: 'e' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should open dropdown when searching', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'searchChanged', query: 'apple' }, (state) => {
				expect(state.isOpen).toBe(true);
			});
		});

		it('should set highlightedIndex to -1 when no results', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'searchChanged', query: 'zzz' }, (state) => {
				expect(state.filteredOptions).toHaveLength(0);
				expect(state.highlightedIndex).toBe(-1);
			});
		});
	});

	describe('Async Loading', () => {
		it('should trigger async loading on search', async () => {
			const loadOptions = vi.fn(async (query) => [
				{ value: '1', label: `Result: ${query}` }
			]);

			const store = new TestStore({
				initialState: createInitialComboboxState([], null, 300),
				reducer: comboboxReducer,
				dependencies: { loadOptions }
			});

			await store.send({ type: 'searchChanged', query: 'test' }, (state) => {
				expect(state.searchQuery).toBe('test');
				expect(state.isOpen).toBe(true);
				expect(state.highlightedIndex).toBe(0);
			});

			// Should NOT call loadOptions immediately (debounced)
			expect(loadOptions).not.toHaveBeenCalled();
		});

		it('should set loading state to true', async () => {
			const loadOptions = vi.fn(async (query) => [
				{ value: '1', label: `Result: ${query}` }
			]);

			const store = new TestStore({
				initialState: createInitialComboboxState([], null, 300),
				reducer: comboboxReducer,
				dependencies: { loadOptions }
			});

			await store.send({ type: 'loadingStarted' }, (state) => {
				expect(state.isLoading).toBe(true);
			});
		});

		it('should complete loading with results', async () => {
			const results: ComboboxOption[] = [
				{ value: '1', label: 'Result 1' },
				{ value: '2', label: 'Result 2' }
			];

			const store = new TestStore({
				initialState: { ...createInitialComboboxState([]), isLoading: true },
				reducer: comboboxReducer
			});

			await store.send({ type: 'loadingCompleted', options: results }, (state) => {
				expect(state.isLoading).toBe(false);
				expect(state.options).toEqual(results);
				expect(state.filteredOptions).toEqual(results);
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should handle loading failures', async () => {
			const store = new TestStore({
				initialState: { ...createInitialComboboxState([]), isLoading: true },
				reducer: comboboxReducer
			});

			await store.send({ type: 'loadingFailed', error: 'Network error' }, (state) => {
				expect(state.isLoading).toBe(false);
				expect(state.filteredOptions).toHaveLength(0);
			});
		});

		it('should debounce async search', async () => {
			const loadOptions = vi.fn(async (query) => [
				{ value: '1', label: `Result: ${query}` }
			]);

			const store = new TestStore({
				initialState: createInitialComboboxState([], null, 300),
				reducer: comboboxReducer,
				dependencies: { loadOptions }
			});

			await store.send({ type: 'searchChanged', query: 'test' });

			// Should NOT call loadOptions immediately
			expect(loadOptions).not.toHaveBeenCalled();

			// Advance time to trigger debounce
			await store.advanceTime(300);

			// Now should receive searchDebounced and trigger load
			await store.receive({ type: 'searchDebounced', query: 'test' });
			await store.receive({ type: 'loadingStarted' });

			// Wait for async load to complete
			await store.receive({ type: 'loadingCompleted' }, (state) => {
				expect(state.isLoading).toBe(false);
				expect(state.filteredOptions).toHaveLength(1);
				expect(state.filteredOptions[0].label).toBe('Result: test');
			});

			expect(loadOptions).toHaveBeenCalledWith('test');
			expect(loadOptions).toHaveBeenCalledTimes(1);
		});

		it('should cancel previous debounced search', async () => {
			const loadOptions = vi.fn(async (query) => [
				{ value: '1', label: `Result: ${query}` }
			]);

			const store = new TestStore({
				initialState: createInitialComboboxState([], null, 300),
				reducer: comboboxReducer,
				dependencies: { loadOptions }
			});

			// First search
			await store.send({ type: 'searchChanged', query: 'test1' });
			await store.advanceTime(100);

			// Second search before first debounce completes
			await store.send({ type: 'searchChanged', query: 'test2' });
			await store.advanceTime(300);

			// Should receive searchDebounced for second query
			await store.receive({ type: 'searchDebounced', query: 'test2' });
			await store.receive({ type: 'loadingStarted' });
			await store.receive({ type: 'loadingCompleted' });

			// Should only call loadOptions with second query
			expect(loadOptions).toHaveBeenCalledWith('test2');
			expect(loadOptions).toHaveBeenCalledTimes(1);
		});
	});

	describe('Selection', () => {
		it('should select option and update selected value', async () => {
			const onChange = vi.fn();

			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer,
				dependencies: { onChange }
			});

			await store.send({ type: 'optionSelected', value: '2' }, (state) => {
				expect(state.selected).toBe('2');
				expect(state.isOpen).toBe(false);
				expect(state.searchQuery).toBe('');
				expect(state.highlightedIndex).toBe(-1);
			});

			expect(onChange).toHaveBeenCalledWith('2');
		});

		it('should close dropdown on selection', async () => {
			const store = new TestStore({
				initialState: { ...createInitialComboboxState(testOptions), isOpen: true },
				reducer: comboboxReducer
			});

			await store.send({ type: 'optionSelected', value: '3' }, (state) => {
				expect(state.isOpen).toBe(false);
			});
		});

		it('should trigger onChange callback on selection', async () => {
			const onChange = vi.fn();

			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer,
				dependencies: { onChange }
			});

			await store.send({ type: 'optionSelected', value: '4' });

			expect(onChange).toHaveBeenCalledWith('4');
			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it('should clear selection', async () => {
			const onChange = vi.fn();

			const store = new TestStore({
				initialState: { ...createInitialComboboxState(testOptions), selected: '2' },
				reducer: comboboxReducer,
				dependencies: { onChange }
			});

			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selected).toBeNull();
				expect(state.searchQuery).toBe('');
				expect(state.filteredOptions).toEqual(testOptions);
				expect(state.highlightedIndex).toBe(-1);
			});

			expect(onChange).toHaveBeenCalledWith(null);
		});
	});

	describe('Keyboard Navigation', () => {
		it('should highlight next option with arrow down', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(1);
			});
		});

		it('should highlight previous option with arrow up', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 2
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedIndex).toBe(1);
			});
		});

		it('should wrap around with arrow down from last option', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 4
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should wrap around with arrow up from first option', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedIndex).toBe(4);
			});
		});

		it('should highlight first option with home key', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 3
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'home' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should highlight last option with end key', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 1
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'end' }, (state) => {
				expect(state.highlightedIndex).toBe(4);
			});
		});

		it('should select highlighted option with enter key', async () => {
			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(testOptions),
					isOpen: true,
					highlightedIndex: 2
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toBe('3');
				expect(state.isOpen).toBe(false);
			});
		});

		it('should skip disabled options in navigation', async () => {
			const optionsWithDisabled: ComboboxOption[] = [
				{ value: '1', label: 'Option 1' },
				{ value: '2', label: 'Option 2', disabled: true },
				{ value: '3', label: 'Option 3' }
			];

			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(optionsWithDisabled),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(2); // Skip index 1 (disabled)
			});
		});

		it('should open dropdown and highlight first option on arrow down when closed', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should open dropdown and highlight last option on arrow up when closed', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.highlightedIndex).toBe(4);
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty options array', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState([]),
				reducer: comboboxReducer
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.filteredOptions).toHaveLength(0);
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1);
			});
		});

		it('should handle all options disabled', async () => {
			const disabledOptions: ComboboxOption[] = [
				{ value: '1', label: 'Option 1', disabled: true },
				{ value: '2', label: 'Option 2', disabled: true },
				{ value: '3', label: 'Option 3', disabled: true }
			];

			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(disabledOptions),
					isOpen: true
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(-1);
			});

			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toBeNull();
			});
		});

		it('should handle single option', async () => {
			const singleOption: ComboboxOption[] = [{ value: '1', label: 'Only Option' }];

			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(singleOption),
					isOpen: true,
					highlightedIndex: 0
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedIndex).toBe(0); // Should wrap to same option
			});

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedIndex).toBe(0);
			});
		});

		it('should ignore stale debounced search', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions, null, 300),
				reducer: comboboxReducer
			});

			// First search
			await store.send({ type: 'searchChanged', query: 'old' });

			// Change search before debounce
			await store.send({ type: 'searchChanged', query: 'new' });

			// Simulate stale debounced action
			await store.send({ type: 'searchDebounced', query: 'old' }, (state) => {
				// Should ignore because query doesn't match current state
				expect(state.searchQuery).toBe('new');
			});
		});

		it('should not select disabled option on enter', async () => {
			const optionsWithDisabled: ComboboxOption[] = [
				{ value: '1', label: 'Option 1' },
				{ value: '2', label: 'Option 2', disabled: true }
			];

			const store = new TestStore({
				initialState: {
					...createInitialComboboxState(optionsWithDisabled),
					isOpen: true,
					highlightedIndex: 1
				},
				reducer: comboboxReducer
			});

			await store.send({ type: 'enter' }, (state) => {
				expect(state.selected).toBeNull();
				expect(state.isOpen).toBe(true);
			});
		});

		it('should handle highlight change with out-of-bounds index', async () => {
			const store = new TestStore({
				initialState: createInitialComboboxState(testOptions),
				reducer: comboboxReducer
			});

			await store.send({ type: 'highlightChanged', index: 999 }, (state) => {
				expect(state.highlightedIndex).toBe(-1);
			});

			await store.send({ type: 'highlightChanged', index: -5 }, (state) => {
				expect(state.highlightedIndex).toBe(-1);
			});
		});
	});
});
