/**
 * Composition utilities for Composable Svelte.
 *
 * This module exports utilities for composing reducers:
 * - scope(): Embed child reducers into parent reducers
 * - scopeAction(): Helper for common scoped composition pattern
 * - combineReducers(): Combine multiple slice reducers
 */
export { scope, scopeAction } from './scope.js';
export type { StateLens, StateUpdater, ActionPrism, ActionEmbedder } from './scope.js';
export { combineReducers } from './combine-reducers.js';
//# sourceMappingURL=index.d.ts.map