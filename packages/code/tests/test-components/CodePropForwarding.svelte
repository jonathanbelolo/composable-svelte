<script lang="ts">
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { NodeCanvasState, NodeCanvasAction } from '../../src/lib/node-canvas/types.js';
	import type { CodeEditorState, CodeEditorAction } from '../../src/lib/code-editor/code-editor.types.js';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 */
	let {
		canvasStore,
		editorStore,
		liftAction,
		minZoom,
		maxZoom,
		panOnDrag,
		class: className,
		showToolbar
	}: {
		canvasStore: Store<NodeCanvasState, NodeCanvasAction>;
		// Required by `NodeCanvasProps`, so it is passed rather than forwarded —
		// this fixture is about the *optional* props.
		liftAction: (action: NodeCanvasAction) => NodeCanvasAction;
		editorStore: Store<CodeEditorState, CodeEditorAction>;
		minZoom?: number;
		maxZoom?: number;
		panOnDrag?: boolean;
		class?: string;
		showToolbar?: boolean;
	} = $props();
</script>

<NodeCanvas store={canvasStore} {liftAction} {minZoom} {maxZoom} {panOnDrag} class={className} />
<CodeEditor store={editorStore} {showToolbar} />
