/**
 * Node Canvas Types
 *
 * Type definitions for node-based canvas editor with SvelteFlow integration.
 * Follows Composable Architecture patterns with state, actions, and reducer.
 */

import type { Node, Edge, Viewport } from '@xyflow/svelte';
import type { EffectType } from '@composable-svelte/core';

// ============================================================================
// State
// ============================================================================

/**
 * Core canvas state following Composable Architecture pattern.
 */
export interface NodeCanvasState<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  EdgeData extends Record<string, unknown> = Record<string, unknown>
> {
  /**
   * Collection of nodes in the canvas.
   * Keyed by node.id for efficient lookups.
   */
  nodes: Record<string, Node<NodeData>>;

  /**
   * Collection of edges (connections) between nodes.
   * Keyed by edge.id for efficient lookups.
   */
  edges: Record<string, Edge<EdgeData>>;

  /**
   * Current viewport state (pan, zoom).
   */
  viewport: Viewport;

  /**
   * Currently selected nodes.
   */
  selectedNodes: Set<string>;

  /**
   * Currently selected edges.
   */
  selectedEdges: Set<string>;

  /**
   * Connection in progress (source node/port being dragged).
   */
  connectionInProgress: {
    sourceNodeId: string;
    sourceHandle: string | null;
  } | null;

  /**
   * Whether the canvas is in readonly mode (no interactions).
   */
  readonly: boolean;

  /**
   * Whether to show the mini-map.
   */
  showMiniMap: boolean;

  /**
   * Whether to show controls (zoom in/out/fit).
   */
  showControls: boolean;

  /**
   * Whether to snap nodes to grid when dragging.
   */
  snapToGrid: boolean;

  /**
   * Grid spacing (if snapToGrid is enabled).
   */
  gridSize: number;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * All possible actions that can be dispatched to modify canvas state.
 */
export type NodeCanvasAction<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  EdgeData extends Record<string, unknown> = Record<string, unknown>
> =
  // Node operations
  | { type: 'addNode'; node: Node<NodeData> }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'updateNode'; nodeId: string; updates: Partial<Node<NodeData>> }
  | { type: 'moveNode'; nodeId: string; position: { x: number; y: number } }
  | { type: 'setNodes'; nodes: Node<NodeData>[] }

  // Edge operations
  | { type: 'addEdge'; edge: Edge<EdgeData> }
  | { type: 'removeEdge'; edgeId: string }
  | { type: 'updateEdge'; edgeId: string; updates: Partial<Edge<EdgeData>> }
  | { type: 'setEdges'; edges: Edge<EdgeData>[] }

  // Connection operations
  | {
      type: 'connect';
      sourceNodeId: string;
      sourceHandle: string | null;
      targetNodeId: string;
      targetHandle: string | null;
    }
  | {
      type: 'connectionStart';
      sourceNodeId: string;
      sourceHandle: string | null;
    }
  | { type: 'connectionEnd' }

  // Selection operations
  | { type: 'selectNode'; nodeId: string; multiSelect?: boolean }
  | { type: 'selectEdge'; edgeId: string; multiSelect?: boolean }
  | { type: 'clearSelection' }
  | { type: 'selectAll' }

  // Viewport operations
  | { type: 'setViewport'; viewport: Viewport }
  | { type: 'zoomIn' }
  | { type: 'zoomOut' }
  | { type: 'fitView' }
  | { type: 'centerView' }

  // Configuration operations
  | { type: 'setReadonly'; readonly: boolean }
  | { type: 'toggleMiniMap' }
  | { type: 'toggleControls' }
  | { type: 'toggleSnapToGrid' }
  | { type: 'setGridSize'; size: number }

  // Batch operations
  | { type: 'importGraph'; nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] }
  | { type: 'clearCanvas' }
  | { type: 'undo' }
  | { type: 'redo' };

// ============================================================================
// Node Types & Validation
// ============================================================================

/**
 * Node type definition for connection validation.
 */
