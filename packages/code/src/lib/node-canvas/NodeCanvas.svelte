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
  import ViewportSetter from './ViewportSetter.svelte';

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

    /**
     * Automatically fit view to show all nodes.
     * Set to false when restoring a saved viewport.
     * @default true
     */
    fitView?: boolean;

    /**
     * Direct callback for viewport changes (zoom/pan).
     * Called with the new viewport values when user finishes moving.
     * This bypasses the store and provides direct access to SvelteFlow's viewport.
     */
    onViewportChange?: (viewport: { zoom: number; x: number; y: number }) => void;

    /**
     * External viewport to apply programmatically (e.g., for restoration).
     * When provided, this viewport will be used instead of the store's viewport.
     */
    externalViewport?: { zoom: number; x: number; y: number } | null;
  }

  const props: NodeCanvasProps<NodeData, EdgeData, Action> = $props();

  // Destructure with defaults for convenience, but use props.externalViewport for reactivity
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
    maxZoom = 2,
    fitView = true,
    onViewportChange
  } = props;

  // Debug: Log when component renders with props
  console.log('[NodeCanvas] Render with externalViewport:', props.externalViewport);

  // ==========================================================================
  // Reactive State from Store
  // ==========================================================================

  // Use Svelte's auto-subscription pattern - ZERO boilerplate!
  // The store implements subscribe(), so we can use $store syntax
  const nodes = $derived(nodesToArray($store.nodes));
  const edges = $derived(edgesToArray($store.edges));
  const storeViewport = $derived($store.viewport);
  const snapGrid = $derived(
    $store.snapToGrid
      ? ([$store.gridSize, $store.gridSize] as [number, number])
      : undefined
  );

  // ==========================================================================
  // Viewport Restoration
  // ==========================================================================
  // We use ViewportSetter (rendered inside SvelteFlow) to programmatically set
  // the viewport using useSvelteFlow().setViewport(). This is the official way
  // to control SvelteFlow's internal viewport state without sync issues.

  // Flag to prevent onViewportChange callback during restoration
  let isRestoring = $state(false);

  /**
   * Called by ViewportSetter when viewport is successfully applied.
   * Clears the restoration flag after a delay.
   */
  function handleViewportApplied() {
    // Clear flag after SvelteFlow has fully processed the change
    setTimeout(() => {
      isRestoring = false;
      console.log('[NodeCanvas] Restoration complete, callbacks re-enabled');
    }, 100);
  }

  // Set restoration flag when external viewport is provided
  $effect(() => {
    const extVp = props.externalViewport;
    if (extVp) {
      console.log('[NodeCanvas] External viewport received, setting restoration flag');
      isRestoring = true;
    }
  });

  // ==========================================================================
  // Event Handlers (Svelte 5 event prop format - data passed directly)
  // ==========================================================================

  /**
   * Handle node drag events - update node positions.
   */
  function handleNodeDrag({ targetNode }: { targetNode: Node<NodeData> | null; nodes: Node<NodeData>[]; event: MouseEvent | TouchEvent }) {
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
  function handleConnect({ connection }: { connection: Connection }) {
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
  function handleConnectStart({ nodeId, handleId }: { nodeId: string | null; handleId: string | null; handleType: string | null }) {
    if (!nodeId) return;

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
  function handleNodesChange(changes: any[]) {
    // In Svelte 5, this receives the changes array directly
    // We need to apply changes to current nodes
    // For now, we'll skip bulk updates as individual drag events handle positions
  }

  /**
   * Handle edges change.
   */
  function handleEdgesChange(changes: any[]) {
    // In Svelte 5, this receives the changes array directly
    // We'll skip bulk updates for now
  }

  /**
   * Handle viewport change completion.
   * With bind:viewport, SvelteFlow updates localViewport directly.
   * This just calls the callback for persistence.
   */
  function handleMoveEnd(event: any, newViewport: { x: number; y: number; zoom: number }) {
    // Don't call callback during restoration (prevents sending stale viewport to server)
    if (isRestoring) {
      console.log('[NodeCanvas] Skipping onViewportChange during restoration');
      return;
    }
    // Call direct callback for persistence
    if (onViewportChange) {
      onViewportChange(newViewport);
    }
  }

  /**
   * Handle node selection.
   */
  function handleNodeClick({ node, event }: { node: Node<NodeData>; event: MouseEvent | TouchEvent }) {
    const multiSelect = (event as MouseEvent).shiftKey || (event as MouseEvent).metaKey;

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
  function handleEdgeClick({ edge, event }: { edge: Edge<EdgeData>; event: MouseEvent }) {
    const multiSelect = event.shiftKey || event.metaKey;

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
    defaultViewport={storeViewport}
    {connectionLineType}
    {panOnDrag}
    {zoomOnScroll}
    {selectable}
    {minZoom}
    {maxZoom}
    snapGrid={snapGrid}
    {fitView}
    defaultEdgeOptions={{
      type: 'smoothstep',
      animated: false
    }}
    onnodedrag={handleNodeDrag}
    onnodedragstop={handleNodeDrag}
    onconnect={handleConnect}
    onconnectstart={handleConnectStart}
    onconnectend={handleConnectEnd}
    onnodeschange={handleNodesChange}
    onedgeschange={handleEdgesChange}
    onmoveend={handleMoveEnd}
    onnodeclick={handleNodeClick}
    onedgeclick={handleEdgeClick}
    onpaneclick={handlePaneClick}
  >
    <!-- ViewportSetter uses useSvelteFlow() to programmatically set viewport -->
    <ViewportSetter
      viewport={props.externalViewport}
      onApplied={handleViewportApplied}
    />

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
