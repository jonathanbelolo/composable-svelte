<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createStore } from '../../../store.svelte.js';
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
		multiSelect?: boolean | undefined;

		/**
		 * Initially expanded node IDs.
		 */
		initialExpandedIds?: string[] | undefined;

		/**
		 * Callback when a node is selected.
		 */
		onSelect?: ((nodeId: string, node: TreeNode<T>) => void) | undefined;

		/**
		 * Callback when a node is expanded.
		 */
		onExpand?: ((nodeId: string, node: TreeNode<T>) => void) | undefined;

		/**
		 * Callback when a node is collapsed.
		 */
		onCollapse?: ((nodeId: string, node: TreeNode<T>) => void) | undefined;

		/**
		 * Async function to load children for lazy-loaded nodes.
		 */
		loadChildren?: ((nodeId: string, node: TreeNode<T>) => Promise<TreeNode<T>[]>) | undefined;

		/**
		 * Additional CSS classes.
		 */
		class?: string | undefined;

		/**
		 * Toolbar rendered above the tree, receiving the bulk operations.
		 *
		 * This is how `expandAll` / `collapseAll` / `allNodesDeselected` are
		 * reached. They cannot be exposed through a `store` prop instead: the
		 * state is `Set<string>` (`expandedIds`, `selectedIds`, `loadingIds`),
		 * which is not JSON-serialisable, so hoisting it into a consumer's store
		 * would break SSR hydration.
		 *
		 * The counts come with them because a toolbar that cannot see the
		 * selection renders a "Deselect all" that does nothing.
		 */
		controls?: Snippet<
			[
				{
					expandAll: () => void;
					collapseAll: () => void;
					deselectAll: () => void;
					expandedCount: number;
					selectedCount: number;
				}
			]
		>;
	}

	let {
		nodes,
		multiSelect = false,
		initialExpandedIds = [],
		onSelect,
		onExpand,
		onCollapse,
		loadChildren,
		class: className,
		controls
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
		// Getters, not values: `createStore` re-reads `config.dependencies` on
		// every dispatch, but a plain object literal freezes what these resolve
		// to at setup, so swapping a callback prop left the store calling the
		// original. Mirrors `ui/file-upload/FileUpload.svelte:43-59`.
		dependencies: {
			get onSelect() {
				return onSelect;
			},
			get onExpand() {
				return onExpand;
			},
			get onCollapse() {
				return onCollapse;
			},
			get loadChildren() {
				return loadChildren;
			}
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

</script>

<!-- Recursive TreeNode component -->
{#snippet TreeNodeItem(props: { node: TreeNode<string>; level: number })}
	{@const node = props.node}
	{@const level = props.level}
	{@const isExpanded = $store.expandedIds.has(node.id)}
	{@const isSelected = $store.selectedIds.has(node.id)}
	{@const isHighlighted = $store.highlightedId === node.id}
	{@const isLoading = $store.loadingIds.has(node.id)}
	{@const hasChildren = node.children && node.children.length > 0}
	{@const canExpand = hasChildren || node.lazy}

	<!-- Keyboard input is handled once on the `role="tree"` container below,
	     with roving tabindex on the items — the WAI-ARIA tree pattern. A
	     per-item keydown handler would double-handle every keystroke. -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		role="treeitem"
		aria-expanded={canExpand ? isExpanded : undefined}
		aria-selected={isSelected}
		aria-disabled={node.disabled}
		aria-level={level}
		tabindex={isHighlighted ? 0 : -1}
		class={cn(
			'flex items-center gap-1 px-2 py-1.5 rounded-sm cursor-pointer select-none',
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

{#if controls}
	{@render controls({
		expandAll: () => store.dispatch({ type: 'expandAll' }),
		collapseAll: () => store.dispatch({ type: 'collapseAll' }),
		deselectAll: () => store.dispatch({ type: 'allNodesDeselected' }),
		expandedCount: $store.expandedIds.size,
		selectedCount: $store.selectedIds.size
	})}
{/if}

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
