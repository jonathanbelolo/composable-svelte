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
			if (state.dropdown.status === 'opening' || state.dropdown.status === 'open') return [state, Effect.none()];
			const generation = (state.transitionGeneration ?? 0) + 1;
			return [
				{
					...state,
					dropdown: { status: 'opening' },
					transitionGeneration: generation
				},
				Effect.afterDelay<ComboboxAction>(150, (dispatch) => {
					dispatch({ type: 'openingCompleted', generation });
				})
			];
		}

		case 'openingCompleted': {
			if (state.dropdown.status !== 'opening' || (action.generation !== undefined && action.generation !== state.transitionGeneration)) return [state, Effect.none()];
			return [
				{
					...state,
					dropdown: { status: 'open' }
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'closed': {
			if (state.dropdown.status === 'closing' || state.dropdown.status === 'idle') return [state, Effect.none()];
			const generation = (state.transitionGeneration ?? 0) + 1;
			return [
				{
					...state,
					dropdown: { status: 'closing' },
					transitionGeneration: generation
				},
				Effect.afterDelay<ComboboxAction>(100, (dispatch) => {
					dispatch({ type: 'closingCompleted', generation });
				})
			];
		}

		case 'closingCompleted': {
			if (state.dropdown.status !== 'closing' || (action.generation !== undefined && action.generation !== state.transitionGeneration)) return [state, Effect.none()];
			return [
				{
					...state,
					dropdown: { status: 'idle' },
					highlightedIndex: -1,
					// Same reason as `optionSelected`: a dropdown that closes with a
					// query still applied reopens filtered, with an empty search box.
					searchQuery: '',
					searchGeneration: (state.searchGeneration ?? 0) + 1,
					loadGeneration: (state.loadGeneration ?? 0) + 1,
					isLoading: false,
					filteredOptions: state.options
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
				// Clear the search *and* the filtering it produced. Leaving
				// `filteredOptions` filtered by a query the box no longer shows
				// meant reopening after a search displayed a stale one-item list.
				// Select does both — select.reducer.ts:177.
				searchQuery: '',
				searchGeneration: (state.searchGeneration ?? 0) + 1,
				loadGeneration: (state.loadGeneration ?? 0) + 1,
				isLoading: false,
				filteredOptions: state.options
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
			const generation = (state.searchGeneration ?? 0) + 1;
			const loadGeneration = (state.loadGeneration ?? 0) + 1;

			// If async mode and query is not empty, trigger debounced search
			if (deps?.loadOptions && newQuery.trim()) {
				const openEffect =
					(state.dropdown.status === 'idle' || state.dropdown.status === 'closing')
						? Effect.run<ComboboxAction>(async (dispatch) => {
								dispatch({ type: 'opened' });
							})
						: Effect.none<ComboboxAction>();

				return [
					{
						...state,
						searchQuery: newQuery,
						searchGeneration: generation,
						loadGeneration,
						highlightedIndex: 0 // Highlight first result
					},
					Effect.batch(
						openEffect,
						Effect.afterDelay<ComboboxAction>(state.debounceDelay, (dispatch) => {
							dispatch({ type: 'searchDebounced', query: newQuery, generation });
						})
					)
				];
			}

			// Sync mode: filter immediately
			const filtered = filterOptions(state.options, newQuery);

			const openEffect =
				(state.dropdown.status === 'idle' || state.dropdown.status === 'closing')
					? Effect.run<ComboboxAction>(async (dispatch) => {
							dispatch({ type: 'opened' });
						})
					: Effect.none<ComboboxAction>();

			return [
				{
					...state,
					searchQuery: newQuery,
					searchGeneration: generation,
					loadGeneration,
					isLoading: false,
					filteredOptions: filtered,
					highlightedIndex: filtered.length > 0 ? 0 : -1
				},
				openEffect
			];
		}

		case 'searchDebounced': {
			// Only trigger async load if query matches current state (debounce check)
			if (action.query !== state.searchQuery || (action.generation !== undefined && action.generation !== state.searchGeneration)) {
				return [state, Effect.none<ComboboxAction>()];
			}

			if (!deps?.loadOptions) return [state, Effect.none()];
			const loadOptions = deps.loadOptions;
			const query = action.query;
			const generation = (state.loadGeneration ?? 0) + 1;
			return [
				{ ...state, isLoading: true, loadGeneration: generation },
				Effect.run<ComboboxAction>(async (dispatch) => {
					let outcome: ComboboxAction;
					try {
						const options = await loadOptions(query);
						outcome = { type: 'loadingCompleted', options, query, generation };
					} catch (error) {
						outcome = { type: 'loadingFailed', error: error instanceof Error ? error.message : 'Load failed', query, generation };
					}
					dispatch(outcome);
				})
			];
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
			if ((action.query !== undefined && action.query !== state.searchQuery) || (action.generation !== undefined && action.generation !== state.loadGeneration)) return [state, Effect.none()];
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
			if ((action.query !== undefined && action.query !== state.searchQuery) || (action.generation !== undefined && action.generation !== state.loadGeneration)) return [state, Effect.none()];
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
					searchGeneration: (state.searchGeneration ?? 0) + 1,
					loadGeneration: (state.loadGeneration ?? 0) + 1,
					isLoading: false,
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

		case 'optionsChanged': {
			// External options changed (for local/sync mode)
			// Re-filter based on current search query
			const newOptions = action.options;
			const filtered = state.searchQuery ? filterOptions(newOptions, state.searchQuery) : newOptions;

			return [
				{
					...state,
					options: newOptions,
					filteredOptions: filtered,
					highlightedIndex: filtered.length > 0 ? Math.min(state.highlightedIndex, filtered.length - 1) : -1
				},
				Effect.none<ComboboxAction>()
			];
		}

		case 'valueChanged': {
			// Idempotent by value, returning the *identical* state object. This is
			// load-bearing, not defensive: `dispatchCore` only notifies subscribers
			// when `!Object.is(state, newState)`, and the component dispatches this
			// from an `$effect` that reads store state in its own tracking scope. A
			// fresh object here would re-trigger that effect forever — which is
			// exactly how Select's `optionsChanged` once turned a silent no-op into
			// `effect_update_depth_exceeded`.
			//
			// `selected` is `T | null` (single-select), so `Object.is` suffices; the
			// array branch Select's `sameSelection` carries is unnecessary here.
			if (Object.is(state.selected, action.value)) {
				return [state, Effect.none<ComboboxAction>()];
			}
			return [
				{
					...state,
					selected: action.value,
					// An inbound sync clears the search, as picking an option does.
					searchQuery: '',
					searchGeneration: (state.searchGeneration ?? 0) + 1,
					loadGeneration: (state.loadGeneration ?? 0) + 1,
					isLoading: false,
					filteredOptions: state.options,
					highlightedIndex: -1
				},
				Effect.none<ComboboxAction>()
			];
			// No `deps.onChange` here: this is an *inbound* sync from the prop.
			// Calling it would write back to the bindable `value` and loop.
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none<ComboboxAction>()];
		}
	}
};
