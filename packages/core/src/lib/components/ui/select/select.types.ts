/**
 * Select Types
 *
 * State management types for select component with search and multi-select.
 *
 * @packageDocumentation
 */

import type { PresentationState } from '../../../navigation/types.js';

/**
 * Select option configuration.
 */
export interface SelectOption<T = string> {
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
 * Select state.
 */
export interface SelectState<T = string> {
	/**
	 * All available options.
	 */
	options: SelectOption<T>[];

	/**
	 * Selected value(s). Single value or array for multi-select.
	 */
	selected: T | T[] | null;

	/**
	 * Whether the dropdown is open.
	 */
	isOpen: boolean;

	/**
	 * Animation lifecycle for the dropdown.
	 *
	 * Separate from `isOpen` on purpose. `isOpen` backs `aria-expanded` and flips
	 * the moment the user acts; this keeps the list mounted through its exit
	 * animation, which `{#if isOpen}` alone cannot do.
	 */
	presentation: PresentationState<boolean>;

	/**
	 * Currently highlighted option index.
	 */
	highlightedIndex: number;

	/**
	 * Search query (for searchable variant).
	 */
	searchQuery: string;

	/**
	 * Filtered options based on search.
	 */
	filteredOptions: SelectOption<T>[];

	/**
	 * Whether multi-select is enabled.
	 */
	isMulti: boolean;
}

/**
 * Select actions.
 */
export type SelectPresentationEvent =
	| { type: 'presentationCompleted' }
	| { type: 'dismissalCompleted' };

export type SelectAction<T = string> =
	| { type: 'opened' }
	| { type: 'closed' }
	| { type: 'toggled' }
	| { type: 'optionSelected'; value: T }
	| { type: 'optionToggled'; value: T } // For multi-select
	| { type: 'searchChanged'; query: string }
	| { type: 'highlightChanged'; index: number }
	| { type: 'arrowDown' }
	| { type: 'arrowUp' }
	| { type: 'home' }
	| { type: 'end' }
	| { type: 'enter' }
	| { type: 'escape' }
	| { type: 'cleared' }
	// Sync actions: the component dispatches these when its `value` / `options`
	// props change externally.
	| { type: 'valueChanged'; value: T | T[] | null }
	| { type: 'optionsChanged'; options: SelectOption<T>[] }
	| { type: 'presentation'; event: SelectPresentationEvent };

/**
 * Select dependencies.
 */
export interface SelectDependencies<T = string> {
	/**
	 * Callback when selection changes.
	 */
	onChange?: (value: T | T[] | null) => void;
}

/**
 * Create initial select state.
 */
export function createInitialSelectState<T = string>(
	options: SelectOption<T>[],
	initialValue: T | T[] | null = null,
	isMulti: boolean = false
): SelectState<T> {
	return {
		options,
		selected: initialValue,
		isOpen: false,
		presentation: { status: 'idle' },
		highlightedIndex: -1,
		searchQuery: '',
		filteredOptions: options,
		isMulti
	};
}
