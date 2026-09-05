/**
 * Navigation Module
 *
 * State-driven navigation for Svelte applications.
 *
 * This module provides:
 * - Tree-based navigation (optional child state with ifLet)
 * - Enum-based routing (discriminated union destinations)
 * - Stack-based navigation (multi-screen linear flows)
 * - Presentation lifecycle (present/dismiss actions)
 * - Child self-dismissal (dismiss dependency)
 * - Scoped stores for components
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

export type {
  PresentationAction,
  StackAction,
  Presentation,
  Stack,
  PresentationState,
  PresentationEvent
} from './types.js';

export { PresentationAction as PresentationActionHelpers, StackAction as StackActionHelpers } from './types.js';

// ============================================================================
// Operators
// ============================================================================

export { ifLet, ifLetPresentation } from './if-let.js';

export {
  createDestinationReducer,
  destinationState,
  isDestinationType,
  extractDestinationState
} from './destination-reducer.js';

// The navigation DSL. `createDestination` builds the routing reducer *and* the
// matcher API from a map of child reducers, and is what every specification and
// skill document describes — 33 documented examples use this form and none used
// the state constructor that held the name before it.
export { createDestination } from './destination.js';
export type { Destination } from './destination.js';

export type {
  DestinationState,
  DestinationReducerMap
} from './destination-reducer.js';

// ============================================================================
// Matchers
// ============================================================================

export {
  matchPresentationAction,
  isActionAtPath,
  matchPaths,
  extractDestinationOnAction
} from './matchers.js';

export type { CasePath } from './matchers.js';

// ============================================================================
// Stack Navigation
// ============================================================================

export {
  push,
  pop,
  popToRoot,
  setPath,
  handleStackAction,
  topScreen,
  rootScreen,
  canGoBack,
  stackDepth
} from './stack.js';

export type { StackResult, StackActionOptions } from './stack.js';

// ============================================================================
// Scoped Stores (Phase 2)
// ============================================================================

export {
  scopeToDestination,
  scopeToOptional
} from './scope-to-destination.js';

export type { ScopedDestinationStore, ScopableStore } from './scope-to-destination.js';

export { scopeToElement } from './scope-to-element.js';

// ============================================================================
// Phase 3 DSL
// ============================================================================

// Fluent Reducer Integration
export { integrate } from './integrate.js';

// Fluent Store Scoping
export { scopeTo } from './scope.js';
export type { ScopedStore } from './scope.js';

// ============================================================================
// Dismiss Dependency
// ============================================================================

export {
  createDismissDependency,
  createDismissDependencyWithCleanup,
  dismissDependency
} from './dismiss-dependency.js';

export type { DismissDependency } from './dismiss-dependency.js';
