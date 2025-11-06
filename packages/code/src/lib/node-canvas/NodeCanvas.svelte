<script lang="ts" generics="NodeData = any, EdgeData = any, Action = any">
  /**
   * NodeCanvas Component
   *
   * Node-based canvas editor with SvelteFlow integration.
   * Follows Composable Architecture pattern with store-driven state.
   */

  import { SvelteFlow, Controls, MiniMap, Background } from '@xyflow/svelte';
  import type { Node, Edge, Connection, ConnectionLineType } from '@xyflow/svelte';
  import type { Store } from '@composable-svelte/core';
  import type { NodeCanvasState, NodeCanvasAction } from './types.js';
  import { nodesToArray, edgesToArray } from './types.js';

  import '@xyflow/svelte/dist/style.css';

  // ==========================================================================
  // Props
  // ==========================================================================

  interface NodeCanvasProps<NodeData, EdgeData, Action> {
    /**
     * Composable Architecture store managing canvas state.
     */
    store: Store<NodeCanvasState<NodeData, EdgeData>, Action>;

    /**
     * Lift canvas actions to parent action type.
     * Required to dispatch canvas actions through the store.
     */
    liftAction: (action: NodeCanvasAction<NodeData, EdgeData>) => Action;

    /**
     * Custom node components by type.
     * Maps node.type to Svelte component.
     */
    nodeTypes?: Record<string, any>;

    /**
     * Custom edge components by type.
     * Maps edge.type to Svelte component.
     */
    edgeTypes?: Record<string, any>;

    /**
     * Connection line type (bezier, smoothstep, step, straight).
     * @default 'bezier'
     */
    connectionLineType?: ConnectionLineType;

    /**
     * Enable/disable panning.
     * @default true
     */
    panOnDrag?: boolean;

    /**
     * Enable/disable zoom on scroll.
     * @default true
     */
    zoomOnScroll?: boolean;

    /**
     * Enable/disable selection.
     * @default true
     */
    selectable?: boolean;

    /**
     * CSS class for the canvas container.
     */
    class?: string;

    /**
     * Minimum zoom level.
     * @default 0.1
     */
    minZoom?: number;

    /**
     * Maximum zoom level.
     * @default 2
     */
    maxZoom?: number;
  }

  const {
    store,
    liftAction,
    nodeTypes,
    edgeTypes,
    connectionLineType = 'bezier',
    panOnDrag = true,
    zoomOnScroll = true,
    selectable = true,
    class: className = '',
    minZoom = 0.1,
    maxZoom = 2
  }: NodeCanvasProps<NodeData, EdgeData, Action> = $props();

  // ==========================================================================
  // Reactive State from Store
  // ==========================================================================

  // Use Svelte's auto-subscription pattern - ZERO boilerplate!
  // The store implements subscribe(), so we can use $store syntax
  const nodes = $derived(nodesToArray($store.nodes));
  const edges = $derived(edgesToArray($store.edges));
  const viewport = $derived($store.viewport);
  const snapGrid = $derived(
    $store.snapToGrid
      ? ([$store.gridSize, $store.gridSize] as [number, number])
      : undefined
  );

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle node drag events - update node positions.
   */
  function handleNodeDrag(event: CustomEvent) {
    const { targetNode } = event.detail;
    if (!targetNode) return;

    store.dispatch(
      liftAction({
        type: 'moveNode',
        nodeId: targetNode.id,
        position: targetNode.position
      })
    );
  }

  /**
   * Handle connection creation.
   */
  function handleConnect(event: CustomEvent<Connection>) {
    const connection = event.detail;

    store.dispatch(
      liftAction({
        type: 'connect',
        sourceNodeId: connection.source,
        sourceHandle: connection.sourceHandle ?? null,
        targetNodeId: connection.target,
        targetHandle: connection.targetHandle ?? null
      })
    );
  }

  /**
   * Handle connection start (user starts dragging from a port).
   */
  function handleConnectStart(event: CustomEvent) {
    const { nodeId, handleId } = event.detail;

    store.dispatch(
      liftAction({
        type: 'connectionStart',
        sourceNodeId: nodeId,
        sourceHandle: handleId ?? null
      })
    );
  }

  /**
   * Handle connection end (user releases drag).
   */
  function handleConnectEnd() {
    store.dispatch(liftAction({ type: 'connectionEnd' }));
  }

  /**
   * Handle nodes change (positions, selections, etc.).
   */
  function handleNodesChange(event: CustomEvent<Node<NodeData>[]>) {
    const updatedNodes = event.detail;

    // Update all nodes in bulk
    store.dispatch(
      liftAction({
        type: 'setNodes',
        nodes: updatedNodes
      })
    );
  }

  /**
   * Handle edges change.
   */
  function handleEdgesChange(event: CustomEvent<Edge<EdgeData>[]>) {
    const updatedEdges = event.detail;

    // Update all edges in bulk
    store.dispatch(
      liftAction({
        type: 'setEdges',
        edges: updatedEdges
      })
    );
  }

  /**
   * Handle viewport change (pan/zoom).
   */
  function handleViewportChange(event: CustomEvent) {
    const newViewport = event.detail;

    store.dispatch(
      liftAction({
        type: 'setViewport',
        viewport: newViewport
      })
    );
  }

  /**
   * Handle node selection.
   */
  function handleNodeClick(event: CustomEvent) {
    const { node } = event.detail;
    const multiSelect = event.detail.event?.shiftKey || event.detail.event?.metaKey;

    store.dispatch(
      liftAction({
        type: 'selectNode',
        nodeId: node.id,
        multiSelect
      })
    );
  }

  /**
   * Handle edge selection.
   */
  function handleEdgeClick(event: CustomEvent) {
    const { edge } = event.detail;
    const multiSelect = event.detail.event?.shiftKey || event.detail.event?.metaKey;

    store.dispatch(
      liftAction({
        type: 'selectEdge',
        edgeId: edge.id,
        multiSelect
      })
    );
  }

  /**
   * Handle pane (background) click - clear selection.
   */
  function handlePaneClick() {
    store.dispatch(liftAction({ type: 'clearSelection' }));
  }
