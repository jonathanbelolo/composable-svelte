/**
 * Combobox Reducer
 *
 * State management for combobox component (autocomplete with async loading and debounced search).
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	ComboboxState,
	ComboboxAction,
	ComboboxDependencies,
	ComboboxOption
} from './combobox.types.js';

/**
 * Filter options based on search query.
 */
function filterOptions<T>(
	options: ComboboxOption<T>[],
	query: string
): ComboboxOption<T>[] {
	if (!query.trim()) {
		return options;
	}

	const lowerQuery = query.toLowerCase();
	return options.filter(
		(option) =>
			option.label.toLowerCase().includes(lowerQuery) ||
			option.description?.toLowerCase().includes(lowerQuery)
	);
}

/**
 * Find next non-disabled option index.
 */
function findNextEnabledIndex<T>(
	options: ComboboxOption<T>[],
	startIndex: number,
	direction: 'up' | 'down'
): number {
	if (options.length === 0) return -1;

	const increment = direction === 'down' ? 1 : -1;
	let currentIndex = startIndex;

	for (let i = 0; i < options.length; i++) {
		currentIndex = (currentIndex + increment + options.length) % options.length;
		const option = options[currentIndex];

		if (option && !option.disabled) {
			return currentIndex;
		}
	}

	return -1;
}

/**
 * Combobox reducer with async loading and debounced search.
 *
 * Handles:
 * - Open/close/toggle
 * - Single selection
 * - Search with debouncing
 * - Async option loading
 * - Keyboard navigation
 * - Selection callbacks
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialComboboxState(options),
 *   reducer: comboboxReducer,
 *   dependencies: {
 *     onChange: (value) => console.log('Selected:', value),
 *     loadOptions: async (query) => await fetchOptions(query)
 *   }
 * });
 * ```
 */
