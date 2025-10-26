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
  StoreConfig
  // Middleware and MiddlewareAPI deferred to Phase 5
  // Middleware,
  // MiddlewareAPI
} from './types.js';

// Export Effect type with alias to avoid name conflict with Effect namespace
export type { Effect as EffectType } from './types.js';

// Note: Most users won't need to explicitly import EffectType.
// TypeScript will infer the Effect type from Effect.none(), Effect.run(), etc.
// Use EffectType only when you need to annotate effect variables explicitly:
// const myEffect: EffectType<MyAction> = Effect.run(...);

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
  scopeAction,
  combineReducers
} from './composition/index.js';

export type {
  StateLens,
  StateUpdater,
  ActionPrism,
  ActionEmbedder
} from './composition/index.js';

// ============================================================================
// Navigation
// ============================================================================

export type {
  PresentationAction,
  StackAction,
  Presentation,
  Stack,
  DestinationState,
  DestinationReducerMap,
  CasePath,
  StackResult,
  ScopedDestinationStore,
  DismissDependency
} from './navigation/index.js';

export {
  PresentationActionHelpers,
  StackActionHelpers,
  ifLet,
  ifLetPresentation,
  createDestinationReducer,
  createDestination,
  isDestinationType,
  extractDestinationState,
  matchPresentationAction,
  isActionAtPath,
  matchPaths,
  extractDestinationOnAction,
  push,
  pop,
  popToRoot,
  setPath,
  handleStackAction,
  topScreen,
  rootScreen,
  canGoBack,
  stackDepth,
  scopeToDestination,
  scopeToOptional,
  createDismissDependency,
  createDismissDependencyWithCleanup,
  dismissDependency
} from './navigation/index.js';

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
