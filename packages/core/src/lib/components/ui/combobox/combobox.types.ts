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
 * Dropdown state machine status.
 *
 * State transitions:
 * - idle → opening (user interaction)
 * - opening → open (animation complete)
 * - open → closing (user closes or selects)
 * - closing → idle (animation complete)
 */
export type DropdownStatus = 'idle' | 'opening' | 'open' | 'closing';

/**
 * Dropdown state for managing animation lifecycle.
 */
export interface DropdownState {
	/**
	 * Current dropdown status in the state machine.
	 */
	status: DropdownStatus;
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
	 * Dropdown state machine for managing animations.
	 */
	dropdown: DropdownState;

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
	// Dropdown lifecycle actions
	| { type: 'opened' } // User wants to open dropdown
	| { type: 'openingCompleted' } // Animation finished, now fully open
	| { type: 'closed' } // User wants to close dropdown
	| { type: 'closingCompleted' } // Animation finished, now fully closed
	| { type: 'toggled' }
	// Selection and search
	| { type: 'optionSelected'; value: T }
	| { type: 'searchChanged'; query: string }
	| { type: 'searchDebounced'; query: string } // Internal: after debounce delay
	| { type: 'optionsChanged'; options: ComboboxOption<T>[] } // External options changed
	// Async loading
	| { type: 'loadingStarted' }
	| { type: 'loadingCompleted'; options: ComboboxOption<T>[] }
	| { type: 'loadingFailed'; error: string }
	// Keyboard navigation
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
		dropdown: { status: 'idle' },
		highlightedIndex: -1,
		searchQuery: '',
		isLoading: false,
		debounceDelay
	};
}
