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
					dropdown: { status: 'opening' }
				},
				Effect.afterDelay<ComboboxAction>(150, (dispatch) => {
					dispatch({ type: 'openingCompleted' });
				})
			];
		}

		case 'openingCompleted': {
			return [
				{
					...state,
					dropdown: { status: 'open' }
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'closed': {
			return [
				{
					...state,
					dropdown: { status: 'closing' }
				},
				Effect.afterDelay<ComboboxAction>(100, (dispatch) => {
					dispatch({ type: 'closingCompleted' });
				})
			];
		}

		case 'closingCompleted': {
			return [
				{
					...state,
					dropdown: { status: 'idle' },
					highlightedIndex: -1
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'toggled': {
			const isCurrentlyOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
			if (isCurrentlyOpen) {
				return comboboxReducer(state, { type: 'closed' }, deps);
			} else {
				return comboboxReducer(state, { type: 'opened' }, deps);
			}
		}

		case 'optionSelected': {
			const newState: ComboboxState = {
				...state,
				selected: action.value,
				searchQuery: '' // Clear search after selection
			};

			// Trigger onChange callback and close dropdown
			const onChangeEffect = deps?.onChange
				? Effect.run<ComboboxAction>(async () => {
						deps.onChange?.(action.value);
					})
				: Effect.none<ComboboxAction>();

			const closeEffect = Effect.run<ComboboxAction>(async (dispatch) => {
				dispatch({ type: 'closed' });
			});

			return [newState, Effect.batch(onChangeEffect, closeEffect)];
		}

		case 'searchChanged': {
			const newQuery = action.query;

			// If async mode and query is not empty, trigger debounced search
			if (deps?.loadOptions && newQuery.trim()) {
				const openEffect =
					state.dropdown.status === 'idle'
						? Effect.run<ComboboxAction>(async (dispatch) => {
								dispatch({ type: 'opened' });
							})
						: Effect.none<ComboboxAction>();

				return [
					{
						...state,
						searchQuery: newQuery,
						highlightedIndex: 0 // Highlight first result
					},
					Effect.batch(
						openEffect,
						Effect.afterDelay<ComboboxAction>(state.debounceDelay, (dispatch) => {
							dispatch({ type: 'searchDebounced', query: newQuery });
						})
					)
				];
			}

			// Sync mode: filter immediately
			const filtered = filterOptions(state.options, newQuery);

			const openEffect =
				state.dropdown.status === 'idle'
					? Effect.run<ComboboxAction>(async (dispatch) => {
							dispatch({ type: 'opened' });
						})
					: Effect.none<ComboboxAction>();

			return [
				{
					...state,
					searchQuery: newQuery,
					filteredOptions: filtered,
					highlightedIndex: filtered.length > 0 ? 0 : -1
				},
				openEffect
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

			const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';

			// If not open, open it
			if (!isOpen) {
				return [
					{
						...state,
						highlightedIndex: findNextEnabledIndex(state.filteredOptions, -1, 'down')
					},
					Effect.run<ComboboxAction>(async (dispatch) => {
						dispatch({ type: 'opened' });
					})
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

			const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';

			// If not open, open it
			if (!isOpen) {
				return [
					{
						...state,
						highlightedIndex: findNextEnabledIndex(state.filteredOptions, 0, 'up')
					},
					Effect.run<ComboboxAction>(async (dispatch) => {
						dispatch({ type: 'opened' });
					})
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
			const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';

			if (!isOpen || state.filteredOptions.length === 0) {
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
			const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';

			if (!isOpen || state.filteredOptions.length === 0) {
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
			const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';

			// Select highlighted option
			if (isOpen && state.highlightedIndex >= 0) {
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
			const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';

			if (isOpen) {
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
