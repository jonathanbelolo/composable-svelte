/**
 * TreeView Types
 *
 * State management types for tree view component (hierarchical data with expand/collapse and selection).
 *
 * @packageDocumentation
 */

/**
 * TreeNode represents a single node in the tree.
 * Nodes can have children, forming a recursive tree structure.
 */
export interface TreeNode<T = string> {
	/**
	 * Unique identifier for the node.
	 */
	id: string;

	/**
	 * Display label for the node.
	 */
	label: string;

	/**
	 * Optional icon identifier or component name.
	 */
	icon?: string;

	/**
	 * Whether the node is disabled (cannot be selected or interacted with).
	 */
	disabled?: boolean;

	/**
	 * Child nodes (if any).
	 */
	children?: TreeNode<T>[];

	/**
	 * Custom data payload for the node.
	 */
	data?: T;

	/**
	 * Whether children should be loaded lazily.
	 * When true, children will be loaded via loadChildren callback when expanded.
	 */
	lazy?: boolean;
}

/**
 * TreeView state.
 */
export interface TreeViewState<T = string> {
	/**
	 * All tree nodes (flat structure with recursive children).
	 */
	nodes: TreeNode<T>[];

	/**
	 * Set of expanded node IDs.
	 * Using Set for O(1) lookup performance.
	 */
	expandedIds: Set<string>;

	/**
	 * Set of selected node IDs.
	 * Multiple selection is supported.
	 */
	selectedIds: Set<string>;

	/**
	 * Currently highlighted node ID (for keyboard navigation).
	 */
	highlightedId: string | null;

	/**
	 * Set of node IDs currently loading children.
	 * Used to show loading states for lazy-loaded nodes.
	 */
	loadingIds: Set<string>;

	/**
	 * Whether multi-select mode is enabled.
	 */
	isMultiSelect: boolean;
}

/**
 * TreeView actions.
 */
export type TreeViewAction<T = string> =
	// Expand/Collapse
	| { type: 'nodeExpanded'; nodeId: string }
	| { type: 'nodeCollapsed'; nodeId: string }
	| { type: 'nodeToggled'; nodeId: string }
	// Selection
	| { type: 'nodeSelected'; nodeId: string }
	| { type: 'nodeDeselected'; nodeId: string }
	| { type: 'allNodesDeselected' }
	// Keyboard Navigation
	| { type: 'highlightChanged'; nodeId: string | null }
	| { type: 'arrowDown' }
	| { type: 'arrowUp' }
	| { type: 'arrowRight' } // Expand or move to first child
	| { type: 'arrowLeft' } // Collapse or move to parent
	| { type: 'home' } // Move to first node
	| { type: 'end' } // Move to last visible node
	| { type: 'enter' } // Select highlighted node
	| { type: 'space' } // Toggle expansion of highlighted node
	// Lazy Loading
	| { type: 'childrenLoadingStarted'; nodeId: string }
	| { type: 'childrenLoaded'; nodeId: string; children: TreeNode<T>[] }
	| { type: 'childrenLoadingFailed'; nodeId: string; error: string }
	// Bulk Operations
	| { type: 'expandAll' }
	| { type: 'collapseAll' };

/**
 * TreeView dependencies.
 */
export interface TreeViewDependencies<T = string> {
	/**
	 * Callback when a node is selected.
	 */
	onSelect?: (nodeId: string, node: TreeNode<T>) => void;

	/**
	 * Callback when a node is expanded.
	 */
	onExpand?: (nodeId: string, node: TreeNode<T>) => void;

	/**
	 * Callback when a node is collapsed.
	 */
	onCollapse?: (nodeId: string, node: TreeNode<T>) => void;

	/**
	 * Async function to load children for a lazy-loaded node.
	 * Called when a lazy node is expanded for the first time.
	 */
	loadChildren?: (nodeId: string, node: TreeNode<T>) => Promise<TreeNode<T>[]>;
}

/**
 * Create initial tree view state.
 */
export function createInitialTreeViewState<T = string>(
	nodes: TreeNode<T>[] = [],
	isMultiSelect = false
): TreeViewState<T> {
	return {
		nodes,
		expandedIds: new Set<string>(),
		selectedIds: new Set<string>(),
		highlightedId: null,
		loadingIds: new Set<string>(),
		isMultiSelect
	};
}
