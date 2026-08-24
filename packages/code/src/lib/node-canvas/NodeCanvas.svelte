<script lang="ts" generics="NodeData extends Record<string, unknown> = Record<string, unknown>, EdgeData extends Record<string, unknown> = Record<string, unknown>, Action = any">
  /**
   * NodeCanvas Component
   *
   * Node-based canvas editor with SvelteFlow integration.
   * Follows Composable Architecture pattern with store-driven state.
   */

  import { SvelteFlow, Controls, MiniMap, Background } from '@xyflow/svelte';
  import type {
    Node,
    Edge,
    Connection,
    ConnectionLineType,
    BackgroundVariant,
    OnConnectStartParams
  } from '@xyflow/svelte';
  import type { Store } from '@composable-svelte/core';
  import type { NodeCanvasState, NodeCanvasAction } from './types.js';
  import { nodesToArray, edgesToArray } from './types.js';
  import FlowCommands from './FlowCommands.svelte';

  import '@xyflow/svelte/dist/style.css';

  // ==========================================================================
  // Props
  // ==========================================================================

  interface NodeCanvasProps<NodeData extends Record<string, unknown>, EdgeData extends Record<string, unknown>, Action> {
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
     * Inverse of `liftAction`, used to recognise this canvas's viewport
     * commands in the store's action stream. Optional: the default handles the
     * common case where `liftAction` is the identity. Supply it when the parent
     * wraps canvas actions, or `setViewport` / `zoomIn` / `zoomOut` / `fitView`
     * / `centerView` will not reach the canvas.
     */
    unliftAction?: ((action: Action) => NodeCanvasAction<NodeData, EdgeData> | null) | undefined;

    /**
     * Custom node components by type.
     * Maps node.type to Svelte component.
     */
    nodeTypes?: Record<string, any> | undefined;

    /**
     * Custom edge components by type.
     * Maps edge.type to Svelte component.
     */
    edgeTypes?: Record<string, any> | undefined;

    /**
     * Connection line type (bezier, smoothstep, step, straight).
     * @default 'bezier'
     */
    connectionLineType?: ConnectionLineType | undefined;

    /**
     * Enable/disable panning.
     * @default true
     */
    panOnDrag?: boolean | undefined;

    /**
     * Enable/disable zoom on scroll.
     * @default true
     */
    zoomOnScroll?: boolean | undefined;

    /**
     * Enable/disable selection.
     * @default true
     */
    selectable?: boolean | undefined;

    /**
     * CSS class for the canvas container.
     */
    class?: string | undefined;

    /**
     * Minimum zoom level.
     * @default 0.1
     */
    minZoom?: number | undefined;

    /**
     * Maximum zoom level.
     * @default 2
     */
    maxZoom?: number | undefined;

    /**
     * Automatically fit view to show all nodes.
     * Set to false when restoring a saved viewport.
     * @default true
     */
    fitView?: boolean | undefined;

    /**
     * Direct callback for viewport changes (zoom/pan).
     * Called with the new viewport values when user finishes moving.
     * This bypasses the store and provides direct access to SvelteFlow's viewport.
     */
    onViewportChange?: ((viewport: { zoom: number; x: number; y: number }) => void) | undefined;

  }

  const props: NodeCanvasProps<NodeData, EdgeData, Action> = $props();

  // `$derived` accessors, NOT a second destructure.
  //
  // `const { nodeTypes, ... } = props` destructures a plain variable rather
  // than the `$props()` call site, so each name is read exactly once at init
  // and never again. Eleven props were frozen that way: changing `minZoom`,
  // `nodeTypes`, `panOnDrag` or any of the others after mount did nothing.
  // Only `store` and `liftAction` stay plain — they are identity-stable by
  // contract, and `liftAction` is called, not rendered.
  const { store, liftAction } = props;

  /** The commands `FlowCommands` acts on; everything else is ignored. */
  const VIEWPORT_COMMANDS = new Set(['setViewport', 'zoomIn', 'zoomOut', 'fitView', 'centerView']);

  /**
   * Is `liftAction` the identity?
   *
   * Probed once with a sentinel. The default unlift below matches on bare type
   * names — `setViewport`, `zoomIn`, `fitView` and friends are generic enough
   * that a parent could plausibly own actions with the same names. Applying it
   * to a WRAPPING parent would both hijack those actions and hand
   * `FlowCommands` an object of the wrong shape, so it is only safe when the
   * parent's action type *is* the canvas action type.
   *
   * A wrapping parent that wants viewport commands supplies `unliftAction`.
   */
  const liftsIdentically = (() => {
    const probe = { type: '__composable_svelte_probe__' } as unknown as NodeCanvasAction<
      NodeData,
      EdgeData
    >;
    try {
      return (liftAction(probe) as unknown) === (probe as unknown);
    } catch {
      return false;
    }
  })();

  const unliftAction = $derived(
    props.unliftAction ??
      ((action: Action): NodeCanvasAction<NodeData, EdgeData> | null => {
        if (!liftsIdentically) return null;
        const candidate = action as { type?: unknown; viewport?: unknown };
        if (typeof candidate?.type !== 'string' || !VIEWPORT_COMMANDS.has(candidate.type)) {
          return null;
        }
        // Shape-check the one command that carries a payload, so a same-named
        // parent action cannot reach `canvasAction.viewport.x` and throw.
        if (candidate.type === 'setViewport') {
          const vp = candidate.viewport as { x?: unknown; y?: unknown; zoom?: unknown } | undefined;
          if (
            typeof vp?.x !== 'number' ||
            typeof vp?.y !== 'number' ||
            typeof vp?.zoom !== 'number'
          ) {
            return null;
          }
        }
        return action as unknown as NodeCanvasAction<NodeData, EdgeData>;
      })
  );

  // Defaulted rather than forwarded as-is: SvelteFlow's nodeTypes/edgeTypes
  // do not accept an explicit undefined under exactOptionalPropertyTypes.
  const nodeTypes = $derived(props.nodeTypes ?? {});
  const edgeTypes = $derived(props.edgeTypes ?? {});
  // ConnectionLineType.Bezier is the string "default", not "bezier".
  const connectionLineType = $derived(
    props.connectionLineType ?? ('default' as ConnectionLineType)
  );
  const panOnDrag = $derived(props.panOnDrag ?? true);
  const zoomOnScroll = $derived(props.zoomOnScroll ?? true);
  const selectable = $derived(props.selectable ?? true);
  const className = $derived(props.class ?? '');
  const minZoom = $derived(props.minZoom ?? 0.1);
  const maxZoom = $derived(props.maxZoom ?? 2);
  const fitView = $derived(props.fitView ?? true);
  const onViewportChange = $derived(props.onViewportChange);

  // ==========================================================================
  // Reactive State from Store
  // ==========================================================================

  // Use Svelte's auto-subscription pattern - ZERO boilerplate!
  // The store implements subscribe(), so we can use $store syntax
  // `selected` is mapped on from the store, which is what makes
  // `selectedNodes` / `selectedEdges` mean anything. They were fully maintained
  // by the reducer and read by nobody — what looked like working selection was
  // SvelteFlow's own internal state agreeing by coincidence.
  //
  // The identity-preserving branch is load-bearing, not an optimisation:
  // `$state.raw` replaces the whole state object on every dispatch, so this
  // recomputes constantly, and xyflow's `adoptUserNodes` compares by reference
  // (`checkEquality: true`). Returning `{ ...n }` unconditionally would force a
  // full re-adoption of every node on every action.
  // Projections of selected items, cached by SOURCE OBJECT identity.
  //
  // The naive `(n.selected ?? false) === selected ? n : { ...n, selected }` is
  // subtly wrong: stored nodes carry no `selected` key, so every node in
  // `selectedNodes` fails the comparison and re-clones on EVERY dispatch —
  // exactly the full re-adoption the branch was meant to avoid, and worse the
  // more the user selects. A WeakMap keyed on the stored node gives a stable
  // projection for as long as the source is unchanged, and is collected with it.
  const selectedNodeProjection = new WeakMap<object, object>();
  const selectedEdgeProjection = new WeakMap<object, object>();

  function project<T extends object>(item: T, selected: boolean, cache: WeakMap<object, object>): T {
    if (!selected) return item;
    let projected = cache.get(item);
    if (!projected) {
      projected = { ...item, selected: true };
      cache.set(item, projected);
    }
    return projected as T;
  }

  const nodes = $derived(
    nodesToArray($store.nodes).map((n) =>
      project(n, $store.selectedNodes.has(n.id), selectedNodeProjection)
    )
  );
  const edges = $derived(
    edgesToArray($store.edges).map((e) =>
      project(e, $store.selectedEdges.has(e.id), selectedEdgeProjection)
    )
  );
  // Seeds SvelteFlow's initial viewport only — it is read once at construction.
  // That is exactly why every viewport ACTION used to do nothing; live changes
  // now go through `FlowCommands`. Kept because restoring a saved viewport at
  // mount is a real use, but note it loses to the `fitView` prop, which queues
  // an auto-fit after nodes initialise.
  const storeViewport = $derived($store.viewport);
  // SvelteFlow has no snapToGrid boolean — snapping is on when snapGrid is
  // present and off when it is absent, so it is spread in conditionally below
  // rather than passed as an explicit undefined.
  const snapGrid = $derived(
    $store.snapToGrid
      ? ([$store.gridSize, $store.gridSize] as [number, number])
      : undefined
  );

  // ==========================================================================
  // Viewport
  // ==========================================================================
  // `FlowCommands` (rendered inside SvelteFlow) turns the store's viewport
  // actions into `useSvelteFlow()` calls; `handleMoveEnd` below reports the
  // canvas's own movement back inward. Between them the store's `viewport` is
  // a live projection rather than the frozen mount-time value it used to be.
  //
  // The old `isRestoring` timing flag is gone. It suppressed `onViewportChange`
  // for 100ms after any external viewport, whether or not the value actually
  // differed — a race standing in for a comparison. `handleMoveEnd` now guards
  // by value, which makes the programmatic echo a provable no-op.

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
  function handleConnect(connection: Connection) {
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
  function handleConnectStart(_event: MouseEvent | TouchEvent, { nodeId, handleId }: OnConnectStartParams) {
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
   * Handle viewport change completion.
   * With bind:viewport, SvelteFlow updates localViewport directly.
   * This just calls the callback for persistence.
   */
  function handleMoveEnd(_event: unknown, newViewport: { x: number; y: number; zoom: number }) {
    // Value guard, read non-reactively. Dispatching `setViewport` moves the
    // canvas, which fires `onmoveend` again — this is what terminates that.
    const current = store.state.viewport;
    if (
      current.x === newViewport.x &&
      current.y === newViewport.y &&
      current.zoom === newViewport.zoom
    ) {
      return;
    }

    store.dispatch(liftAction({ type: 'setViewport', viewport: newViewport }));
    onViewportChange?.(newViewport);
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

<!--
  `data-connecting` exposes `connectionInProgress`, which the reducer has
  always maintained and nothing ever read. Consumers can style the canvas
  while a connection is being dragged.
-->
<div
  class="node-canvas {className}"
  style="width: 100%; height: 100%;"
  data-connecting={$store.connectionInProgress ? '' : undefined}
>
  <SvelteFlow
    {nodes}
    {edges}
    {nodeTypes}
    {edgeTypes}
    initialViewport={storeViewport}
    {connectionLineType}
    {panOnDrag}
    {zoomOnScroll}
    elementsSelectable={selectable && !$store.readonly}
    nodesDraggable={!$store.readonly}
    nodesConnectable={!$store.readonly}
    {minZoom}
    {maxZoom}
    {...(snapGrid ? { snapGrid } : {})}
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
    onmoveend={handleMoveEnd}
    onnodeclick={handleNodeClick}
    onedgeclick={handleEdgeClick}
    onpaneclick={handlePaneClick}
  >
    <!-- Turns store viewport actions into useSvelteFlow() calls. -->
    <FlowCommands {store} {unliftAction} {minZoom} {maxZoom} />

    {#if $store.showControls}
      <Controls />
    {/if}

    {#if $store.showMiniMap}
      <MiniMap />
    {/if}

    <Background
      variant={($store.snapToGrid ? 'dots' : 'lines') as BackgroundVariant}
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