export interface NodeTypeDefinition {
  /**
   * Unique type identifier (e.g., 'input', 'output', 'transform').
   */
  type: string;

  /**
   * Display name for this node type.
   */
  label: string;

  /**
   * Input ports/handles configuration.
   */
  inputs?: PortDefinition[];

  /**
   * Output ports/handles configuration.
   */
  outputs?: PortDefinition[];

  /**
   * Custom validation for this node type.
   */
  validate?: (nodeData: any) => string | null;
}

/**
 * Port (handle) definition for connection validation.
 */
export interface PortDefinition {
  /**
   * Port ID (unique within the node).
   */
  id: string;

  /**
   * Display label for the port.
   */
  label: string;

  /**
   * Data type for type-safe connections.
   * Ports can only connect if types are compatible.
   */
  dataType: string;

  /**
   * Whether multiple connections are allowed.
   */
  multiple?: boolean;
}

/**
 * Connection validation result.
 */
export interface ConnectionValidation {
  /**
   * Whether the connection is valid.
   */
  valid: boolean;

  /**
   * Error message if invalid.
   */
  error?: string;
}

/**
 * Connection validation function type.
 */
export type ConnectionValidator<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  EdgeData extends Record<string, unknown> = Record<string, unknown>
> = (
  state: NodeCanvasState<NodeData, EdgeData>,
  sourceNodeId: string,
  sourceHandle: string | null,
  targetNodeId: string,
  targetHandle: string | null
) => ConnectionValidation;

// ============================================================================
// Dependencies
// ============================================================================

/**
 * Dependencies injectable into the canvas reducer.
 */
export interface NodeCanvasDependencies {
  /**
   * Connection validation function.
   * Validates if a connection between two ports is allowed.
   */
  validateConnection?: ConnectionValidator;

  /**
   * Node type registry for validation and rendering.
   */
  nodeTypes?: Record<string, NodeTypeDefinition>;

  /**
   * Generate unique IDs for new nodes/edges.
   */
  generateId?: () => string;

  /**
   * Auto-layout function (optional).
   * Calculates positions for nodes automatically.
   */
  autoLayout?: (
    nodes: Node[],
    edges: Edge[]
  ) => Record<string, { x: number; y: number }>;
}

// ============================================================================
// Reducer Type
// ============================================================================

/**
 * Canvas reducer type following Composable Architecture pattern.
 */
export type NodeCanvasReducer<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  EdgeData extends Record<string, unknown> = Record<string, unknown>
> = (
  state: NodeCanvasState<NodeData, EdgeData>,
  action: NodeCanvasAction<NodeData, EdgeData>,
  deps: NodeCanvasDependencies
) => [NodeCanvasState<NodeData, EdgeData>, EffectType<NodeCanvasAction<NodeData, EdgeData>>];

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Helper to create initial canvas state with defaults.
 */
export function createInitialNodeCanvasState<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  EdgeData extends Record<string, unknown> = Record<string, unknown>
>(
  overrides?: Partial<NodeCanvasState<NodeData, EdgeData>>
): NodeCanvasState<NodeData, EdgeData> {
  return {
    nodes: {},
    edges: {},
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    },
    selectedNodes: new Set(),
    selectedEdges: new Set(),
    connectionInProgress: null,
    readonly: false,
    showMiniMap: true,
    showControls: true,
    snapToGrid: false,
    gridSize: 15,
    ...overrides
  };
}

/**
 * Helper to convert state.nodes Record to array for SvelteFlow.
 */
export function nodesToArray<NodeData extends Record<string, unknown> = Record<string, unknown>>(
  nodes: Record<string, Node<NodeData>>
): Node<NodeData>[] {
  return Object.values(nodes);
}

/**
 * Helper to convert state.edges Record to array for SvelteFlow.
 */
export function edgesToArray<EdgeData extends Record<string, unknown> = Record<string, unknown>>(
  edges: Record<string, Edge<EdgeData>>
): Edge<EdgeData>[] {
  return Object.values(edges);
}
