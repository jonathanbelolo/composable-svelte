<script lang="ts">
	import TreeView from '../../src/lib/components/ui/tree-view/TreeView.svelte';
	import type { TreeNode } from '../../src/lib/components/ui/tree-view/tree-view.types.js';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**, alongside
	 * `CommandPropForwarding.svelte`, which covers the palette. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * a component declares has to say `| undefined` or it cannot be wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 *
	 * `loadChildren` and `onExpand` are the shape that matters most. A naive
	 * append gives `(…) => void | undefined` — a function *returning*
	 * `void | undefined`, which typechecks and forwards nothing. Only
	 * `((…) => void) | undefined` lets these through.
	 */
	let {
		nodes,
		onExpand,
		onCollapse,
		loadChildren,
		class: className
	}: {
		nodes: TreeNode<string>[];
		onExpand?: (nodeId: string, node: TreeNode<string>) => void;
		onCollapse?: (nodeId: string, node: TreeNode<string>) => void;
		loadChildren?: (nodeId: string, node: TreeNode<string>) => Promise<TreeNode<string>[]>;
		class?: string;
	} = $props();
</script>

<TreeView {nodes} {onExpand} {onCollapse} {loadChildren} class={className} />
