<script lang="ts">
	/**
	 * A TreeView with a toolbar built from the `controls` snippet — the only way a
	 * consumer can reach `expandAll` / `collapseAll` / `allNodesDeselected`, whose
	 * state lives in `Set`s inside the component's own store.
	 */
	import TreeView from '../../src/lib/components/ui/tree-view/TreeView.svelte';
	import type { TreeNode } from '../../src/lib/components/ui/tree-view/tree-view.types.js';

	const nodes: TreeNode[] = [
		{
			id: 'src',
			label: 'src',
			children: [
				{ id: 'app', label: 'app.ts' },
				{
					id: 'lib',
					label: 'lib',
					children: [{ id: 'util', label: 'util.ts' }]
				}
			]
		},
		{
			id: 'docs',
			label: 'docs',
			children: [{ id: 'readme', label: 'README.md' }]
		}
	];
</script>

<TreeView {nodes} multiSelect>
	{#snippet controls({ expandAll, collapseAll, deselectAll, expandedCount, selectedCount })}
		<div>
			<button data-testid="expand-all" onclick={expandAll}>Expand all</button>
			<button data-testid="collapse-all" onclick={collapseAll}>Collapse all</button>
			<button data-testid="deselect-all" onclick={deselectAll} disabled={selectedCount === 0}>
				Deselect all
			</button>
			<span data-testid="expanded-count">{expandedCount}</span>
			<span data-testid="selected-count">{selectedCount}</span>
		</div>
	{/snippet}
</TreeView>
