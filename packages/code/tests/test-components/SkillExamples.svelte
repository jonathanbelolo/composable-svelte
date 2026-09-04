<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-code/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half: every
	 * fence's markup is copied below, `packages/core/tests/repo/skill-examples.test.ts`
	 * asserts the copy is still verbatim, and `svelte-check` reads every `.svelte`
	 * under `tests`, so the markup is typechecked.
	 *
	 * Only `CodeEditor` is the package's own component. `CodeHighlight` and
	 * `NodeCanvas` are PROPS here, typed with the props the skill documents,
	 * because the skill's markup does not compile against the real ones:
	 *
	 * - The real `CodeHighlight` takes a single `store` prop
	 *   (`src/lib/code-highlight/CodeHighlight.svelte`). The skill passes `code`,
	 *   `language`, `theme`, `showLineNumbers` and `highlightLines` — none exist.
	 * - The real `NodeCanvas` REQUIRES `liftAction`
	 *   (`src/lib/node-canvas/NodeCanvas.svelte`), which the skill never passes,
	 *   and has no `onNodeClick` / `onEdgeClick`, which the skill passes twice.
	 *
	 * Those two fences therefore typecheck against the skill's claim, not the
	 * package. When the skill is corrected, replace the two props with imports
	 * from `../../src/lib/index.js` — the verbatim guard will then hold the
	 * markup to the real components.
	 */
	import type { Component } from 'svelte';
	import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/svelte';
	import type { Store } from '@composable-svelte/core';
	import { CodeEditor } from '../../src/lib/index.js';
	import type {
		CodeEditorAction,
		CodeEditorState,
		NodeCanvasAction,
		NodeCanvasState
	} from '../../src/lib/index.js';

	let {
		store,
		editorStore,
		canvasStore,
		CodeHighlight,
		NodeCanvas,
		CustomNode,
		customNodeTypes,
		handleNodeClick,
		handleEdgeClick,
		pythonCode,
		tsCode,
		rustCode
	}: {
		store: Store<CodeEditorState, CodeEditorAction>;
		editorStore: Store<CodeEditorState, CodeEditorAction>;
		canvasStore: Store<NodeCanvasState, NodeCanvasAction>;
		/** The skill's `CodeHighlight` (its "Props" section), not the package's. */
		CodeHighlight: Component<{
			code: string;
			language?: string;
			theme?: 'light' | 'dark';
			showLineNumbers?: boolean;
			highlightLines?: number[];
			class?: string;
		}>;
		/** The skill's `NodeCanvas` (its "Props" section), not the package's. */
		NodeCanvas: Component<{
			store: Store<NodeCanvasState, NodeCanvasAction>;
			nodeTypes?: NodeTypes;
			edgeTypes?: EdgeTypes;
			onNodeClick?: (node: Node) => void;
			onEdgeClick?: (edge: Edge) => void;
			class?: string;
		}>;
		/** `./CustomNode.svelte` in the skill, which does not exist. */
		CustomNode: NodeTypes[string];
		/** Referenced by the NodeCanvas quick start but never declared there. */
		customNodeTypes: NodeTypes;
		handleNodeClick: (node: { id: string }) => void;
		handleEdgeClick: (edge: Edge) => void;
		pythonCode: string;
		tsCode: string;
		rustCode: string;
	} = $props();
</script>

<!-- CODE EDITOR › Quick Start -->
<CodeEditor {store} showToolbar={true} />

<!-- CODE EDITOR › Complete Example -->
<div class="editor-container">
  <CodeEditor store={editorStore} showToolbar={true} />

  <!-- Status bar -->
  <div class="status-bar">
    {#if $editorStore.hasUnsavedChanges}
      <span class="status-warning">Unsaved changes</span>
    {/if}
    {#if $editorStore.cursorPosition}
      <span>Ln {$editorStore.cursorPosition.line}, Col {$editorStore.cursorPosition.column}</span>
    {/if}
    <span>{$editorStore.language}</span>
  </div>
</div>

<!-- CODE HIGHLIGHT › Quick Start. The `import` line is part of the fence's
     markup: the skill wrote it outside any <script>, so the guard extracts it
     as text and it has to be here as text. -->
import { CodeHighlight } from '@composable-svelte/code';

<CodeHighlight
  code={`const greeting = "Hello, World!";`}
  language="javascript"
  theme="dark"
  showLineNumbers={true}
/>

<!-- CODE HIGHLIGHT › Examples -->
<!-- Basic highlighting -->
<CodeHighlight
  code={`function add(a, b) {\n  return a + b;\n}`}
  language="javascript"
/>

<!-- With line numbers -->
<CodeHighlight
  code={pythonCode}
  language="python"
  showLineNumbers={true}
/>

<!-- Highlight specific lines -->
<CodeHighlight
  code={tsCode}
  language="typescript"
  highlightLines={[3, 5, 7]}
/>

<!-- Custom theme -->
<CodeHighlight
  code={rustCode}
  language="rust"
  theme="light"
/>

<!-- NODE CANVAS › Quick Start -->
<NodeCanvas
  store={canvasStore}
  nodeTypes={customNodeTypes}
  onNodeClick={(node) => console.log('Clicked:', node)}
/>

<!-- NODE CANVAS › Complete Example -->
<div class="canvas-container">
  <NodeCanvas
    store={canvasStore}
    nodeTypes={{ custom: CustomNode }}
    onNodeClick={handleNodeClick}
    onEdgeClick={handleEdgeClick}
  />

  <!-- Controls -->
  <div class="canvas-controls">
    <button onclick={() => canvasStore.dispatch({ type: 'zoomIn' })}>
      Zoom In
    </button>
    <button onclick={() => canvasStore.dispatch({ type: 'zoomOut' })}>
      Zoom Out
    </button>
    <button onclick={() => canvasStore.dispatch({ type: 'fitView' })}>
      Fit View
    </button>
  </div>
</div>

<style>
  .canvas-container {
    width: 100%;
    height: 600px;
    position: relative;
  }

  .canvas-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 8px;
  }
</style>
