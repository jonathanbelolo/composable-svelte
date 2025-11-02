/**
 * Inventory App - State and Action Types
 *
 * Example application demonstrating URL routing with Composable Svelte.
 * Phase 7: URL Synchronization (Browser History Integration)
 */

// ============================================================================
// Domain Models
// ============================================================================

export interface InventoryItem {
	id: string;
	name: string;
	category: string;
	quantity: number;
	price: number;
}

// ============================================================================
// Destination State (Single-Level Navigation)
// ============================================================================

/**
 * Destination state represents what modal/sheet is currently shown.
 * v1.0 scope: Single-level destinations only (no nested modals).
 */
export type InventoryDestination =
	| { type: 'detail'; state: DetailState }
	| { type: 'add'; state: AddState };

export interface DetailState {
	itemId: string;
}

export interface AddState {
	// Empty state - add form has no initial data
}

// ============================================================================
// Application State
// ============================================================================

export interface InventoryState {
	/**
	 * Current destination (modal/sheet to display).
	 * null = no destination shown (root view)
	 */
	destination: InventoryDestination | null;

	/**
	 * List of inventory items.
	 */
	items: InventoryItem[];

	/**
	 * Search/filter query.
	 */
	searchQuery: string;

	/**
	 * Selected category filter.
	 */
	selectedCategory: string | null;
}

// ============================================================================
// Actions
// ============================================================================

export type InventoryAction =
	// Navigation actions
	| { type: 'itemSelected'; itemId: string }
	| { type: 'addTapped' }
	| { type: 'closeDestination' }

	// Item management actions
	| { type: 'itemAdded'; item: InventoryItem }
	| { type: 'itemUpdated'; itemId: string; updates: Partial<InventoryItem> }
	| { type: 'itemDeleted'; itemId: string }

	// Filter actions
	| { type: 'searchChanged'; query: string }
	| { type: 'categorySelected'; category: string | null };
