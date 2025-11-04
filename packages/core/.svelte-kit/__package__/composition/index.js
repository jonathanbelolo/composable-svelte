/**
 * Composition utilities for Composable Svelte.
 *
 * This module exports utilities for composing reducers:
 * - scope(): Embed child reducers into parent reducers
 * - scopeAction(): Helper for common scoped composition pattern
 * - combineReducers(): Combine multiple slice reducers
 * - forEach(): Manage dynamic collections of child reducers
 * - forEachElement(): Simplified forEach for standard pattern
 */
export { scope, scopeAction } from './scope.js';
export { combineReducers } from './combine-reducers.js';
export { forEach, forEachElement, elementAction } from './for-each.js';