export const comboboxReducer: Reducer<
	ComboboxState,
	ComboboxAction,
	ComboboxDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'opened': {
			return [
				{
					...state,
					isOpen: true
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'closed': {
			return [
				{
					...state,
					isOpen: false,
					highlightedIndex: -1
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'toggled': {
			const newIsOpen = !state.isOpen;
			return [
				{
					...state,
					isOpen: newIsOpen,
					highlightedIndex: newIsOpen ? state.highlightedIndex : -1
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'optionSelected': {
			const newState: ComboboxState = {
				...state,
				selected: action.value,
				isOpen: false, // Close dropdown on selection
				highlightedIndex: -1,
				searchQuery: '' // Clear search after selection
			};

			// Trigger onChange callback
			const effect = deps?.onChange
				? Effect.run<ComboboxAction>(async () => {
						deps.onChange?.(action.value);
					})
				: Effect.none<ComboboxAction>();

			return [newState, effect];
		}

		case 'searchChanged': {
			const newQuery = action.query;

			// If async mode and query is not empty, trigger debounced search
			if (deps?.loadOptions && newQuery.trim()) {
				return [
					{
						...state,
						searchQuery: newQuery,
						isOpen: true, // Open dropdown when searching
						highlightedIndex: 0 // Highlight first result
					},
					Effect.afterDelay<ComboboxAction>(state.debounceDelay, (dispatch) => {
						dispatch({ type: 'searchDebounced', query: newQuery });
					})
				];
			}

			// Sync mode: filter immediately
			const filtered = filterOptions(state.options, newQuery);

			return [
				{
					...state,
					searchQuery: newQuery,
					filteredOptions: filtered,
					isOpen: true,
					highlightedIndex: filtered.length > 0 ? 0 : -1
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'searchDebounced': {
			// Only trigger async load if query matches current state (debounce check)
			if (action.query !== state.searchQuery) {
				return [state, Effect.none<ComboboxAction>()];
			}

			// Trigger async load
			if (deps?.loadOptions) {
				const effect = Effect.batch<ComboboxAction>(
					Effect.run<ComboboxAction>(async (dispatch) => {
						dispatch({ type: 'loadingStarted' });
					}),
					Effect.run<ComboboxAction>(async (dispatch) => {
						try {
							const results = await deps.loadOptions!(action.query);
							dispatch({ type: 'loadingCompleted', options: results });
						} catch (error) {
							dispatch({
								type: 'loadingFailed',
								error: error instanceof Error ? error.message : 'Load failed'
							});
						}
					})
				);

				return [state, effect];
			}

			return [state, Effect.none<ComboboxAction>()];
		}

		case 'loadingStarted': {
			return [
				{
					...state,
					isLoading: true
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'loadingCompleted': {
			return [
				{
					...state,
					options: action.options,
					filteredOptions: action.options,
					isLoading: false,
					highlightedIndex: action.options.length > 0 ? 0 : -1
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'loadingFailed': {
			return [
				{
					...state,
					isLoading: false,
					filteredOptions: []
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'highlightChanged': {
			// Ensure index is within bounds
			const validIndex =
				action.index >= 0 && action.index < state.filteredOptions.length
					? action.index
					: -1;

			return [
				{
					...state,
					highlightedIndex: validIndex
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'arrowDown': {
			if (state.filteredOptions.length === 0) {
				return [state, Effect.none<ComboboxAction>()];
			}

			// If not open, open it
			if (!state.isOpen) {
				return [
					{
						...state,
						isOpen: true,
						highlightedIndex: findNextEnabledIndex(state.filteredOptions, -1, 'down')
					},
					Effect.none<ComboboxAction>()
				];
			}

			const nextIndex = findNextEnabledIndex(
				state.filteredOptions,
				state.highlightedIndex,
				'down'
			);

			return [
				{
					...state,
					highlightedIndex: nextIndex
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'arrowUp': {
			if (state.filteredOptions.length === 0) {
				return [state, Effect.none<ComboboxAction>()];
			}

			// If not open, open it
			if (!state.isOpen) {
				return [
					{
						...state,
						isOpen: true,
						highlightedIndex: findNextEnabledIndex(state.filteredOptions, 0, 'up')
					},
					Effect.none<ComboboxAction>()
				];
			}

			const prevIndex = findNextEnabledIndex(
				state.filteredOptions,
				state.highlightedIndex,
				'up'
			);

			return [
				{
					...state,
					highlightedIndex: prevIndex
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'home': {
			if (!state.isOpen || state.filteredOptions.length === 0) {
				return [state, Effect.none<ComboboxAction>()];
			}

			const firstIndex = findNextEnabledIndex(state.filteredOptions, -1, 'down');

			return [
				{
					...state,
					highlightedIndex: firstIndex
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'end': {
			if (!state.isOpen || state.filteredOptions.length === 0) {
				return [state, Effect.none<ComboboxAction>()];
			}

			const lastIndex = findNextEnabledIndex(state.filteredOptions, 0, 'up');

			return [
				{
					...state,
					highlightedIndex: lastIndex
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'enter': {
			// Select highlighted option
			if (state.isOpen && state.highlightedIndex >= 0) {
				const selectedOption = state.filteredOptions[state.highlightedIndex];
				if (selectedOption && !selectedOption.disabled) {
					return comboboxReducer(
						state,
						{ type: 'optionSelected', value: selectedOption.value },
						deps
					);
				}
			}

			return [state, Effect.none<ComboboxAction>()];
		}

		case 'escape': {
			if (state.isOpen) {
				return comboboxReducer(state, { type: 'closed' }, deps);
			}

			return [state, Effect.none<ComboboxAction>()];
		}

		case 'cleared': {
			return [
				{
					...state,
					selected: null,
					searchQuery: '',
					filteredOptions: state.options,
					highlightedIndex: -1
				},
				deps?.onChange
					? Effect.run<ComboboxAction>(async () => {
							deps.onChange?.(null);
						})
					: Effect.none<ComboboxAction>()
			];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none<ComboboxAction>()];
		}
	}
};
