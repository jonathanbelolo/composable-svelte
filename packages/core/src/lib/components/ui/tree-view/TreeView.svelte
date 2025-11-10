<script lang="ts">
	import { createStore } from '../../../store.js';
	import { treeViewReducer } from './tree-view.reducer.js';
	import { createInitialTreeViewState } from './tree-view.types.js';
	import type { TreeNode } from './tree-view.types.js';
	import { Spinner } from '../spinner/index.js';
	import { cn } from '../../../utils.js';

	/**
	 * TreeView component - Hierarchical tree with expand/collapse and selection.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * state management, keyboard navigation, and lazy loading support.
	 *
	 * @example
	 * ```svelte
	 * <TreeView
	 *   nodes={[
	 *     {
	 *       id: '1',
	 *       label: 'Folder 1',
	 *       children: [
	 *         { id: '1-1', label: 'File 1-1' },
	 *         { id: '1-2', label: 'File 1-2' }
	 *       ]
	 *     }
	 *   ]}
	 *   onSelect={(nodeId, node) => console.log('Selected:', node.label)}
	 * />
	 * ```
	 */

	interface TreeViewProps<T = string> {
		/**
		 * Tree nodes (hierarchical structure).
		 */
		nodes: TreeNode<T>[];

		/**
		 * Enable multi-select mode (default: false).
		 */
		multiSelect?: boolean;

		/**
		 * Initially expanded node IDs.
		 */
		initialExpandedIds?: string[];

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
		 * Async function to load children for lazy-loaded nodes.
		 */
		loadChildren?: (nodeId: string, node: TreeNode<T>) => Promise<TreeNode<T>[]>;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		nodes,
		multiSelect = false,
		initialExpandedIds = [],
		onSelect,
		onExpand,
		onCollapse,
		loadChildren,
		class: className
	}: TreeViewProps = $props();

	// Create tree view store with reducer
	const store = createStore({
		initialState: (() => {
			const state = createInitialTreeViewState(nodes, multiSelect);
			if (initialExpandedIds.length > 0) {
				state.expandedIds = new Set(initialExpandedIds);
			}
			return state;
		})(),
		reducer: treeViewReducer,
		dependencies: {
			onSelect,
			onExpand,
			onCollapse,
			loadChildren
		}
	});

	// Sync external nodes changes to store
	$effect(() => {
		store.dispatch({ type: 'nodesUpdated', nodes });
	});

	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				store.dispatch({ type: 'arrowDown' });
				break;
			case 'ArrowUp':
				event.preventDefault();
				store.dispatch({ type: 'arrowUp' });
				break;
			case 'ArrowRight':
				event.preventDefault();
				store.dispatch({ type: 'arrowRight' });
				break;
			case 'ArrowLeft':
				event.preventDefault();
				store.dispatch({ type: 'arrowLeft' });
				break;
			case 'Home':
				event.preventDefault();
				store.dispatch({ type: 'home' });
				break;
			case 'End':
				event.preventDefault();
				store.dispatch({ type: 'end' });
				break;
			case 'Enter':
				event.preventDefault();
				store.dispatch({ type: 'enter' });
				break;
			case ' ':
				event.preventDefault();
				store.dispatch({ type: 'space' });
				break;
		}
	}

	function handleNodeClick(nodeId: string, event: MouseEvent) {
		event.stopPropagation();
		store.dispatch({ type: 'nodeSelected', nodeId });
	}

	function handleExpandClick(nodeId: string, event: MouseEvent) {
		event.stopPropagation();
		store.dispatch({ type: 'nodeToggled', nodeId });
	}

	function handleNodeMouseEnter(nodeId: string) {
		store.dispatch({ type: 'highlightChanged', nodeId });
	}

	// Recursive component for rendering tree nodes
	interface TreeNodeItemProps {
		node: TreeNode;
		level: number;
	}
</script>

<!-- Recursive TreeNode component -->
{#snippet TreeNodeItem(props)}
	{@const node = props.node}
	{@const level = props.level}
	{@const isExpanded = $store.expandedIds.has(node.id)}
	{@const isSelected = $store.selectedIds.has(node.id)}
	{@const isHighlighted = $store.highlightedId === node.id}
	{@const isLoading = $store.loadingIds.has(node.id)}
	{@const hasChildren = node.children && node.children.length > 0}
	{@const canExpand = hasChildren || node.lazy}

	<div
		role="treeitem"
		aria-expanded={canExpand ? isExpanded : undefined}
		aria-selected={isSelected}
		aria-disabled={node.disabled}
		aria-level={level}
		tabindex={isHighlighted ? 0 : -1}
		class={cn(
			'flex items-center gap-1 px-2 py-1.5 rounded-sm cursor-pointer select-none',
			'transition-colors',
			isHighlighted && 'bg-accent text-accent-foreground',
			isSelected && 'font-medium',
			node.disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
		)}
		style="padding-left: {level * 20 + 8}px"
		onclick={(e) => handleNodeClick(node.id, e)}
		onmouseenter={() => handleNodeMouseEnter(node.id)}
	>
		<!-- Expand/collapse button -->
		{#if canExpand}
			<button
				type="button"
				class={cn(
					'flex-shrink-0 w-4 h-4 flex items-center justify-center',
					'hover:bg-accent hover:text-accent-foreground rounded-sm',
					'transition-transform',
					isExpanded && 'rotate-90'
				)}
				onclick={(e) => handleExpandClick(node.id, e)}
				aria-label={isExpanded ? 'Collapse' : 'Expand'}
			>
				{#if isLoading}
					<Spinner size="xs" />
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				{/if}
			</button>
		{:else}
			<span class="w-4"></span>
		{/if}

		<!-- Icon (if provided) -->
		{#if node.icon}
			<span class="flex-shrink-0 text-muted-foreground">
				{node.icon}
			</span>
		{/if}

		<!-- Label -->
		<span class="flex-1 text-sm truncate">
			{node.label}
		</span>

		<!-- Selected indicator -->
		{#if isSelected}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="flex-shrink-0"
			>
				<polyline points="20 6 9 17 4 12"></polyline>
			</svg>
		{/if}
	</div>

	<!-- Children (recursive) -->
	{#if isExpanded && hasChildren}
		{#each node.children as child}
			{@render TreeNodeItem({ node: child, level: level + 1 })}
		{/each}
	{/if}
{/snippet}

<!-- Main tree container -->
<div
	role="tree"
	class={cn('w-full', className)}
	onkeydown={handleKeyDown}
	tabindex="0"
>
	{#if $store.nodes.length === 0}
		<div class="px-2 py-6 text-center text-sm text-muted-foreground">No items</div>
	{:else}
		{#each $store.nodes as node}
			{@render TreeNodeItem({ node, level: 1 })}
		{/each}
	{/if}
</div>
