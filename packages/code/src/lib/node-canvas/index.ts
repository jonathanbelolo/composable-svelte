/**
 * Node Canvas Component
 *
 * Node-based canvas editor with SvelteFlow integration.
 * Follows Composable Architecture pattern with store-driven state.
 *
 * @example
 * ```typescript
 * import { createStore } from '@composable-svelte/core';
 * import {
 *   nodeCanvasReducer,
 *   createInitialNodeCanvasState,
 *   type NodeCanvasAction
 * } from '@composable-svelte/code/node-canvas';
 *
 * const store = createStore({
 *   initialState: createInitialNodeCanvasState(),
 *   reducer: nodeCanvasReducer
 * });
 * ```
 */

export { default as NodeCanvas } from './NodeCanvas.svelte';
export { nodeCanvasReducer } from './reducer.js';
export {
  createConnectionValidator,
  permissiveValidator,
  strictValidator,
  composeValidators
} from './validation.js';

export type {
  NodeCanvasState,
  NodeCanvasAction,
  NodeCanvasDependencies,
  NodeTypeDefinition,
  PortDefinition,
  ConnectionValidation,
  ConnectionValidator
} from './types.js';

export { createInitialNodeCanvasState, nodesToArray, edgesToArray } from './types.js';
