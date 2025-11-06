<script lang="ts">
	import { createStore, Effect } from '@composable-svelte/core';
	import {
		NodeCanvas,
		nodeCanvasReducer,
		createInitialNodeCanvasState,
		createConnectionValidator,
		type NodeCanvasAction,
		type NodeCanvasState,
		type NodeTypeDefinition
	} from '@composable-svelte/code';
	import type { Node } from '@xyflow/svelte';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui/card/index.js';
	import { Button } from '@composable-svelte/core/components/ui/button/index.js';
	import InputNodeComponent from './node-components/InputNode.svelte';
	import TransformNodeComponent from './node-components/TransformNode.svelte';
	import OutputNodeComponent from './node-components/OutputNode.svelte';

	// ========================================================================
	// Custom Node Data Types
	// ========================================================================

	interface InputNodeData {
		value: string;
		outputType: 'string' | 'number';
	}

	interface TransformNodeData {
		operation: 'uppercase' | 'lowercase' | 'reverse';
	}

	interface OutputNodeData {
		displayValue: string;
	}

	type CustomNodeData = InputNodeData | TransformNodeData | OutputNodeData;

	// ========================================================================
	// Node Type Definitions (for validation)
	// ========================================================================

	const nodeTypeDefinitions: Record<string, NodeTypeDefinition> = {
		input: {
			type: 'input',
			label: 'Input Node',
			outputs: [{ id: 'output', label: 'Output', dataType: 'string', multiple: true }]
		},
		transform: {
			type: 'transform',
			label: 'Transform Node',
			inputs: [{ id: 'input', label: 'Input', dataType: 'string', multiple: false }],
			outputs: [{ id: 'output', label: 'Output', dataType: 'string', multiple: true }]
		},
		output: {
			type: 'output',
			label: 'Output Node',
			inputs: [{ id: 'input', label: 'Input', dataType: 'string', multiple: false }]
		}
	};

	// ========================================================================
	// Store Creation
	// ========================================================================

	// Create initial nodes for demo
	const initialNodes: Node<CustomNodeData>[] = [
		{
			id: 'input-1',
			type: 'input',
			position: { x: 100, y: 150 },
			data: { value: 'Hello World', outputType: 'string' }
		},
		{
			id: 'transform-1',
			type: 'transform',
			position: { x: 400, y: 150 },
			data: { operation: 'uppercase' }
		},
		{
			id: 'output-1',
			type: 'output',
			position: { x: 700, y: 150 },
			data: { displayValue: 'HELLO WORLD' }
		}
	];

	const initialEdges = [
		{ id: 'edge-1', source: 'input-1', target: 'transform-1', sourceHandle: 'output', targetHandle: 'input' },
		{ id: 'edge-2', source: 'transform-1', target: 'output-1', sourceHandle: 'output', targetHandle: 'input' }
	];

	const canvasStore = createStore({
		initialState: createInitialNodeCanvasState({
			nodes: Object.fromEntries(initialNodes.map((n) => [n.id, n])),
			edges: Object.fromEntries(initialEdges.map((e) => [e.id, e]))
		}),
		reducer: nodeCanvasReducer,
		dependencies: {
			validateConnection: createConnectionValidator(nodeTypeDefinitions),
			generateId: () => `node-${Date.now()}-${Math.random()}`
		}
	});
</script>

<div class="space-y-12">
	<!-- Introduction -->
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">NodeCanvas Component</h2>
			<p class="text-muted-foreground">
				Node-based canvas editor built with SvelteFlow and Composable Architecture
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h4 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">Key Features</h4>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ Drag & drop nodes with optional grid snapping</li>
				<li>✓ Type-safe connection validation</li>
				<li>✓ Automatic cycle detection (prevents circular dependencies)</li>
				<li>✓ Mini-map & zoom controls</li>
				<li>✓ Pure reducers following Composable Architecture</li>
				<li>✓ Custom node components with ports</li>
			</ul>
		</div>
	</section>

	<!-- Interactive Demo -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Canvas</h3>
			<p class="text-muted-foreground text-sm">
				Try dragging nodes, creating connections, and adding new nodes
			</p>
		</div>

		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<div>
						<CardTitle>Text Transformation Pipeline</CardTitle>
						<CardDescription>
							Connect input → transform → output to create a data flow
						</CardDescription>
					</div>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={() => {
								const newNode: Node<InputNodeData> = {
									id: `input-${Date.now()}`,
									type: 'input',
									position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
									data: { value: '', outputType: 'string' }
								};
								canvasStore.dispatch({ type: 'addNode', node: newNode });
							}}
						>
							+ Input
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() => {
								const newNode: Node<TransformNodeData> = {
									id: `transform-${Date.now()}`,
									type: 'transform',
									position: { x: 400 + Math.random() * 200, y: 100 + Math.random() * 200 },
									data: { operation: 'uppercase' }
								};
								canvasStore.dispatch({ type: 'addNode', node: newNode });
							}}
						>
							+ Transform
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() => {
								const newNode: Node<OutputNodeData> = {
									id: `output-${Date.now()}`,
									type: 'output',
									position: { x: 700 + Math.random() * 200, y: 100 + Math.random() * 200 },
									data: { displayValue: '' }
								};
								canvasStore.dispatch({ type: 'addNode', node: newNode });
							}}
						>
							+ Output
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onclick={() => canvasStore.dispatch({ type: 'clearCanvas' })}
						>
							Clear
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div class="border rounded-lg overflow-hidden" style="height: 600px;">
					<NodeCanvas
						store={canvasStore}
						liftAction={(action) => action}
						nodeTypes={{
							input: InputNodeComponent,
							transform: TransformNodeComponent,
							output: OutputNodeComponent
						}}
						connectionLineType="smoothstep"
					/>
				</div>
			</CardContent>
		</Card>
	</section>

	<!-- Connection Validation -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Connection Validation</h3>
			<p class="text-muted-foreground text-sm">Type-safe connections prevent errors</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Port Type Checking</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Connections are validated to ensure compatible data types (e.g., string → string)
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Cycle Detection</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Automatically prevents circular dependencies that would create infinite loops
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Multiplicity Rules</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Single-input ports can only have one connection, preventing conflicts
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Usage Example -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Usage Example</h3>
			<p class="text-muted-foreground text-sm">How to use NodeCanvas in your app</p>
		</div>

		<Card>
			<CardContent class="pt-6">
				<pre
					class="text-sm bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto">{`import { createStore } from '@composable-svelte/core';
import {
  NodeCanvas,
  nodeCanvasReducer,
  createInitialNodeCanvasState,
  createConnectionValidator
} from '@composable-svelte/code';

const store = createStore({
  initialState: createInitialNodeCanvasState(),
  reducer: nodeCanvasReducer,
  dependencies: {
    validateConnection: createConnectionValidator(nodeTypes)
  }
});`}</pre>
			</CardContent>
		</Card>
	</section>

	<!-- Features -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Feature Highlights</h3>
			<p class="text-muted-foreground text-sm">Built on SvelteFlow and Composable Architecture</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">State-Driven</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					All canvas state (nodes, edges, viewport) managed by pure reducers in the store
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Type-Safe Connections</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Port definitions with data types ensure only compatible nodes can connect
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Custom Nodes</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Create custom Svelte components with interactive controls and custom styling
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Built on SvelteFlow</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Leverages SvelteFlow 1.4 for performant rendering and interactions
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Fully Testable</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Pure reducers and validation functions can be tested in isolation
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Export/Import</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Save and load entire canvas state as JSON for persistence
				</CardContent>
			</Card>
		</div>
	</section>
</div>
