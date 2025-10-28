/**
 * Select Reducer
 *
 * State management for select component with search and multi-select.
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	SelectState,
	SelectAction,
	SelectDependencies,
	SelectOption
} from './select.types.js';

/**
 * Filter options based on search query.
 */
function filterOptions<T>(
	options: SelectOption<T>[],
	query: string
): SelectOption<T>[] {
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
	options: SelectOption<T>[],
	startIndex: number,
	direction: 'up' | 'down'
): number {
	if (options.length === 0) return -1;

	const increment = direction === 'down' ? 1 : -1;
	let currentIndex = startIndex;

	for (let i = 0; i < options.length; i++) {
		currentIndex = (currentIndex + increment + options.length) % options.length;
		const option = options[currentIndex];

		if (!option.disabled) {
			return currentIndex;
		}
	}

	return -1;
}

/**
 * Select reducer with search and multi-select support.
 *
 * Handles:
 * - Open/close/toggle
 * - Single and multi-select
 * - Search/filter options
 * - Keyboard navigation
 * - Selection callbacks
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialSelectState(options),
 *   reducer: selectReducer,
 *   dependencies: {
 *     onChange: (value) => console.log('Selected:', value)
 *   }
 * });
 * ```
 */
export const selectReducer: Reducer<
	SelectState<any>,
	SelectAction<any>,
	SelectDependencies<any>
> = (state, action, deps) => {
	switch (action.type) {
		case 'opened': {
			return [
				{
					...state,
					isOpen: true,
					highlightedIndex: -1,
					searchQuery: '',
					filteredOptions: state.options
				},
				Effect.none()
			];
		}

		case 'closed': {
			return [
				{
					...state,
					isOpen: false,
					highlightedIndex: -1,
					searchQuery: '',
					filteredOptions: state.options
				},
				Effect.none()
			];
		}

		case 'toggled': {
			const newIsOpen = !state.isOpen;
			return [
				{
					...state,
					isOpen: newIsOpen,
					highlightedIndex: newIsOpen ? -1 : state.highlightedIndex,
					searchQuery: newIsOpen ? '' : state.searchQuery,
					filteredOptions: newIsOpen ? state.options : state.filteredOptions
				},
				Effect.none()
			];
		}

		case 'optionSelected': {
			const { value } = action;

			// For single select, set value and close
			const newState: SelectState<any> = {
				...state,
				selected: value,
				isOpen: false,
				highlightedIndex: -1,
				searchQuery: '',
				filteredOptions: state.options
			};

			if (deps.onChange) {
				return [
					newState,
					Effect.run(async () => {
						deps.onChange!(value);
					})
				];
			}

			return [newState, Effect.none()];
		}

		case 'optionToggled': {
			// For multi-select
			if (!state.isMulti) {
				return [state, Effect.none()];
			}

			const { value } = action;
			const currentSelected = Array.isArray(state.selected) ? state.selected : [];

			const isSelected = currentSelected.includes(value);
			const newSelected = isSelected
				? currentSelected.filter((v) => v !== value)
				: [...currentSelected, value];

			const newState: SelectState<any> = {
				...state,
				selected: newSelected
			};

			if (deps.onChange) {
				return [
					newState,
					Effect.run(async () => {
						deps.onChange!(newSelected);
					})
				];
			}

			return [newState, Effect.none()];
		}

		case 'searchChanged': {
			const { query } = action;
			const filtered = filterOptions(state.options, query);

			return [
				{
					...state,
					searchQuery: query,
					filteredOptions: filtered,
					highlightedIndex: filtered.length > 0 ? 0 : -1
				},
				Effect.none()
			];
		}

		case 'highlightChanged': {
			const { index } = action;
			const option = state.filteredOptions[index];

			if (!option || option.disabled) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					highlightedIndex: index
				},
				Effect.none()
			];
		}

		case 'arrowDown': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			const nextIndex =
				state.highlightedIndex === -1
					? findNextEnabledIndex(state.filteredOptions, -1, 'down')
					: findNextEnabledIndex(state.filteredOptions, state.highlightedIndex, 'down');

			return [
				{
					...state,
					highlightedIndex: nextIndex
				},
				Effect.none()
			];
		}

		case 'arrowUp': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			const prevIndex =
				state.highlightedIndex === -1
					? findNextEnabledIndex(state.filteredOptions, state.filteredOptions.length, 'up')
					: findNextEnabledIndex(state.filteredOptions, state.highlightedIndex, 'up');

			return [
				{
					...state,
					highlightedIndex: prevIndex
				},
				Effect.none()
			];
		}

		case 'home': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			const firstIndex = findNextEnabledIndex(state.filteredOptions, -1, 'down');

			return [
				{
					...state,
					highlightedIndex: firstIndex
				},
				Effect.none()
			];
		}

		case 'end': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			const lastIndex = findNextEnabledIndex(
				state.filteredOptions,
				state.filteredOptions.length,
				'up'
			);

			return [
				{
					...state,
					highlightedIndex: lastIndex
				},
				Effect.none()
			];
		}

		case 'enter': {
			if (!state.isOpen || state.highlightedIndex === -1) {
				return [state, Effect.none()];
			}

			const option = state.filteredOptions[state.highlightedIndex];
			if (!option || option.disabled) {
				return [state, Effect.none()];
			}

			// Handle multi-select vs single-select
			if (state.isMulti) {
				const currentSelected = Array.isArray(state.selected) ? state.selected : [];
				const isSelected = currentSelected.includes(option.value);
				const newSelected = isSelected
					? currentSelected.filter((v) => v !== option.value)
					: [...currentSelected, option.value];

				const newState: SelectState<any> = {
					...state,
					selected: newSelected
				};

				if (deps.onChange) {
					return [
						newState,
						Effect.run(async () => {
							deps.onChange!(newSelected);
						})
					];
				}

				return [newState, Effect.none()];
			} else {
				// Single select - close dropdown
				const newState: SelectState<any> = {
					...state,
					selected: option.value,
					isOpen: false,
					highlightedIndex: -1,
					searchQuery: '',
					filteredOptions: state.options
				};

				if (deps.onChange) {
					return [
						newState,
						Effect.run(async () => {
							deps.onChange!(option.value);
						})
					];
				}

				return [newState, Effect.none()];
			}
		}

		case 'escape': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					isOpen: false,
					highlightedIndex: -1,
					searchQuery: '',
					filteredOptions: state.options
				},
				Effect.none()
			];
		}

		case 'cleared': {
			const newState: SelectState<any> = {
				...state,
				selected: state.isMulti ? [] : null
			};

			if (deps.onChange) {
				return [
					newState,
					Effect.run(async () => {
						deps.onChange!(newState.selected);
					})
				];
			}

			return [newState, Effect.none()];
		}

		default:
			return [state, Effect.none()];
	}
};
