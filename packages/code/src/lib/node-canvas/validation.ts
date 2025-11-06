/**
 * Connection Validation Utilities
 *
 * Type-safe connection validation for node-based editors.
 * Validates connections based on port types, multiplicity, and custom rules.
 */

import type {
  NodeCanvasState,
  ConnectionValidation,
  NodeTypeDefinition
} from './types.js';

/**
 * Default connection validator with type-safe port validation.
 *
 * Validates:
 * - Nodes exist
 * - No self-connections
 * - Port types are compatible
 * - Port multiplicity (single vs multiple connections)
 * - Custom node-level validation
 */
export function createConnectionValidator(
  nodeTypes: Record<string, NodeTypeDefinition>
): (
  state: NodeCanvasState<any, any>,
  sourceNodeId: string,
  sourceHandle: string | null,
  targetNodeId: string,
  targetHandle: string | null
) => ConnectionValidation {
  return (state, sourceNodeId, sourceHandle, targetNodeId, targetHandle) => {
    // Get nodes
    const sourceNode = state.nodes[sourceNodeId];
    const targetNode = state.nodes[targetNodeId];

    // Validate nodes exist
    if (!sourceNode) {
      return {
        valid: false,
        error: `Source node ${sourceNodeId} not found`
      };
    }

    if (!targetNode) {
      return {
        valid: false,
        error: `Target node ${targetNodeId} not found`
      };
    }

    // Prevent self-connections
    if (sourceNodeId === targetNodeId) {
      return {
        valid: false,
        error: 'Cannot connect a node to itself'
      };
    }

    // Get node type definitions
    const sourceNodeType = nodeTypes[sourceNode.type ?? 'default'];
    const targetNodeType = nodeTypes[targetNode.type ?? 'default'];

    if (!sourceNodeType || !targetNodeType) {
      // No type definitions - allow connection (permissive mode)
      return { valid: true };
    }

    // Get port definitions
    const sourcePort = sourceHandle
      ? sourceNodeType.outputs?.find((p) => p.id === sourceHandle)
      : sourceNodeType.outputs?.[0]; // Default to first output

    const targetPort = targetHandle
      ? targetNodeType.inputs?.find((p) => p.id === targetHandle)
      : targetNodeType.inputs?.[0]; // Default to first input

    // Validate ports exist
    if (!sourcePort) {
      return {
        valid: false,
        error: `Source node has no output port ${sourceHandle || '(default)'}`
      };
    }

    if (!targetPort) {
      return {
        valid: false,
        error: `Target node has no input port ${targetHandle || '(default)'}`
      };
    }

    // Validate port data types are compatible
    if (sourcePort.dataType !== targetPort.dataType) {
      return {
        valid: false,
        error: `Incompatible types: ${sourcePort.dataType} -> ${targetPort.dataType}`
      };
    }

    // Check if target port already has a connection (if not multiple)
    if (!targetPort.multiple) {
      const existingConnection = Object.values(state.edges).find(
        (edge) => edge.target === targetNodeId && edge.targetHandle === targetHandle
      );

      if (existingConnection) {
        return {
          valid: false,
          error: `Target port ${targetPort.label} already has a connection`
        };
      }
    }

    // Check if source port has reached max connections (if not multiple)
    if (!sourcePort.multiple) {
      const existingConnection = Object.values(state.edges).find(
        (edge) => edge.source === sourceNodeId && edge.sourceHandle === sourceHandle
      );

      if (existingConnection) {
        return {
          valid: false,
          error: `Source port ${sourcePort.label} already has a connection`
        };
      }
    }

    // Check for cycles (would create circular dependency)
    const wouldCreateCycle = detectCycle(
      state,
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle
    );

    if (wouldCreateCycle) {
      return {
        valid: false,
        error: 'Connection would create a circular dependency'
      };
    }

    // Custom node-level validation
    if (sourceNodeType.validate) {
      const error = sourceNodeType.validate(sourceNode.data);
      if (error) {
        return { valid: false, error: `Source node: ${error}` };
      }
    }

    if (targetNodeType.validate) {
      const error = targetNodeType.validate(targetNode.data);
      if (error) {
        return { valid: false, error: `Target node: ${error}` };
      }
    }

    return { valid: true };
  };
}

/**
 * Detect if adding an edge would create a cycle in the graph.
 * Uses depth-first search to check for cycles.
 */
function detectCycle(
  state: NodeCanvasState<any, any>,
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandle: string | null,
  targetHandle: string | null
): boolean {
  // Build adjacency list from existing edges
  const adjacencyList = new Map<string, Set<string>>();

  for (const edge of Object.values(state.edges)) {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, new Set());
    }
    adjacencyList.get(edge.source)!.add(edge.target);
  }

  // Add the proposed edge
  if (!adjacencyList.has(sourceNodeId)) {
    adjacencyList.set(sourceNodeId, new Set());
  }
  adjacencyList.get(sourceNodeId)!.add(targetNodeId);

  // DFS to detect cycle
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycleDFS(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true; // Found cycle
    if (visited.has(nodeId)) return false; // Already checked

    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (hasCycleDFS(neighbor)) return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  // Check from the target node (if we can reach source, it's a cycle)
  return hasCycleDFS(targetNodeId);
}

/**
 * Helper to create permissive validator (allows all connections).
 */
export function permissiveValidator(): ConnectionValidation {
  return { valid: true };
}

/**
 * Helper to create strict validator (blocks all connections).
 */
export function strictValidator(error: string = 'Connections not allowed'): ConnectionValidation {
  return { valid: false, error };
}

/**
 * Compose multiple validators (all must pass).
 */
export function composeValidators(
  ...validators: ((
    state: NodeCanvasState<any, any>,
    sourceNodeId: string,
    sourceHandle: string | null,
    targetNodeId: string,
    targetHandle: string | null
  ) => ConnectionValidation)[]
): (
  state: NodeCanvasState<any, any>,
  sourceNodeId: string,
  sourceHandle: string | null,
  targetNodeId: string,
  targetHandle: string | null
) => ConnectionValidation {
  return (state, sourceNodeId, sourceHandle, targetNodeId, targetHandle) => {
    for (const validator of validators) {
      const result = validator(state, sourceNodeId, sourceHandle, targetNodeId, targetHandle);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  };
}
