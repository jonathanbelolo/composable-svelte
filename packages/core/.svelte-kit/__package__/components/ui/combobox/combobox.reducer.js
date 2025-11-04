/**
 * Combobox Reducer
 *
 * State management for combobox component (autocomplete with async loading and debounced search).
 *
 * @packageDocumentation
 */
import { Effect } from '../../../effect.js';
/**
 * Filter options based on search query.
 */
function filterOptions(options, query) {
    if (!query.trim()) {
        return options;
    }
    const lowerQuery = query.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(lowerQuery) ||
        option.description?.toLowerCase().includes(lowerQuery));
}
/**
 * Find next non-disabled option index.
 */
function findNextEnabledIndex(options, startIndex, direction) {
    if (options.length === 0)
        return -1;
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
export const comboboxReducer = (state, action, deps) => {
    switch (action.type) {
        case 'opened': {
            return [
                {
                    ...state,
                    dropdown: { status: 'opening' }
                },
                Effect.afterDelay(150, (dispatch) => {
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
                Effect.none()
            ];
        }
        case 'closed': {
            return [
                {
                    ...state,
                    dropdown: { status: 'closing' }
                },
                Effect.afterDelay(100, (dispatch) => {
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
                Effect.none()
            ];
        }
        case 'toggled': {
            const isCurrentlyOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            if (isCurrentlyOpen) {
                return comboboxReducer(state, { type: 'closed' }, deps);
            }
            else {
                return comboboxReducer(state, { type: 'opened' }, deps);
            }
        }
        case 'optionSelected': {
            const newState = {
                ...state,
                selected: action.value,
                searchQuery: '' // Clear search after selection
            };
            // Trigger onChange callback and close dropdown
            const onChangeEffect = deps?.onChange
                ? Effect.run(async () => {
                    deps.onChange?.(action.value);
                })
                : Effect.none();
            const closeEffect = Effect.run(async (dispatch) => {
                dispatch({ type: 'closed' });
            });
            return [newState, Effect.batch(onChangeEffect, closeEffect)];
        }
        case 'searchChanged': {
            const newQuery = action.query;
            // If async mode and query is not empty, trigger debounced search
            if (deps?.loadOptions && newQuery.trim()) {
                const openEffect = state.dropdown.status === 'idle'
                    ? Effect.run(async (dispatch) => {
                        dispatch({ type: 'opened' });
                    })
                    : Effect.none();
                return [
                    {
                        ...state,
                        searchQuery: newQuery,
                        highlightedIndex: 0 // Highlight first result
                    },
                    Effect.batch(openEffect, Effect.afterDelay(state.debounceDelay, (dispatch) => {
                        dispatch({ type: 'searchDebounced', query: newQuery });
                    }))
                ];
            }
            // Sync mode: filter immediately
            const filtered = filterOptions(state.options, newQuery);
            const openEffect = state.dropdown.status === 'idle'
                ? Effect.run(async (dispatch) => {
                    dispatch({ type: 'opened' });
                })
                : Effect.none();
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
                return [state, Effect.none()];
            }
            // Trigger async load
            if (deps?.loadOptions) {
                const effect = Effect.batch(Effect.run(async (dispatch) => {
                    dispatch({ type: 'loadingStarted' });
                }), Effect.run(async (dispatch) => {
                    try {
                        const results = await deps.loadOptions(action.query);
                        dispatch({ type: 'loadingCompleted', options: results });
                    }
                    catch (error) {
                        dispatch({
                            type: 'loadingFailed',
                            error: error instanceof Error ? error.message : 'Load failed'
                        });
                    }
                }));
                return [state, effect];
            }
            return [state, Effect.none()];
        }
        case 'loadingStarted': {
            return [
                {
                    ...state,
                    isLoading: true
                },
                Effect.none()
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
                Effect.none()
            ];
        }
        case 'loadingFailed': {
            return [
                {
                    ...state,
                    isLoading: false,
                    filteredOptions: []
                },
                Effect.none()
            ];
        }
        case 'highlightChanged': {
            // Ensure index is within bounds
            const validIndex = action.index >= 0 && action.index < state.filteredOptions.length
                ? action.index
                : -1;
            return [
                {
                    ...state,
                    highlightedIndex: validIndex
                },
                Effect.none()
            ];
        }
        case 'arrowDown': {
            if (state.filteredOptions.length === 0) {
                return [state, Effect.none()];
            }
            const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            // If not open, open it
            if (!isOpen) {
                return [
                    {
                        ...state,
                        highlightedIndex: findNextEnabledIndex(state.filteredOptions, -1, 'down')
                    },
                    Effect.run(async (dispatch) => {
                        dispatch({ type: 'opened' });
                    })
                ];
            }
            const nextIndex = findNextEnabledIndex(state.filteredOptions, state.highlightedIndex, 'down');
            return [
                {
                    ...state,
                    highlightedIndex: nextIndex
                },
                Effect.none()
            ];
        }
        case 'arrowUp': {
            if (state.filteredOptions.length === 0) {
                return [state, Effect.none()];
            }
            const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            // If not open, open it
            if (!isOpen) {
                return [
                    {
                        ...state,
                        highlightedIndex: findNextEnabledIndex(state.filteredOptions, 0, 'up')
                    },
                    Effect.run(async (dispatch) => {
                        dispatch({ type: 'opened' });
                    })
                ];
            }
            const prevIndex = findNextEnabledIndex(state.filteredOptions, state.highlightedIndex, 'up');
            return [
                {
                    ...state,
                    highlightedIndex: prevIndex
                },
                Effect.none()
            ];
        }
        case 'home': {
            const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            if (!isOpen || state.filteredOptions.length === 0) {
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
            const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            if (!isOpen || state.filteredOptions.length === 0) {
                return [state, Effect.none()];
            }
            const lastIndex = findNextEnabledIndex(state.filteredOptions, 0, 'up');
            return [
                {
                    ...state,
                    highlightedIndex: lastIndex
                },
                Effect.none()
            ];
        }
        case 'enter': {
            const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            // Select highlighted option
            if (isOpen && state.highlightedIndex >= 0) {
                const selectedOption = state.filteredOptions[state.highlightedIndex];
                if (selectedOption && !selectedOption.disabled) {
                    return comboboxReducer(state, { type: 'optionSelected', value: selectedOption.value }, deps);
                }
            }
            return [state, Effect.none()];
        }
        case 'escape': {
            const isOpen = state.dropdown.status === 'open' || state.dropdown.status === 'opening';
            if (isOpen) {
                return comboboxReducer(state, { type: 'closed' }, deps);
            }
            return [state, Effect.none()];
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
                    ? Effect.run(async () => {
                        deps.onChange?.(null);
                    })
                    : Effect.none()
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
                Effect.none()
            ];
        }
        default: {
            const _exhaustive = action;
            return [state, Effect.none()];
        }
    }
};
