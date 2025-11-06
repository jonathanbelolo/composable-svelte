/**
 * Node Canvas Reducer
 *
 * Pure reducer function handling all canvas state transitions.
 * Follows Composable Architecture pattern: (state, action, deps) => [newState, effect]
 */

import type { Node, Edge } from '@xyflow/svelte';
import type {
  NodeCanvasState,
  NodeCanvasAction,
  NodeCanvasDependencies
} from './types.js';
import type { EffectType } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';

/**
 * Node canvas reducer - pure function handling all state transitions.
 *
 * @param state - Current canvas state
 * @param action - Action to process
 * @param deps - Injectable dependencies (validation, ID generation, etc.)
 * @returns Tuple of [new state, effect to execute]
 */
export function nodeCanvasReducer<
  NodeData extends Record<string, unknown> = Record<string, unknown>,
  EdgeData extends Record<string, unknown> = Record<string, unknown>
>(
  state: NodeCanvasState<NodeData, EdgeData>,
  action: NodeCanvasAction<NodeData, EdgeData>,
  deps: NodeCanvasDependencies = {}
): [NodeCanvasState<NodeData, EdgeData>, EffectType<NodeCanvasAction<NodeData, EdgeData>>] {
  switch (action.type) {
    // ========================================================================
    // Node Operations
    // ========================================================================

    case 'addNode': {
      const { node } = action;
      return [
        {
          ...state,
          nodes: {
            ...state.nodes,
            [node.id]: node
          }
        },
        Effect.none()
      ];
    }

    case 'removeNode': {
      const { nodeId } = action;
      const { [nodeId]: removed, ...remainingNodes } = state.nodes;

      // Also remove edges connected to this node
      const remainingEdges = Object.fromEntries(
        Object.entries(state.edges).filter(
          ([_, edge]) => edge.source !== nodeId && edge.target !== nodeId
        )
      );

      // Remove from selection
      const selectedNodes = new Set(state.selectedNodes);
      selectedNodes.delete(nodeId);

      return [
        {
          ...state,
          nodes: remainingNodes,
          edges: remainingEdges,
          selectedNodes
        },
        Effect.none()
      ];
    }

    case 'updateNode': {
      const { nodeId, updates } = action;
      const node = state.nodes[nodeId];
      if (!node) return [state, Effect.none()];

      return [
        {
          ...state,
          nodes: {
            ...state.nodes,
            [nodeId]: { ...node, ...updates }
          }
        },
        Effect.none()
      ];
    }

    case 'moveNode': {
      const { nodeId, position } = action;
      const node = state.nodes[nodeId];
      if (!node) return [state, Effect.none()];

      return [
        {
          ...state,
          nodes: {
            ...state.nodes,
            [nodeId]: { ...node, position }
          }
        },
        Effect.none()
      ];
    }

    case 'setNodes': {
      const { nodes } = action;
      const nodesRecord = Object.fromEntries(nodes.map((n) => [n.id, n]));

      return [
        {
          ...state,
          nodes: nodesRecord
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Edge Operations
    // ========================================================================

    case 'addEdge': {
      const { edge } = action;
      return [
        {
          ...state,
          edges: {
            ...state.edges,
            [edge.id]: edge
          }
        },
        Effect.none()
      ];
    }

    case 'removeEdge': {
      const { edgeId } = action;
      const { [edgeId]: removed, ...remainingEdges } = state.edges;

      // Remove from selection
      const selectedEdges = new Set(state.selectedEdges);
      selectedEdges.delete(edgeId);

      return [
        {
          ...state,
          edges: remainingEdges,
          selectedEdges
        },
        Effect.none()
      ];
    }

    case 'updateEdge': {
      const { edgeId, updates } = action;
      const edge = state.edges[edgeId];
      if (!edge) return [state, Effect.none()];

      return [
        {
          ...state,
          edges: {
            ...state.edges,
            [edgeId]: { ...edge, ...updates }
          }
        },
        Effect.none()
      ];
    }

    case 'setEdges': {
      const { edges } = action;
      const edgesRecord = Object.fromEntries(edges.map((e) => [e.id, e]));

      return [
        {
          ...state,
          edges: edgesRecord
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Connection Operations
    // ========================================================================

    case 'connectionStart': {
      const { sourceNodeId, sourceHandle } = action;
      return [
        {
          ...state,
          connectionInProgress: { sourceNodeId, sourceHandle }
        },
        Effect.none()
      ];
    }

    case 'connectionEnd': {
      return [
        {
          ...state,
          connectionInProgress: null
        },
        Effect.none()
      ];
    }

    case 'connect': {
      const { sourceNodeId, sourceHandle, targetNodeId, targetHandle } = action;

      // Validate connection
      if (deps.validateConnection) {
        const validation = deps.validateConnection(
          state,
          sourceNodeId,
          sourceHandle,
          targetNodeId,
          targetHandle
        );

        if (!validation.valid) {
          console.warn(`[NodeCanvas] Invalid connection: ${validation.error}`);
          return [
            {
              ...state,
              connectionInProgress: null
            },
            Effect.none()
          ];
        }
      }

      // Generate edge ID
      const edgeId =
        deps.generateId?.() ?? `edge-${sourceNodeId}-${targetNodeId}-${Date.now()}`;

      const newEdge: Edge<EdgeData> = {
        id: edgeId,
        source: sourceNodeId,
        target: targetNodeId,
        sourceHandle,
        targetHandle
      } as Edge<EdgeData>;

      return [
        {
          ...state,
          edges: {
            ...state.edges,
            [edgeId]: newEdge
          },
          connectionInProgress: null
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Selection Operations
    // ========================================================================

    case 'selectNode': {
      const { nodeId, multiSelect = false } = action;
      const selectedNodes = multiSelect
        ? new Set([...state.selectedNodes, nodeId])
        : new Set([nodeId]);

      return [
        {
          ...state,
          selectedNodes,
          selectedEdges: multiSelect ? state.selectedEdges : new Set()
        },
        Effect.none()
      ];
    }

    case 'selectEdge': {
      const { edgeId, multiSelect = false } = action;
      const selectedEdges = multiSelect
        ? new Set([...state.selectedEdges, edgeId])
        : new Set([edgeId]);

      return [
        {
          ...state,
          selectedEdges,
          selectedNodes: multiSelect ? state.selectedNodes : new Set()
        },
        Effect.none()
      ];
    }

    case 'clearSelection': {
      return [
        {
          ...state,
          selectedNodes: new Set(),
          selectedEdges: new Set()
        },
        Effect.none()
      ];
    }

    case 'selectAll': {
      return [
        {
          ...state,
          selectedNodes: new Set(Object.keys(state.nodes)),
          selectedEdges: new Set()
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Viewport Operations
    // ========================================================================

    case 'setViewport': {
      const { viewport } = action;
      return [
        {
          ...state,
          viewport
        },
        Effect.none()
      ];
    }

    case 'zoomIn': {
      const newZoom = Math.min(state.viewport.zoom * 1.2, 2);
      return [
        {
          ...state,
          viewport: { ...state.viewport, zoom: newZoom }
        },
        Effect.none()
      ];
    }

    case 'zoomOut': {
      const newZoom = Math.max(state.viewport.zoom / 1.2, 0.1);
      return [
        {
          ...state,
          viewport: { ...state.viewport, zoom: newZoom }
        },
        Effect.none()
      ];
    }

    case 'fitView':
    case 'centerView': {
      // These will be handled by SvelteFlow's built-in functions via effects
      // Return current state, let the component handle the actual viewport change
      return [state, Effect.none()];
    }

    // ========================================================================
    // Configuration Operations
    // ========================================================================

    case 'setReadonly': {
      const { readonly } = action;
      return [
        {
          ...state,
          readonly
        },
        Effect.none()
      ];
    }

    case 'toggleMiniMap': {
      return [
        {
          ...state,
          showMiniMap: !state.showMiniMap
        },
        Effect.none()
      ];
    }

    case 'toggleControls': {
      return [
        {
          ...state,
          showControls: !state.showControls
        },
        Effect.none()
      ];
    }

    case 'toggleSnapToGrid': {
      return [
        {
          ...state,
          snapToGrid: !state.snapToGrid
        },
        Effect.none()
      ];
    }

    case 'setGridSize': {
      const { size } = action;
      return [
        {
          ...state,
          gridSize: Math.max(5, size)
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Batch Operations
    // ========================================================================

    case 'importGraph': {
      const { nodes, edges } = action;
      const nodesRecord = Object.fromEntries(nodes.map((n) => [n.id, n]));
      const edgesRecord = Object.fromEntries(edges.map((e) => [e.id, e]));

      return [
        {
          ...state,
          nodes: nodesRecord,
          edges: edgesRecord,
          selectedNodes: new Set(),
          selectedEdges: new Set()
        },
        Effect.none()
      ];
    }

    case 'clearCanvas': {
      return [
        {
          ...state,
          nodes: {},
          edges: {},
          selectedNodes: new Set(),
          selectedEdges: new Set(),
          connectionInProgress: null
        },
        Effect.none()
      ];
    }

    case 'undo':
    case 'redo': {
      // Undo/redo will be implemented as a higher-order reducer
      // For now, return current state
      console.warn(`[NodeCanvas] ${action.type} not yet implemented`);
      return [state, Effect.none()];
    }

    default: {
      // Exhaustiveness check
      const _never: never = action;
      console.warn('[NodeCanvas] Unknown action:', _never);
      return [state, Effect.none()];
    }
  }
}
