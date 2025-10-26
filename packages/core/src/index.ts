/**
 * @composable-svelte/core
 *
 * A Composable Architecture for Svelte 5.
 *
 * This library provides:
 * - Predictable state management through pure reducers
 * - Unidirectional data flow via actions (events)
 * - Type-safe feature composition
 * - First-class testing support
 * - Declarative side effect handling
 * - Full integration with Svelte 5's reactivity system
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  Reducer,
  Dispatch,
  Selector,
  EffectExecutor,
  Store,
  StoreConfig,
  Middleware,
  MiddlewareAPI
} from './types.js';

// Note: Effect type is not exported here due to name conflict with Effect namespace.
// Import it directly when needed: import type { Effect } from '@composable-svelte/core/types'
// In most cases, TypeScript will infer the Effect type from Effect.none(), Effect.run(), etc.

// ============================================================================
// Store
// ============================================================================

export { createStore } from './store.svelte.js';

// ============================================================================
// Effects
// ============================================================================

export { Effect } from './effect.js';

// ============================================================================
// Composition
// ============================================================================

export {
  scope,
  combineReducers
} from './composition/index.js';

export type {
  StateLens,
  StateUpdater,
  ActionPrism,
  ActionEmbedder
} from './composition/index.js';

// ============================================================================
// Testing
// ============================================================================

export {
  TestStore,
  createTestStore
} from './test/test-store.js';

export type {
  TestStoreConfig,
  StateAssertion,
  PartialAction
} from './test/test-store.js';
