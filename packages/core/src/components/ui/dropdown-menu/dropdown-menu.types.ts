/**
 * Dropdown Menu Types
 *
 * State management types for dropdown menu with keyboard navigation.
 *
 * @packageDocumentation
 */

/**
 * Menu item configuration.
 */
export interface MenuItem {
	/**
	 * Unique identifier for the item.
	 */
	id: string;

	/**
	 * Display label.
	 */
	label: string;

	/**
	 * Optional icon name or component.
	 */
	icon?: string;

	/**
	 * Whether the item is disabled.
	 */
	disabled?: boolean;

	/**
	 * Whether this is a separator (divider line).
	 */
	isSeparator?: boolean;

	/**
	 * Keyboard shortcut display (e.g., "⌘K").
	 */
	shortcut?: string;
}

/**
 * Dropdown menu state.
 */
export interface DropdownMenuState {
	/**
	 * Whether the menu is open.
	 */
	isOpen: boolean;

	/**
	 * Currently highlighted item index (-1 if none).
	 */
	highlightedIndex: number;

	/**
	 * List of menu items.
	 */
	items: MenuItem[];
}

/**
 * Dropdown menu actions.
 */
export type DropdownMenuAction =
	| { type: 'opened' }
	| { type: 'closed' }
	| { type: 'toggled' }
	| { type: 'itemHighlighted'; index: number }
	| { type: 'itemSelected'; index: number }
	| { type: 'arrowDown' }
	| { type: 'arrowUp' }
	| { type: 'home' }
	| { type: 'end' }
	| { type: 'escape' };

/**
 * Dropdown menu dependencies.
 */
export interface DropdownMenuDependencies {
	/**
	 * Callback when an item is selected.
	 */
	onSelect?: (item: MenuItem) => void;
}

/**
 * Create initial dropdown menu state.
 */
export function createInitialDropdownMenuState(
	items: MenuItem[]
): DropdownMenuState {
	return {
		isOpen: false,
		highlightedIndex: -1,
		items
	};
}
