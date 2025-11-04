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
export type { PresentationAction, StackAction, Presentation, Stack, PresentationState, PresentationEvent } from './types.js';
export { PresentationAction as PresentationActionHelpers, StackAction as StackActionHelpers } from './types.js';
export { ifLet, ifLetPresentation } from './if-let.js';
export { createDestinationReducer, createDestination, isDestinationType, extractDestinationState } from './destination-reducer.js';
export type { DestinationState, DestinationReducerMap } from './destination-reducer.js';
export { matchPresentationAction, isActionAtPath, matchPaths, extractDestinationOnAction } from './matchers.js';
export type { CasePath } from './matchers.js';
export { push, pop, popToRoot, setPath, handleStackAction, topScreen, rootScreen, canGoBack, stackDepth } from './stack.js';
export type { StackResult } from './stack.js';
export { scopeToDestination, scopeToOptional } from './scope-to-destination.js';
export type { ScopedDestinationStore } from './scope-to-destination.js';
export { scopeToElement } from './scope-to-element.js';
export { integrate } from './integrate.js';
export { scopeTo } from './scope.js';
export type { ScopedStore } from './scope.js';
export { createDismissDependency, createDismissDependencyWithCleanup, dismissDependency } from './dismiss-dependency.js';
export type { DismissDependency } from './dismiss-dependency.js';
//# sourceMappingURL=index.d.ts.map