</script>

<!-- ========================================================================== -->
<!-- Canvas -->
<!-- ========================================================================== -->

<div class="node-canvas {className}" style="width: 100%; height: 100%;">
  <SvelteFlow
    {nodes}
    {edges}
    {nodeTypes}
    {edgeTypes}
    {viewport}
    {connectionLineType}
    {panOnDrag}
    {zoomOnScroll}
    {selectable}
    {minZoom}
    {maxZoom}
    snapGrid={snapGrid}
    fitView={true}
    defaultEdgeOptions={{
      type: 'smoothstep',
      animated: false
    }}
    on:nodedrag={handleNodeDrag}
    on:nodedragstop={handleNodeDrag}
    on:connect={handleConnect}
    on:connectstart={handleConnectStart}
    on:connectend={handleConnectEnd}
    on:nodeschange={handleNodesChange}
    on:edgeschange={handleEdgesChange}
    on:viewportchange={handleViewportChange}
    on:nodeclick={handleNodeClick}
    on:edgeclick={handleEdgeClick}
    on:paneclick={handlePaneClick}
  >
    {#if $store.showControls}
      <Controls />
    {/if}

    {#if $store.showMiniMap}
      <MiniMap />
    {/if}

    <Background
      variant={$store.snapToGrid ? 'dots' : 'lines'}
      gap={$store.gridSize}
    />
  </SvelteFlow>
</div>

<style>
  .node-canvas {
    position: relative;
    background-color: var(--canvas-bg, #fafafa);
  }

  /* Dark mode support */
  :global(.dark) .node-canvas {
    background-color: var(--canvas-bg-dark, #1a1a1a);
  }
</style>
