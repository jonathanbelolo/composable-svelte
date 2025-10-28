/**
 * Combobox Types
 *
 * State management types for combobox component (autocomplete/searchable select with async loading).
 *
 * @packageDocumentation
 */

/**
 * Combobox option configuration.
 */
export interface ComboboxOption<T = string> {
	/**
	 * Unique value for the option.
	 */
	value: T;

	/**
	 * Display label.
	 */
	label: string;

	/**
	 * Whether the option is disabled.
	 */
	disabled?: boolean;

	/**
	 * Optional description or subtitle.
	 */
	description?: string;
}

/**
 * Combobox state.
 */
export interface ComboboxState<T = string> {
	/**
	 * All available options (from local data or last async load).
	 */
	options: ComboboxOption<T>[];

	/**
	 * Filtered options based on search query.
	 */
	filteredOptions: ComboboxOption<T>[];

	/**
	 * Selected value.
	 */
	selected: T | null;

	/**
	 * Whether the dropdown is open.
	 */
	isOpen: boolean;

	/**
	 * Currently highlighted option index.
	 */
	highlightedIndex: number;

	/**
	 * Search query.
	 */
	searchQuery: string;

	/**
	 * Whether async loading is in progress.
	 */
	isLoading: boolean;

	/**
	 * Debounce delay in milliseconds for search queries.
	 */
	debounceDelay: number;
}

/**
 * Combobox actions.
 */
export type ComboboxAction<T = string> =
	| { type: 'opened' }
	| { type: 'closed' }
	| { type: 'toggled' }
	| { type: 'optionSelected'; value: T }
	| { type: 'searchChanged'; query: string }
	| { type: 'searchDebounced'; query: string } // Internal: after debounce delay
	| { type: 'loadingStarted' }
	| { type: 'loadingCompleted'; options: ComboboxOption<T>[] }
	| { type: 'loadingFailed'; error: string }
	| { type: 'highlightChanged'; index: number }
	| { type: 'arrowDown' }
	| { type: 'arrowUp' }
	| { type: 'home' }
	| { type: 'end' }
	| { type: 'enter' }
	| { type: 'escape' }
	| { type: 'cleared' };

/**
 * Combobox dependencies.
 */
export interface ComboboxDependencies<T = string> {
	/**
	 * Callback when selection changes.
	 */
	onChange?: (value: T | null) => void;

	/**
	 * Async function to load options based on query.
	 * If provided, enables async mode.
	 */
	loadOptions?: (query: string) => Promise<ComboboxOption<T>[]>;
}

/**
 * Create initial combobox state.
 */
export function createInitialComboboxState<T = string>(
	options: ComboboxOption<T>[] = [],
	initialValue: T | null = null,
	debounceDelay: number = 300
): ComboboxState<T> {
	return {
		options,
		filteredOptions: options,
		selected: initialValue,
		isOpen: false,
		highlightedIndex: -1,
		searchQuery: '',
		isLoading: false,
		debounceDelay
	};
}
