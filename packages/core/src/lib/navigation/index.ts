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
  createDestination,
  isDestinationType,
  extractDestinationState
} from './destination-reducer.js';

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

export type { StackResult } from './stack.js';

// ============================================================================
// Scoped Stores (Phase 2)
// ============================================================================

export {
  scopeToDestination,
  scopeToOptional
} from './scope-to-destination.js';

export type { ScopedDestinationStore } from './scope-to-destination.js';

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
